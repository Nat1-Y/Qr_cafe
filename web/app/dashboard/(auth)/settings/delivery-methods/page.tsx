"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { Settings, Users } from "@/lib/resources";

type DM = {
  id: string;
  name: string;
  display_name: string;
  icon: string | null;
  is_active: boolean;
};

const columns: Column<DM>[] = [
  { key: "display_name", label: "Method", render: (r) => <span className="font-medium">{r.display_name}</span> },
  { key: "name", label: "Key", className: "text-muted-foreground" },
  {
    key: "is_active",
    label: "Status",
    render: (r) => (
      <Badge variant={r.is_active ? "success" : "muted"}>
        {r.is_active ? "Active" : "Disabled"}
      </Badge>
    ),
  },
];

type Waiter = { id: string; full_name?: string; username?: string; first_name?: string; last_name?: string };

function waiterLabel(w: Waiter) {
  const composed = [w.first_name, w.last_name].filter(Boolean).join(" ").trim();
  return w.full_name || composed || w.username || "Unnamed";
}

// Which waiters may place delivery orders from their own self-service session
// (web waiter portal). Cashiers and back-office order creation are never
// restricted by this — see order.service.ts assertWaiterAllowedForDelivery.
function WaiterAccessCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, allowed] = await Promise.all([
        Users.waiters(),
        Settings.deliveryAllowedWaiters(),
      ]);
      setWaiters(Array.isArray(w) ? w : []);
      setSelected(new Set((allowed ?? []).map(String)));
    } catch (e: any) {
      toast.error(e?.message || "Failed to load waiter access");
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
      await Settings.updateDeliveryAllowedWaiters(Array.from(selected));
      toast.success("Waiter access updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save waiter access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiter access</CardTitle>
        <CardDescription>
          Only these waiters see the delivery option on their own order screen.
          cashiers and orders placed from the dashboard are never restricted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm font-medium">Loading…</span>
          </div>
        ) : waiters.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No waiters found for this branch.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {waiters.map((w) => {
              const on = selected.has(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggle(w.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {waiterLabel(w)}
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

export default function DeliveryMethodsPage() {
  return (
    <div className="space-y-6">
      <ResourceManager<DM>
        title="Delivery methods"
        description="Delivery channels this branch works with (e.g. a delivery app, an in-house rider)."
        createLabel="New method"
        columns={columns}
        fields={[
          { key: "name", label: "Key (e.g. beu)", required: true },
          { key: "display_name", label: "Display name", required: true },
          { key: "icon", label: "Icon (optional)" },
        ]}
        load={Settings.deliveryMethods}
        create={Settings.createDeliveryMethod}
        remove={Settings.removeDeliveryMethod}
        rowActions={(row, reload) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await Settings.updateDeliveryMethod(row.id, { is_active: !row.is_active });
                await reload();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}>
            {row.is_active ? "Disable" : "Enable"}
          </Button>
        )}
      />
      <WaiterAccessCard />
    </div>
  );
}
