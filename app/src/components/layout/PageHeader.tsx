import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  /** Muted line of context under the title, e.g. "Friday, 9 October · 24 open orders". */
  description?: React.ReactNode;
  /** Small olive label above the title. */
  eyebrow?: React.ReactNode;
  /** Right side: a pill search and one primary pill action. */
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, eyebrow, actions, className }) => {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-title">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
