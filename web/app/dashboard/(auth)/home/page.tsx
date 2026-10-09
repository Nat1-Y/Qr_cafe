"use client";

import { useEffect, useMemo, useState } from "react";
import {
  UtensilsCrossedIcon,
  BoxesIcon,
  ReceiptTextIcon,
  ArmchairIcon,
  TrendingUpIcon,
  WalletIcon,
  ClockIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DateFilterBar } from "@/components/date-filter-bar";
import { Menu, Inventory, Tables, Orders, Payments } from "@/lib/resources";
import { birr, shortDate } from "@/lib/format";
import { salesSplit, monthRange, rangeBounds } from "@/lib/profit";

const withinRange = (value: any, fromDt: Date | null, toDt: Date | null) => {
  if (!fromDt && !toDt) return true;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  if (fromDt && dt < fromDt) return false;
  if (toDt && dt > toDt) return false;
  return true;
};

export default function HomePage() {
  const [stats, setStats] = useState({ menu: 0, inventory: 0, tables: 0, orders: 0 });
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => monthRange().from);
  const [dateTo, setDateTo] = useState(() => monthRange().to);

  useEffect(() => {
    Promise.all([
      Menu.items().catch(() => []),
      Inventory.list().catch(() => []),
      Tables.list().catch(() => []),
      // Organization orders settle on their own credit ledger, not as cash
      // sales — never count them toward the dashboard's totals/recent list.
      Orders.list({ exclude_organization: "1" }).catch(() => []),
      Payments.history().catch(() => []),
    ])
      .then(([menu, inv, tables, ords, pays]) => {
        setStats({
          menu: menu.length,
          inventory: inv.length,
          tables: tables.length,
          orders: ords.length,
        });
        setOrders(Array.isArray(ords) ? ords : []);
        setPayments(Array.isArray(pays) ? pays : []);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { sales, recent } = useMemo(() => {
    const { fromDt, toDt } = rangeBounds(dateFrom, dateTo);
    const inRange = orders.filter((o) => withinRange(o?.created_at, fromDt, toDt));
    return {
      sales: salesSplit(orders, payments, fromDt, toDt),
      recent: inRange.slice(0, 8),
    };
  }, [orders, payments, dateFrom, dateTo]);

  const todayCards = [
    {
      label: "Revenue",
      value: sales.paid,
      hint: "Collected",
      icon: TrendingUpIcon,
      valueClass: "text-emerald-600 dark:text-emerald-500",
    },
    {
      label: "Unpaid sales",
      value: sales.unpaid,
      hint: "Outstanding",
      icon: ClockIcon,
      valueClass: "text-amber-600 dark:text-amber-500",
    },
    {
      label: "Total sales",
      value: sales.total,
      hint: "Paid + unpaid",
      icon: WalletIcon,
      valueClass: "",
    },
  ];

  const cards = [
    { label: "Menu items", value: stats.menu, icon: UtensilsCrossedIcon },
    { label: "Inventory items", value: stats.inventory, icon: BoxesIcon },
    { label: "Orders", value: stats.orders, icon: ReceiptTextIcon },
    { label: "Tables", value: stats.tables, icon: ArmchairIcon },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A snapshot of the selected branch."
      />

      <Card>
        <CardContent className="pt-6">
          <DateFilterBar
            defaultPreset="month"
            allLabel="All time"
            viewingPrefix="Viewing:"
            onChange={(range) => {
              setDateFrom(range.from ?? "");
              setDateTo(range.to ?? "");
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {todayCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <>
                  <div className={`text-2xl font-semibold ${c.valueClass}`}>
                    {birr(c.value)}
                  </div>
                  <p className="text-muted-foreground text-xs">{c.hint}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-3xl font-semibold">{c.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No orders in this range.
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.id?.slice(0, 8)}</TableCell>
                    <TableCell className="capitalize">{o.type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="muted" className="capitalize">{o.status}</Badge>
                    </TableCell>
                    <TableCell>{birr(o.total_amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{shortDate(o.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
