"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users } from "@/lib/resources";
import { CONFIGURABLE_ROLES } from "@/lib/permissions";
import { friendlyError } from "@/lib/errors";

/**
 * Row action giving the owner full control over a staff account: change their
 * role and reset their login. The reset path does NOT require the staff member's
 * current secret (they may have forgotten it) — it's authorized by the owner's
 * branch-scoped session via POST /users/:id/reset-password, while the role goes
 * through PATCH /users/:id/role.
 */
export function ManageAccessAction({
  userId,
  userName,
  currentRole,
  onSaved,
}: {
  userId: string;
  userName: string;
  currentRole: string;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(currentRole);
  const [authMode, setAuthMode] = useState<"password" | "pin">("password");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  // Reset the form each time the dialog opens so stale input never leaks across
  // staff rows.
  useEffect(() => {
    if (!open) return;
    setRole(currentRole);
    setAuthMode("password");
    setPassword("");
    setPin("");
  }, [open, currentRole]);

  async function save() {
    const roleChanged = role && role !== currentRole;
    const resettingLogin = authMode === "password" ? !!password : !!pin;

    if (!roleChanged && !resettingLogin) {
      toast.error("Change the role, or type a new password or PIN first.");
      return;
    }
    if (authMode === "password" && password && password.length < 6) {
      toast.error("Password needs at least 6 characters.");
      return;
    }
    if (authMode === "pin" && pin && !/^\d{4}$/.test(pin)) {
      toast.error("PIN must be 4 numbers.");
      return;
    }

    setSaving(true);
    try {
      if (roleChanged) {
        await Users.changeRole(userId, role);
      }
      if (resettingLogin) {
        await Users.resetPassword(
          userId,
          authMode === "password" ? { password } : { pin },
        );
      }
      toast.success("Access saved");
      setOpen(false);
      await onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, "Couldn't save access. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <KeyRound />
        Manage access
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage access — {userName}</DialogTitle>
            <DialogDescription>
              Change this person&apos;s role or give them a new password or PIN. Leave the
              password and PIN empty to keep their sign-in as it is.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {/* Keep the current role selectable even if it isn't a
                    configurable one (e.g. a legacy role). */}
                {!CONFIGURABLE_ROLES.some((r) => r.value === currentRole) &&
                currentRole ? (
                  <option value={currentRole}>{currentRole}</option>
                ) : null}
                {CONFIGURABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>New password or PIN</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={authMode === "password" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => {
                    setAuthMode("password");
                    setPin("");
                  }}
                >
                  Password
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={authMode === "pin" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => {
                    setAuthMode("pin");
                    setPassword("");
                  }}
                >
                  4-number PIN
                </Button>
              </div>
              {authMode === "password" ? (
                <Input
                  type="password"
                  placeholder="New password (at least 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              ) : (
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="New 4-number PIN"
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
