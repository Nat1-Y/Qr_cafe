import React from "react";
import { cookies } from "next/headers";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/sidebar/app-sidebar";
import { SiteHeader } from "@/components/layout/header";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { PermissionGate } from "@/components/permission-gate";

export default async function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const defaultOpen =
    cookieStore.get("sidebar_state")?.value === "true" ||
    cookieStore.get("sidebar_state") === undefined;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 52)",
          "--header-height": "calc(var(--spacing) * 14)"
        } as React.CSSProperties
      }>
      <AppSidebar />
      <SidebarInset>
        <ImpersonationBanner />
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main px-4 pt-2 pb-8 md:px-8">
            <PermissionGate>{children}</PermissionGate>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
