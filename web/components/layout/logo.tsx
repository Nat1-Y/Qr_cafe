import { CoffeeIcon } from "lucide-react";

// Cup in a peach circle — the Buna mark.
export default function Logo() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
      <CoffeeIcon className="size-[18px]" />
    </div>
  );
}
