import { cn } from "@/lib/utils";

/** One plain line, one action. Optional small monochrome line icon. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}>
      {icon && (
        <div className="mb-3 text-muted-foreground [&_svg]:size-6 [&_svg]:stroke-[1.5]">{icon}</div>
      )}
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
