import React from 'react';
import { cn } from '@/lib/utils';

const BRANCH_NAME = import.meta.env.VITE_BRANCH_NAME || '';

interface BranchBadgeProps {
  className?: string;
}

const BranchBadge: React.FC<BranchBadgeProps> = ({ className = '' }) => {
  if (!BRANCH_NAME) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-highlight px-2.5 py-0.5 text-eyebrow text-highlight-foreground',
        className,
      )}
    >
      {BRANCH_NAME}
    </span>
  );
};

export default BranchBadge;
