"use client";

import { PanelLeftIcon } from "lucide-react";

import ThemeSwitch from "@/components/layout/header/theme-switch";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { BranchSwitcher } from "@/components/layout/branch-switcher";

// A quiet row above the page, not a bar: sidebar toggle, branch, theme.
export function SiteHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 bg-background px-4 md:px-8">
      <Button onClick={toggleSidebar} size="icon" variant="ghost" className="-ml-2" aria-label="Toggle sidebar">
        <PanelLeftIcon />
      </Button>
      <BranchSwitcher />
      <div className="ml-auto flex items-center gap-1">
        <ThemeSwitch />
      </div>
    </header>
  );
}
