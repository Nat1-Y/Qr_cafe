export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  /** Muted line of context under the title, e.g. "Friday, 9 October · 24 open orders". */
  description?: React.ReactNode;
  /** Small olive label above the title. */
  eyebrow?: React.ReactNode;
  /** Right side: a pill search and one primary pill action. */
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-title">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">{action}</div>
      )}
    </div>
  );
}
