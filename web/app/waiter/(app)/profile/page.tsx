"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  KeyRound,
  LogOut,
  Pencil,
  Save,
  Shield,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import BranchBadge from "@/components/waiter/BranchBadge";
import { useWaiterAuth } from "@/components/waiter/auth-context";
import { waiterServices } from "@/lib/waiter/api";
import { roleLabel } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { friendlyError } from "@/lib/errors";

// waiterApi rejects with an axios-shaped `{ message }` object, but a thrown
// Error is also possible — friendlyError() words either for people.
const errMessage = (e: unknown, fallback: string) => friendlyError(e, fallback);

export default function WaiterProfilePage() {
  const router = useRouter();
  const { user, loading, logout, updateUser } = useWaiterAuth();

  // Account info edit state
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");

  // Change PIN state
  const [savingPin, setSavingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? "");
      setUsername(user.username ?? "");
    }
  }, [user]);

  function cancelEdit() {
    setFullName(user?.full_name ?? "");
    setUsername(user?.username ?? "");
    setEditing(false);
  }

  async function saveProfile() {
    if (!user) return;
    if (!fullName.trim()) return toast.error("Enter your full name.");
    if (username.trim().length < 3)
      return toast.error("Username needs at least 3 letters.");

    setSavingProfile(true);
    try {
      const res = await waiterServices.account.updateProfile(user.id, {
        full_name: fullName.trim(),
        username: username.trim(),
      });
      const updated = res.data?.user ?? {};
      updateUser({
        ...user,
        full_name: updated.full_name ?? fullName.trim(),
        username: updated.username ?? username.trim(),
      });
      setEditing(false);
      toast.success("Profile saved");
    } catch (e) {
      toast.error(errMessage(e, "Couldn't save your profile. Please try again."));
    } finally {
      setSavingProfile(false);
    }
  }

  function isValidPin(pin: string) {
    return /^\d{4}$/.test(pin);
  }

  async function savePin() {
    if (!user) return;
    if (!currentPin) return toast.error("Enter your current PIN.");
    if (!isValidPin(newPin)) return toast.error("New PIN must be 4 numbers.");
    if (newPin !== confirmPin)
      return toast.error("The two new PINs don't match.");

    setSavingPin(true);
    try {
      await waiterServices.account.changePin(user.id, currentPin, newPin);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast.success("PIN changed");
    } catch (e) {
      toast.error(errMessage(e, "Couldn't change your PIN. Please try again."));
    } finally {
      setSavingPin(false);
    }
  }

  const handleLogout = () => {
    logout();
    router.push("/waiter/login");
  };

  const initials = (user?.full_name || user?.username || "?")
    .slice(0, 2)
    .toUpperCase();

  // Restrict PIN fields to up to 4 digits as the user types.
  const onPinChange =
    (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter(e.target.value.replace(/\D/g, "").slice(0, 4));

  const pinInputProps = {
    type: "tel" as const,
    inputMode: "numeric" as const,
    maxLength: 4,
    placeholder: "••••",
    style: { WebkitTextSecurity: "disc" } as React.CSSProperties,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="My profile"
        description="Your name and sign-in PIN."
        action={
          <>
            <BranchBadge />
            <Button variant="outline" className="h-12" onClick={() => router.push("/waiter")}>
              <ArrowLeft />
              Home
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-12 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out">
              <LogOut className="size-5" />
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identity card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            {loading ? (
              <>
                <Skeleton className="size-24 rounded-full" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <Avatar className="size-24">
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    {user?.full_name || user?.username}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    @{user?.username}
                  </p>
                </div>
                <Badge variant="secondary" className="gap-1.5">
                  <Shield className="size-3.5" />
                  {roleLabel(user?.role)}
                </Badge>
              </>
            )}
          </CardContent>
        </Card>

        {/* Your details */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Your details</CardTitle>
              <CardDescription>Your name and username.</CardDescription>
            </div>
            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={savingProfile}
                  onClick={cancelEdit}>
                  <X />
                  Cancel
                </Button>
                <Button size="sm" disabled={savingProfile} onClick={saveProfile}>
                  <Save />
                  Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <div className="relative">
                <User className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  id="full_name"
                  className="pl-9"
                  value={fullName}
                  disabled={!editing || savingProfile}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <AtSign className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  id="username"
                  className="pl-9"
                  value={username}
                  disabled={!editing || savingProfile}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <div className="relative">
                <Shield className="text-muted-foreground absolute top-2.5 left-3 size-4" />
                <Input
                  className="pl-9"
                  value={roleLabel(user?.role)}
                  disabled
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Only your manager can change your role.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change PIN */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            Change PIN
          </CardTitle>
          <CardDescription>
            You sign in with this 4-number PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current_pin">Current PIN</Label>
            <Input
              id="current_pin"
              {...pinInputProps}
              value={currentPin}
              disabled={savingPin}
              onChange={onPinChange(setCurrentPin)}
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new_pin">New PIN</Label>
              <Input
                id="new_pin"
                {...pinInputProps}
                value={newPin}
                disabled={savingPin}
                onChange={onPinChange(setNewPin)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_pin">Confirm new PIN</Label>
              <Input
                id="confirm_pin"
                {...pinInputProps}
                value={confirmPin}
                disabled={savingPin}
                onChange={onPinChange(setConfirmPin)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={savingPin} onClick={savePin}>
              <KeyRound />
              Save PIN
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
