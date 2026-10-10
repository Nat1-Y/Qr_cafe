"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/auth";
import { AuthSplitLayout } from "@/components/auth-split-layout";
import { friendlyError } from "@/lib/errors";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      toast.success("Signed in");
      router.push(
        user.role === "super_admin"
          ? "/dashboard/overview"
          : "/dashboard/home",
      );
    } catch (err: any) {
      toast.error(friendlyError(err, "Couldn't sign in. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout
      headline="Every branch, one place to look after them."
      subline="Owners sign in here. Branch staff, please use the branch sign-in.">
      <div className="mb-8">
        <h1 className="text-title text-foreground">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your owner account.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. abebe"
            autoComplete="username"
            className="h-11"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-11 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}>
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" size="charge" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Branch manager or food &amp; drinks manager?{" "}
        <Link href="/branch" className="font-semibold text-primary underline-offset-4 hover:underline">
          Branch sign-in
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
