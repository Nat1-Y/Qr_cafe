import React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Optional small monochrome line icon. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** One plain line, one action. */
const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 text-muted-foreground [&_svg]:h-6 [&_svg]:w-6 [&_svg]:stroke-[1.5]">{icon}</div>
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
