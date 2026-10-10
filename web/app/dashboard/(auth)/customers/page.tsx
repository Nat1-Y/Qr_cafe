"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, Loader2, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { OrgCustomerCell } from "@/components/organizations/org-customer-cell";
import { Organizations, Orders, Settings, Users } from "@/lib/resources";
import { getUser } from "@/lib/auth";
import { isAllAccessRole } from "@/lib/permissions";
import { formatETB, shortDate } from "@/lib/format";

type Org = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  credit_balance: string;
  is_active: boolean;
};

const columns: Column<Org>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "contact_name", label: "Contact" },
  { key: "phone", label: "Phone" },
  { key: "credit_balance", label: "Credit", render: (r) => formatETB(r.credit_balance) },
  {
    key: "is_active",
    label: "Status",
    render: (r) => (
      <Badge variant={r.is_active ? "success" : "muted"}>
        {r.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

type Employee = {
  id: string;
  full_name?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
};

function employeeLabel(u: Employee) {
  const composed = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return u.full_name || composed || u.username || "Unnamed";
}

// Which waiters/cashiers may attach an order to an organization while placing
// it. Distinct from the "Cashiers can manage organization orders" toggle in
// Settings → Preferences (a branch-wide, cashier-only switch for reaching
// these Organizations screens at all): this is per-employee, covers both
// waiters and cashiers, and gates the inline order-creation flow instead
// (app/'s order screens, the waiter self-service portal, and
// /dashboard/orders/new?org=).
function OrgOrderAccessCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, allowed] = await Promise.all([
        Users.list(),
        Settings.organizationOrderAllowedUsers(),
      ]);
      const eligible = (Array.isArray(all) ? all : []).filter((u: Employee) =>
        ["cafe_waiter", "cashier"].includes(String(u.role)),
      );
      setEmployees(eligible);
      setSelected(new Set((allowed ?? []).map(String)));
    } catch (e: any) {
      toast.error(e?.message || "Failed to load organization order access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await Settings.updateOrganizationOrderAllowedUsers(Array.from(selected));
      toast.success("Organization order access updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save organization order access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization order access</CardTitle>
        <CardDescription>
          Only these waiters and cashiers can attach an order to an
          organization while placing it. everyone else's order screen won't
          offer the option. owners/admins are never restricted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm font-medium">Loading…</span>
          </div>
        ) : employees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No waiters or cashiers found for this branch.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {employees.map((u) => {
              const on = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {employeeLabel(u)}
                  <span className="ml-1.5 text-xs opacity-70">
                    ({u.role === "cafe_waiter" ? "waiter" : "cashier"})
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save access
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationsTab() {
  return (
    <div className="space-y-6">
      <ResourceManager<Org>
        title="Customers"
        description="Corporate / credit accounts (organizations)."
        createLabel="New customer"
        columns={columns}
        searchKeys={["name", "contact_name", "phone"]}
        searchPlaceholder="Search customers…"
        filters={[
          {
            key: "is_active",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
            match: (r, v) => (v === "active" ? r.is_active : !r.is_active),
          },
        ]}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "contact_name", label: "Contact name" },
          { key: "phone", label: "Phone" },
          { key: "email", label: "Email" },
          { key: "address", label: "Address" },
          { key: "notes", label: "Notes" },
        ]}
        load={Organizations.list}
        create={Organizations.create}
        update={Organizations.update}
        remove={Organizations.remove}
        rowActions={(r) => (
          <Button variant="ghost" size="icon" asChild title="Open account">
            <Link href={`/dashboard/customers/${r.id}`}>
              <ArrowUpRightIcon />
            </Link>
          </Button>
        )}
      />
      <OrgOrderAccessCard />
    </div>
  );
}

type PaymentFilter = "active" | "paid" | "all";

/** An order still owes money unless it's cancelled or already paid. */
function isOrderUnpaid(order: any) {
  const status = String(order?.status || "").toLowerCase();
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  return status !== "cancelled" && status !== "paid" && paymentStatus !== "paid";
}

/**
 * Consolidated view of orders across every organization — the owner's
 * dedicated tab for reviewing what cashiers/waiters have attached and
 * deciding what to honor. Deliberately separate from /dashboard/orders
 * (which excludes these via exclude_organization) since confirming here is
 * what actually posts the credit deduction against an organization; an
 * unconfirmed order sits on the org's account without ever touching its
 * balance. Mirrors the app/'s OrganizationOrders.tsx and the /cashier
 * portal's read-only view (same idea, same per-org fetch-and-merge approach
 * — there's no single cross-org backend endpoint for this).
 */
function OrganizationOrdersTab() {
  const canConfirmPayment = isAllAccessRole(getUser()?.role);

  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [orgFilter, setOrgFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("active");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orgs = await Organizations.list();
      setOrganizations(orgs);

      const results = await Promise.allSettled(
        orgs.map(async (org: any) => {
          const list = await Organizations.orders(org.id);
          return (Array.isArray(list) ? list : []).map((o: any) => ({
            ...o,
            __orgId: org.id,
            __orgName: org.name,
          }));
        }),
      );
      const merged = results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      merged.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      setOrders(merged);
    } catch (e: any) {
      toast.error(e.message || "Failed to load organization orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.status) set.add(String(o.status));
    return Array.from(set).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (orgFilter !== "all" && String(o.__orgId) !== orgFilter) return false;
      if (statusFilter !== "all" && String(o.status) !== statusFilter) return false;
      if (paymentFilter === "active" && !isOrderUnpaid(o)) return false;
      if (paymentFilter === "paid" && isOrderUnpaid(o)) return false;
      if (term) {
        const haystack = `${o.order_number ?? ""} ${o.id ?? ""} ${o.__orgName ?? ""} ${
          o.meta?.org_customer_name ?? ""
        } ${o.meta?.org_customer_phone ?? ""} ${o.meta?.org_customer_notes ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, orgFilter, statusFilter, paymentFilter, search]);

  const activeCount = useMemo(() => orders.filter(isOrderUnpaid).length, [orders]);

  async function confirmPayment(orderId: string) {
    setConfirmingId(orderId);
    try {
      await Orders.confirmOrganizationPayment(orderId, getUser()?.id);
      toast.success("Order confirmed");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to confirm order");
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Organization</label>
            <select
              className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-48"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
            >
              <option value="all">All organizations</option>
              {organizations.map((org) => (
                <option key={org.id} value={String(org.id)}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Payment</label>
            <select
              className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-36"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
            >
              <option value="active">Active (unpaid)</option>
              <option value="paid">Paid</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Status</label>
            <select
              className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-36"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-muted-foreground text-xs">Search</label>
            <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order #, org, or customer" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">{activeCount} active</Badge>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCwIcon className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                    No organization orders match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => (
                  <TableRow key={`${order.__orgId}-${order.id}`}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/customers/${order.__orgId}`}
                        className="hover:underline"
                      >
                        #{order.order_number ?? order.id?.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{order.__orgName || "—"}</TableCell>
                    <TableCell>
                      <OrgCustomerCell order={order} />
                    </TableCell>
                    <TableCell className="capitalize">{order.status || "—"}</TableCell>
                    <TableCell>{order.payment_status || "—"}</TableCell>
                    <TableCell>
                      {formatETB(order.total_amount)}
                      {(order.is_price_override === true || order.is_price_override === 1) && (
                        <Badge variant="outline" className="ml-2">
                          Custom price
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortDate(order.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isOrderUnpaid(order) ? (
                        <Badge variant="success">Paid</Badge>
                      ) : canConfirmPayment ? (
                        <Button
                          size="sm"
                          disabled={confirmingId === order.id}
                          onClick={() => confirmPayment(order.id)}
                        >
                          {confirmingId === order.id ? "Confirming…" : "Confirm"}
                        </Button>
                      ) : (
                        <Badge variant="outline">Awaiting owner</Badge>
                      )}
                    </TableCell>
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

export default function CustomersPage() {
  return (
    <Tabs defaultValue="organizations" className="space-y-6">
      <TabsList>
        <TabsTrigger value="organizations">Organizations</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
      </TabsList>
      <TabsContent value="organizations">
        <OrganizationsTab />
      </TabsContent>
      <TabsContent value="orders">
        <OrganizationOrdersTab />
      </TabsContent>
    </Tabs>
  );
}
