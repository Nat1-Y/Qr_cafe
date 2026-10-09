import * as React from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

// Form fields use a 12px radius; search fields are full pills.
const fieldClasses =
  "flex h-10 w-full border border-input bg-card px-3.5 py-2 text-base text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(fieldClasses, type === "search" ? "rounded-full px-4" : "rounded-field", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  wrapperClassName?: string
}

/** Pill search field with a leading icon. */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, wrapperClassName, ...props }, ref) => (
    <div className={cn("relative w-full", wrapperClassName)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        className={cn(fieldClasses, "rounded-full pl-10 pr-4 [&::-webkit-search-cancel-button]:hidden", className)}
        {...props}
      />
    </div>
  )
)
SearchInput.displayName = "SearchInput"

export { Input, SearchInput }
