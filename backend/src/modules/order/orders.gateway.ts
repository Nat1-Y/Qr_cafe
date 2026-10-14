import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Namespace, Socket } from "socket.io";
import { DevicesService } from "../devices/devices.service";
import { toGuestOrder } from "../../common/ordering/guest-order";

/** A QR guest's private room on the /customer namespace. */
export function guestRoom(sessionId: string) {
  return `cs:${sessionId}`;
}

/**
 * Real-time push channel for order events. Cashier/kitchen clients open a
 * socket on the `/orders` namespace and are placed into a room scoped to their
 * branch. When a waiter creates an order, OrderService calls notifyNewOrder()
 * which fans the event out only to that branch's room — so a cashier is
 * notified instantly and never sees another tenant's traffic.
 *
 * Clients authenticate the same way the REST API pins a device: a device token
 * (handshake.auth.deviceToken or the x-device-token header) is resolved to a
 * branch. Owner/admin clients without a device token may pass an explicit
 * branchId in handshake.auth.
 */
@WebSocketGateway({
  namespace: "/orders",
  cors: { origin: "*" },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(private readonly devices: DevicesService) {}

  async handleConnection(client: Socket) {
    try {
      const auth = (client.handshake.auth ?? {}) as Record<string, unknown>;
      const token =
        (auth.deviceToken as string | undefined) ||
        (client.handshake.headers["x-device-token"] as string | undefined);

      let branchId: string | null = null;
      if (token) {
        const tenant = await this.devices.resolveToken(String(token));
        branchId = tenant?.branchId ?? null;
      }
      // Fallback for clients that aren't device-enrolled (e.g. owner console).
      if (!branchId && auth.branchId) branchId = String(auth.branchId);

      if (!branchId) {
        this.logger.warn(
          `Rejecting order socket ${client.id}: could not resolve a branch`,
        );
        client.disconnect(true);
        return;
      }

      client.data.branchId = branchId;
      await client.join(this.room(branchId));
      this.logger.log(`Order socket ${client.id} joined ${this.room(branchId)}`);
    } catch (err) {
      this.logger.error(`Order socket ${client.id} connection failed`, err);
      client.disconnect(true);
    }
  }

  /** Push a freshly created order to every client watching its branch. */
  notifyNewOrder(branchId: string | null | undefined, order: unknown) {
    if (!branchId || !this.server) return;
    this.server.to(this.room(branchId)).emit("new_order", { order });
    this.notifyGuest(order);
  }

  /**
   * Push an updated order to every client watching its branch. Used when an
   * order changes server-side after creation — e.g. a web cashier confirms or
   * settles its payment — so a POS reading from its local DB reflects the new
   * status instantly instead of waiting for the next pull.
   */
  notifyOrderUpdated(branchId: string | null | undefined, order: unknown) {
    if (!branchId || !this.server) return;
    this.server.to(this.room(branchId)).emit("order_updated", { order });
    this.notifyGuest(order);
  }

  /**
   * Push an item-addition event to every client watching its branch — lets a
   * POS print the added items immediately instead of waiting for the next
   * catch-up pull.
   */
  notifyItemsAdded(
    branchId: string | null | undefined,
    payload: { order: unknown; addition: unknown },
  ) {
    if (!branchId || !this.server) return;
    this.server.to(this.room(branchId)).emit("order_items_added", payload);
    this.notifyGuest(payload.order);
  }

  /**
   * QR orders: also send the guest view (no staff data) to the ordering
   * guest's own session room on the /customer namespace — never a branch room.
   */
  notifyGuest(order: unknown) {
    const sessionId = (order as { customer_session_id?: string | null } | null)
      ?.customer_session_id;
    if (!sessionId) return;
    try {
      this.server.server
        ?.of("/customer")
        .to(guestRoom(sessionId))
        .emit("order_updated", {
          order: toGuestOrder(order as Record<string, unknown>),
        });
    } catch (err) {
      this.logger.warn(`Guest push failed: ${(err as Error)?.message}`);
    }
  }

  /** A guest asked for a waiter or the bill (QR ordering). */
  notifyAssist(branchId: string | null | undefined, request: unknown) {
    if (!branchId || !this.server) return;
    this.server.to(this.room(branchId)).emit("assist_request", { request });
  }

  /** A staff member handled an assist request — clear it on every screen. */
  notifyAssistDismissed(branchId: string | null | undefined, id: string) {
    if (!branchId || !this.server) return;
    this.server.to(this.room(branchId)).emit("assist_dismissed", { id });
  }

  private room(branchId: string) {
    return `branch:${branchId}`;
  }
}
