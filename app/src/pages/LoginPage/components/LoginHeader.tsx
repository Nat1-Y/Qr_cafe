import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BranchBadge from '@/components/common/BranchBadge';

interface LoginHeaderProps {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  userInitials?: string;
  userRole?: string;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({
  title,
  subtitle,
  showLogo = false,
  showBackButton = false,
  onBack,
  userInitials,
  userRole
}) => {
  return (
    <div className="space-y-4">
      {showBackButton && onBack && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-3 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      )}

      {showLogo && (
        <img src="/assets/logo.png?v=8" alt="Logo" className="h-14 w-14 object-contain" />
      )}

      {userInitials && userRole && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-highlight text-lg font-semibold text-highlight-foreground">
          {userInitials}
        </span>
      )}

      <BranchBadge />

      <div>
        <h1 className="text-title text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
};
