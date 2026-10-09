import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Form fields use a 12px radius; search fields are full pills.
const fieldClasses =
  "h-10 w-full min-w-0 border border-input bg-card px-3.5 py-2 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClasses, type === "search" ? "rounded-full px-4" : "rounded-field", className)}
      {...props}
    />
  )
}

/** Pill search field with a leading icon. */
function SearchInput({
  className,
  wrapperClassName,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative w-full", wrapperClassName)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        data-slot="input"
        className={cn(fieldClasses, "rounded-full pr-4 pl-10 [&::-webkit-search-cancel-button]:hidden", className)}
        {...props}
      />
    </div>
  )
}

export { Input, SearchInput }
