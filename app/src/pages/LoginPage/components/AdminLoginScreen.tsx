import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ButtonSpinner } from '@/components/common/LoadingSpinner';
import BranchBadge from '@/components/common/BranchBadge';

interface AdminLoginScreenProps {
  formData: { username: string; password: string };
  errors: Record<string, string>;
  isLoading: boolean;
  showPassword: boolean;
  disabled?: boolean;
  onUsernameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasswordChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  formData,
  errors,
  isLoading,
  showPassword,
  disabled = false,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
}) => {
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <BranchBadge className="mb-3" />
        <h1 className="text-title text-foreground">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your staff username and password.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="admin-username">Username</Label>
          <Input
            id="admin-username"
            name="username"
            type="text"
            value={formData.username}
            onChange={onUsernameChange}
            className="h-11"
            placeholder="e.g. selam"
            disabled={isLoading || disabled}
            autoComplete="username"
            aria-invalid={!!errors.username}
            autoFocus
          />
          {errors.username && <p className="text-meta text-destructive">{errors.username}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <div className="relative">
            <Input
              id="admin-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={onPasswordChange}
              className="h-11 pr-12"
              disabled={isLoading || disabled}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              onClick={onTogglePassword}
              disabled={isLoading || disabled}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-meta text-destructive">{errors.password}</p>}
        </div>

        <Button
          type="submit"
          size="charge"
          disabled={isLoading || disabled || !formData.username.trim() || !formData.password}
          className="w-full"
        >
          {isLoading ? (
            <>
              <ButtonSpinner />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </form>
    </div>
  );
};
