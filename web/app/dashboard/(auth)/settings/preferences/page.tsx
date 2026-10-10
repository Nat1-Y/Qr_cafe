"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BoxesIcon, HistoryIcon, KeyRoundIcon, SlidersHorizontalIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { Inventory, Settings } from "@/lib/resources";
import { getBranchId } from "@/lib/api";
import { roleLabel } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";

// Preset lookback windows (days back from today). -1 = unlimited.
const LOOKBACK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Today only" },
  { value: 1, label: "Today + yesterday" },
  { value: 2, label: "Last 3 days" },
  { value: 6, label: "Last 7 days" },
  { value: 13, label: "Last 14 days" },
  { value: 29, label: "Last 30 days" },
  { value: -1, label: "Everything (no limit)" },
];

// Per-role history lookback: how far back each staff role can see payments/orders
// in the desktop POS and the web cashier/waiter portals. Applied on their next
// login. Owner/admin roles always see everything and aren't listed.
function HistoryLookbackCard() {
  const [map, setMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    Settings.roleHistoryLookback()
      .then((d) => setMap(d ?? {}))
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);

  async function change(role: string, days: number) {
    const prev = map;
    const next = { ...map, [role]: days };
    setMap(next);
    setSaving(role);
    try {
      const saved = await Settings.updateRoleHistoryLookback(next);
      setMap(saved ?? next);
      toast.success("Saved");
    } catch (e: any) {
      setMap(prev);
      toast.error(friendlyError(e));
    } finally {
      setSaving(null);
    }
  }

  const roles = Object.keys(map);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-5" />
          How far back each role can see
        </CardTitle>
        <CardDescription>
          How many days of past orders and payments each role can see. This works on the till and the cashier and waiter screens the next time the person signs in. Managers and owners always see everything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 py-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-44" />
            </div>
          ))}

        {!loading &&
          roles.map((role, i) => {
            const value = map[role];
            const hasPreset = LOOKBACK_OPTIONS.some((o) => o.value === value);
            return (
              <div
                key={role}
                className={`flex items-center justify-between gap-4 py-4 ${
                  i > 0 ? "border-t" : ""
                }`}>
                <div className="text-sm font-medium">{roleLabel(role)}</div>
                <select
                  className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50"
                  value={value}
                  disabled={saving === role}
                  onChange={(e) => change(role, Number(e.target.value))}>
                  {!hasPreset && (
                    <option value={value}>{value} days back</option>
                  )}
                  {LOOKBACK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

// Each toggle maps to one per-branch system_settings key on the backend.
// `value` is the raw stored boolean; `enabled` is what the switch shows (some
// keys read inverted so the UI label stays positive, e.g. "allow orders without
// a table" is stored as force_table_selection).
type Rule = {
  key: string;
  title: string;
  description: string;
  load: () => Promise<boolean>;
  save: (enabled: boolean) => Promise<unknown>;
};

const RULES: Rule[] = [
  {
    key: "force_table_selection",
    title: "Allow orders with no table",
    description:
      "When on, staff can send an order without picking a table. When off, they must pick a table or Takeaway. Takeaway is always allowed.",
    load: () =>
      Settings.tableSelection().then((d) => !d.force_table_selection),
    save: (enabled) =>
      Settings.updateTableSelection({ force_table_selection: !enabled }),
  },
  {
    key: "allow_low_stock_orders",
    title: "Allow orders when stock is low",
    description:
      "When on, staff can still order items when ingredients run low. When off, items that are out of stock can't be ordered.",
    load: () => Settings.inventory().then((d) => d.allow_low_stock_orders),
    save: (enabled) =>
      Settings.updateInventory({ allow_low_stock_orders: enabled }),
  },
  {
    key: "show_menu_inventory_availability",
    title: "Show waiters what is in stock",
    description:
      "When on, waiters see which menu items are out of stock or running low. When off, waiters don't see stock.",
    load: () =>
      Settings.menuAvailability().then(
        (d) => d.show_menu_inventory_availability,
      ),
    save: (enabled) =>
      Settings.updateMenuAvailability({
        show_menu_inventory_availability: enabled,
      }),
  },
  {
    key: "allow_cashier_manage_org_orders",
    title: "Cashiers can take company account orders",
    description:
      "When on, cashiers (not only managers) can take and pay company account orders.",
    load: () =>
      Settings.organizations().then((d) => d.allow_cashier_manage_org_orders),
    save: (enabled) =>
      Settings.updateOrganizations({
        allow_cashier_manage_org_orders: enabled,
      }),
  },
  {
    key: "enable_cashier_receipt",
    title: "Print cashier receipt",
    description:
      "When on, the till prints a receipt when an order is paid.",
    load: () => Settings.receipt().then((d) => d.enable_cashier_receipt),
    save: (enabled) =>
      Settings.updateReceipt({ enable_cashier_receipt: enabled }),
  },
  {
    key: "print_cancelled_order_tickets",
    title: "Print a ticket when an order is cancelled",
    description:
      "When on, the till prints a \"DO NOT PREPARE\" ticket in the kitchen when an order the kitchen already got is cancelled. Off at first.",
    load: () =>
      Settings.cancellationPrint().then(
        (d) => d.print_cancelled_order_tickets,
      ),
    save: (enabled) =>
      Settings.updateCancellationPrint({
        print_cancelled_order_tickets: enabled,
      }),
  },
];

// Branch cancel-order override password. Mirrors the desktop admin's "Cancel
// Order Password" card: staff are prompted for this password before cancelling
// an order. We only ever learn whether one is set, never its value.
function CancelPasswordCard() {
  const [isSet, setIsSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Settings.cancelPassword()
      .then((d) => setIsSet(!!d.is_set))
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Needs at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two entries don't match.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await Settings.updateCancelPassword(password);
      setIsSet(true);
      setPassword("");
      setConfirm("");
      toast.success("Manager PIN for cancelling saved");
    } catch (err: any) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5" />
          Manager PIN for cancelling
        </CardTitle>
        <CardDescription>
          Staff must type this to cancel an order on the till.{" "}
          {!loading &&
            (isSet
              ? "A password is currently set. Enter a new one to change it."
              : "Not set yet for this branch.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        ) : (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newCancelPassword">New password</Label>
              <Input
                id="newCancelPassword"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmCancelPassword">Confirm password</Label>
              <Input
                id="confirmCancelPassword"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm font-medium sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving || !password}>
                {saving
                  ? "Saving…"
                  : isSet
                    ? "Save password"
                    : "Set password"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// Branch printer-settings password. Cashiers are prompted for this before they
// can open the POS printer settings screen. We only ever learn whether one is
// set, never its value.
function PrinterPasswordCard() {
  const [isSet, setIsSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Settings.printerPassword()
      .then((d) => setIsSet(!!d.is_set))
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 4) {
      setError("Needs at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two entries don't match.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await Settings.updatePrinterPassword(password);
      setIsSet(true);
      setPassword("");
      setConfirm("");
      toast.success("Printer settings password saved");
    } catch (err: any) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5" />
          Printer settings password
        </CardTitle>
        <CardDescription>
          Cashiers must type this password to open printer settings on the till.{" "}
          {!loading &&
            (isSet
              ? "A password is currently set. Enter a new one to change it."
              : "No password yet, so anyone can open printer settings.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full max-w-sm" />
            <Skeleton className="h-9 w-full max-w-sm" />
          </div>
        ) : (
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPrinterPassword">New password</Label>
              <Input
                id="newPrinterPassword"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPrinterPassword">Confirm password</Label>
              <Input
                id="confirmPrinterPassword"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm font-medium sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving || !password}>
                {saving
                  ? "Saving…"
                  : isSet
                    ? "Save password"
                    : "Set password"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

type WaiterPickerItem = { id: string; name: string; unit?: string };

const WAITER_INVENTORY_PAGE_SIZE = 8;

// Which inventory items appear on the waiter sign-in page's Inventory tab
// (with quantity remaining). Waiters can view that list without logging in,
// so the owner controls exposure from here rather than per-role permissions.
// The item list is server-paginated + searched (branches can have hundreds of
// items); the selection itself is a plain id Set that survives page/search
// changes, since it's independent of what's currently rendered.
function WaiterVisibleInventoryCard() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState<WaiterPickerItem[]>([]);
  const [count, setCount] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    Settings.waiterVisibleInventory()
      .then((ids) => setSelected(new Set(ids)))
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const reload = useCallback(() => {
    setItemsLoading(true);
    const params: Record<string, any> = {
      page: page + 1,
      limit: WAITER_INVENTORY_PAGE_SIZE,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    return Inventory.page(params)
      .then((res) => {
        setRows(res.rows as WaiterPickerItem[]);
        setCount(res.count);
      })
      .catch((e: any) => toast.error(friendlyError(e)))
      .finally(() => setItemsLoading(false));
  }, [page, debouncedSearch]);

  useEffect(() => {
    reload();
  }, [reload]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((i) => next.add(i.id));
      return next;
    });
  }

  function clearPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((i) => next.delete(i.id));
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await Settings.updateWaiterVisibleInventory(Array.from(selected));
      setSelected(new Set(saved));
      toast.success("Saved");
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<WaiterPickerItem>[] = [
    {
      key: "select",
      label: "",
      className: "w-10",
      render: (item) => (
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onChange={() => toggle(item.id)}
          className="border-input accent-primary size-4 rounded"
        />
      ),
    },
    { key: "name", label: "Item" },
    {
      key: "unit",
      label: "Unit",
      className: "text-muted-foreground",
      render: (item) => item.unit || "—",
    },
  ];

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BoxesIcon className="size-5" />
          Stock waiters can see
        </CardTitle>
        <CardDescription>
          Pick which stock items show on the waiter sign-in page, with how much is left. Waiters can see this list without signing in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settingsLoaded ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full max-w-sm" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <>
            <DataTable<WaiterPickerItem>
              columns={columns}
              rows={rows}
              loading={itemsLoading}
              searchPlaceholder="Search items…"
              server={{
                total: count,
                page,
                pageSize: WAITER_INVENTORY_PAGE_SIZE,
                onPageChange: setPage,
                onSearchChange: setSearch,
              }}
              emptyMessage="No stock items at this branch yet."
              toolbar={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectPage}
                    disabled={saving}
                  >
                    Pick all on this page
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearPage}
                    disabled={saving}
                  >
                    Clear this page
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    {selected.size} selected
                  </span>
                </div>
              }
            />
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PreferencesPage() {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [hasBranch, setHasBranch] = useState(true);

  const load = useCallback(async () => {
    if (!getBranchId()) {
      setHasBranch(false);
      setLoading(false);
      return;
    }
    setHasBranch(true);
    setLoading(true);
    try {
      const entries = await Promise.all(
        RULES.map(async (r) => [r.key, await r.load()] as const),
      );
      setValues(Object.fromEntries(entries));
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rule: Rule, next: boolean) {
    // Optimistic: flip immediately, roll back on failure.
    setValues((v) => ({ ...v, [rule.key]: next }));
    setSaving(rule.key);
    try {
      await rule.save(next);
      toast.success("Saved");
    } catch (e: any) {
      setValues((v) => ({ ...v, [rule.key]: !next }));
      toast.error(friendlyError(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order rules"
        description="How the tills work. These apply to the branch picked at the top."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontalIcon className="size-5" />
            Branch settings
          </CardTitle>
          <CardDescription>
            Tills get these changes the next time they update.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {!hasBranch && (
            <p className="text-muted-foreground py-6 text-sm">
              Pick a branch at the top to change its rules.
            </p>
          )}

          {hasBranch &&
            loading &&
            RULES.map((r) => (
              <div key={r.key} className="flex items-center gap-4 py-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </div>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}

          {hasBranch &&
            !loading &&
            RULES.map((r, i) => (
              <div
                key={r.key}
                className={`flex items-start justify-between gap-4 py-4 ${
                  i > 0 ? "border-t" : ""
                }`}>
                <div className="space-y-1">
                  <div className="text-sm font-medium">{r.title}</div>
                  <p className="text-muted-foreground text-sm">
                    {r.description}
                  </p>
                </div>
                <Switch
                  className="mt-1"
                  checked={values[r.key] ?? false}
                  disabled={saving === r.key}
                  onCheckedChange={(v) => toggle(r, v)}
                />
              </div>
            ))}
        </CardContent>
      </Card>

      {hasBranch && <HistoryLookbackCard />}

      {hasBranch && <CancelPasswordCard />}

      {hasBranch && <PrinterPasswordCard />}

      {hasBranch && <WaiterVisibleInventoryCard />}
    </div>
  );
}
