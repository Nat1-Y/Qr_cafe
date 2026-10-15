"use client";

import Link from "next/link";
import {
  ChevronRightIcon,
  DatabaseIcon,
  MonitorSmartphoneIcon,
  QrCodeIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

type SettingLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const SECTIONS: SettingLink[] = [
  {
    title: "Profile",
    description: "Your name, username, and password.",
    href: "/dashboard/profile",
    icon: UserIcon,
  },
  {
    title: "Order rules",
    description: "How the tills work at this branch.",
    href: "/dashboard/settings/preferences",
    icon: SlidersHorizontalIcon,
  },
  {
    title: "QR ordering",
    description: "Guests order from their table by scanning a code.",
    href: "/dashboard/settings/qr-ordering",
    icon: QrCodeIcon,
  },
  {
    title: "Payment types",
    description: "The ways customers can pay.",
    href: "/dashboard/settings/payment-methods",
    icon: WalletCardsIcon,
  },
  {
    title: "Roles and access",
    description: "What each staff role can do.",
    href: "/dashboard/settings/roles",
    icon: ShieldIcon,
  },
  {
    title: "Devices",
    description: "Tills and phones set up for this branch.",
    href: "/dashboard/settings/devices",
    icon: MonitorSmartphoneIcon,
  },
  {
    title: "Delete old data",
    description: "Delete orders and payments for this branch for good.",
    href: "/dashboard/settings/data-management",
    icon: DatabaseIcon,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="How this business runs: payments, delivery, roles and devices."
      />

      <Card className="gap-0 overflow-hidden py-0">
        <ul className="divide-y divide-border">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex items-center gap-4 px-5 py-4 transition-colors outline-none hover:bg-row-hover focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset">
                <s.icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.description}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
