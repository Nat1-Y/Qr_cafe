"use client";

import { useEffect, useState } from "react";
import {
  Building2Icon,
  CheckCircle2Icon,
  StoreIcon,
  MonitorSmartphoneIcon,
  UsersIcon,
  ReceiptTextIcon,
  BanknoteIcon,
} from "lucide-react";
import { toast } from "sonner";


import { apiFetch } from "@/lib/api";
import { formatETB } from "@/lib/format";
import { StatCards } from "@/components/stat-cards";
import { PageHeader } from "@/components/page-header";

type Overview = {
  businesses: number;
  active_businesses: number;
  branches: number;
  devices: number;
  users: number;
  orders: number;
  revenue: number;
  orders_today: number;
  revenue_today: number;
};

type CardDef = {
  key: keyof Overview;
  label: string;
  icon: typeof Building2Icon;
  // Optional value formatter (defaults to the raw count) and sub-label.
  format?: (v: number) => string;
  sub?: (d: Overview) => string;
};

const cards: CardDef[] = [
  { key: "businesses", label: "Businesses", icon: Building2Icon },
  { key: "active_businesses", label: "Active", icon: CheckCircle2Icon },
  { key: "branches", label: "Branches", icon: StoreIcon },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "devices", label: "Enrolled Devices", icon: MonitorSmartphoneIcon },
  {
    key: "orders",
    label: "Total Orders",
    icon: ReceiptTextIcon,
    format: (v) => v.toLocaleString(),
    sub: (d) => `${d.orders_today.toLocaleString()} today`,
  },
  {
    key: "revenue",
    label: "Total Revenue",
    icon: BanknoteIcon,
    format: formatETB,
    sub: (d) => `${formatETB(d.revenue_today)} today`,
  },
];

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Overview>("/platform/overview")
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Platform" description="Every business on Buna, at a glance." />

      <StatCards
        loading={loading || !data}
        cards={cards.map(({ key, label, format, sub }) => ({
          label,
          value: data ? (format ? format(data[key]) : data[key]) : "",
          hint: data && sub ? sub(data) : undefined,
        }))}
      />
    </div>
  );
}
