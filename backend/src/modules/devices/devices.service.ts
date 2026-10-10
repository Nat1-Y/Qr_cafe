import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import db from "../../db/drizzle";
import { branchDevices } from "../../db/tables/branch-devices.table";
import { branches } from "../../db/tables/branches.table";
import { getTenant } from "../../common/tenant/tenant-context";

export interface DeviceTenant {
  businessId: string;
  branchId: string;
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// A device is "online" if it has checked in within this window.
const DEVICE_ONLINE_WINDOW_MS = 5 * 60 * 1000;

// Persist a device heartbeat at most this often (per device) to keep the write
// load off the request hot path. Comfortably tighter than the online window so a
// live device never flickers "offline".
const HEARTBEAT_THROTTLE_MS = 60 * 1000;

@Injectable()
export class DevicesService {
  // Long-lived device tokens are looked up on every sync request, so cache the
  // token -> tenant resolution in memory. (Revocation requires a process restart
  // or an explicit cache bust; acceptable for the device count we expect.)
  private readonly tokenCache = new Map<string, DeviceTenant>();

  // Throttles heartbeat writes so we don't UPDATE branch_devices on every single
  // request. Keyed by token hash -> the last version+time we persisted. We write
  // when the throttle window has elapsed OR the reported app version changed.
  private readonly lastHeartbeat = new Map<
    string,
    { at: number; version: string | null }
  >();

  /** Loads a branch and asserts the caller (owner/platform) may manage it. */
  private async getManageableBranch(branchId: string) {
    const tenant = getTenant();
    if (!tenant || (tenant.scope !== "owner" && tenant.scope !== "platform")) {
      throw new ForbiddenException(
        "Only an owner or platform admin can manage device enrollment.",
      );
    }

    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
    if (tenant.scope === "owner" && branch.business_id !== tenant.businessId) {
      throw new ForbiddenException("Branch does not belong to your business.");
    }
    return branch;
  }

  /**
   * Lists the devices enrolled to a branch with a computed online flag, scoped
   * to the owner's business (or any branch for platform admins).
   */
  async listForBranch(branchId: string) {
    const branch = await this.getManageableBranch(branchId);

    const rows = await db
      .select({
        id: branchDevices.id,
        name: branchDevices.name,
        status: branchDevices.status,
        last_seen_at: branchDevices.last_seen_at,
        created_at: branchDevices.created_at,
      })
      .from(branchDevices)
      .where(eq(branchDevices.branch_id, branch.id))
      .orderBy(desc(branchDevices.last_seen_at));

    const now = Date.now();
    const devices = rows.map((d) => ({
      ...d,
      online:
        d.last_seen_at != null &&
        now - new Date(d.last_seen_at).getTime() < DEVICE_ONLINE_WINDOW_MS,
    }));

    return {
      branch_id: branch.id,
      devices,
      online_count: devices.filter((d) => d.online).length,
      total: devices.length,
    };
  }

  /** Returns the branch's current reusable enrollment code (owner/platform). */
  async getEnrollmentCode(branchId: string) {
    const branch = await this.getManageableBranch(branchId);
    return { branch_id: branch.id, code: branch.enrollment_code ?? null };
  }

  /**
   * Owner/platform sets (or rotates) the branch's reusable enrollment code.
   * Devices enroll with it any number of times until it's rotated again; rotating
   * does not revoke already-enrolled devices (their tokens stay valid).
   */
  async rotateEnrollmentCode(branchId: string) {
    const branch = await this.getManageableBranch(branchId);

    const code = randomBytes(6).toString("hex").toUpperCase(); // 12 chars
    await db
      .update(branches)
      .set({ enrollment_code: code, updated_at: new Date() })
      .where(eq(branches.id, branch.id));

    return { branch_id: branch.id, code };
  }

  /**
   * A device redeems its branch's enrollment code for a long-lived token. Public
   * endpoint: possession of a valid code is the credential. The code is reusable,
   * so each call provisions a new device record/token.
   */
  async enroll(code: string, deviceName?: string) {
    const trimmed = code?.trim().toUpperCase();
    if (!trimmed) throw new BadRequestException("Enter the setup code.");

    const [branch] = await db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.enrollment_code, trimmed),
          eq(branches.is_active, true),
        ),
      )
      .limit(1);
    if (!branch) throw new BadRequestException("That setup code is wrong. Check it and try again.");

    const token = randomBytes(32).toString("hex"); // 64 chars
    await db.insert(branchDevices).values({
      business_id: branch.business_id,
      branch_id: branch.id,
      name: deviceName?.trim() || null,
      token_hash: sha256(token),
      status: "active",
      last_seen_at: new Date(),
    });

    return {
      token,
      business_id: branch.business_id,
      branch_id: branch.id,
    };
  }

  /**
   * Kicks out (deletes) an enrolled device. Owner/platform only, scoped to the
   * branch. The device's token stops resolving immediately: the row is removed
   * and the in-memory token cache is busted, so the next sync/API call from that
   * device 401s and it falls back to the enrollment screen.
   */
  async removeDevice(deviceId: string, branchId: string) {
    if (!deviceId) throw new BadRequestException("Choose a device.");
    const branch = await this.getManageableBranch(branchId);

    const [device] = await db
      .select()
      .from(branchDevices)
      .where(
        and(
          eq(branchDevices.id, deviceId),
          eq(branchDevices.branch_id, branch.id),
        ),
      )
      .limit(1);
    if (!device) throw new NotFoundException("Device not found");

    await db.delete(branchDevices).where(eq(branchDevices.id, device.id));

    // We cache by raw token (not its hash), so we can't evict a single entry —
    // clear the whole map. It re-populates lazily on the next request.
    this.tokenCache.clear();

    return { id: device.id, removed: true };
  }

  /** Resolves a device token to its tenant, or null if unknown/revoked. */
  async resolveToken(token: string): Promise<DeviceTenant | null> {
    if (!token) return null;
    const cached = this.tokenCache.get(token);
    if (cached) return cached;

    const [device] = await db
      .select()
      .from(branchDevices)
      .where(
        and(
          eq(branchDevices.token_hash, sha256(token)),
          eq(branchDevices.status, "active"),
        ),
      )
      .limit(1);
    if (!device) return null;

    const tenant: DeviceTenant = {
      businessId: device.business_id,
      branchId: device.branch_id,
    };
    this.tokenCache.set(token, tenant);
    return tenant;
  }

  /**
   * Records a device check-in: bumps last_seen_at (drives the "online" flag) and
   * stores the reported app version, so the platform monitor shows which build
   * each branch is running. Called on every device-authenticated request but
   * throttled to at most one write per device per HEARTBEAT_THROTTLE_MS unless the
   * app version changed. Best-effort — callers should not await it on the hot path.
   */
  async recordHeartbeat(token: string, appVersion?: string | null) {
    if (!token) return;
    const version = appVersion?.trim() ? appVersion.trim().slice(0, 40) : null;
    const key = sha256(token);

    const prev = this.lastHeartbeat.get(key);
    const now = Date.now();
    if (
      prev &&
      prev.version === version &&
      now - prev.at < HEARTBEAT_THROTTLE_MS
    ) {
      return;
    }
    this.lastHeartbeat.set(key, { at: now, version });

    try {
      await db
        .update(branchDevices)
        .set({ last_seen_at: new Date(), app_version: version })
        .where(eq(branchDevices.token_hash, key));
    } catch {
      // Heartbeat is best-effort telemetry; never fail the request over it. Drop
      // the throttle entry so the next request retries the write.
      this.lastHeartbeat.delete(key);
    }
  }
}
