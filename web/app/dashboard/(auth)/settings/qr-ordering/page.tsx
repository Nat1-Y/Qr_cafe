"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangleIcon, CheckCircle2Icon, PrinterIcon, QrCodeIcon, WalletCardsIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { QrOrdering } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";
import type { QrSettings, QrSettingsResponse } from "@/lib/qr";

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{title}</span>
        {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export default function QrOrderingSettingsPage() {
  const [data, setData] = useState<QrSettingsResponse | null>(null);
  const [draft, setDraft] = useState<QrSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    QrOrdering.get()
      .then((d: QrSettingsResponse) => {
        setData(d);
        setDraft(d.settings);
      })
      .catch((e: unknown) => toast.error(friendlyError(e, "Couldn't load QR ordering settings.")));
  }, []);

  const save = async (patch: Partial<QrSettings>) => {
    if (!draft) return;
    const prev = draft;
    setDraft({ ...draft, ...patch });
    setSaving(true);
    try {
      const saved = await QrOrdering.update(patch);
      setDraft(saved);
      toast.success("Saved");
    } catch (e) {
      setDraft(prev);
      toast.error(friendlyError(e, "Couldn't save. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const testTicket = async (section: string, name: string) => {
    setTesting(section);
    try {
      await QrOrdering.testTicket(section);
      toast.success(`Sent a test ticket for ${name}. It prints on the till that's online.`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't send the test ticket."));
    } finally {
      setTesting(null);
    }
  };

  const hours = draft?.orderingHours ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href="/dashboard/settings">Settings</Link>}
        title="QR ordering"
        description="Let guests scan the code on their table, order, and follow their order on their phone."
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/tables">
              <QrCodeIcon /> Table QR codes
            </Link>
          </Button>
        }
      />

      {!draft || !data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-card" />
          <Skeleton className="h-80 rounded-card" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Guest ordering</CardTitle>
              <CardDescription>QR orders go to the same queue as waiter orders and print the same way.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <Row title="Let guests order from their table" hint="Off: the QR code only shows the menu.">
                <Switch checked={draft.enabled} disabled={saving} onCheckedChange={(v) => void save({ enabled: v })} />
              </Row>
              <Row title="Print QR orders automatically" hint="Each item prints on its section's printer, like a waiter order.">
                <Switch checked={draft.autoPrint} disabled={saving} onCheckedChange={(v) => void save({ autoPrint: v })} />
              </Row>
              <Row title="A cashier accepts each order first" hint="The order prints when a cashier accepts it.">
                <Switch
                  checked={draft.requireCashierAccept}
                  disabled={saving}
                  onCheckedChange={(v) => void save({ requireCashierAccept: v })}
                />
              </Row>
              <Row title="Show prices on the guest menu">
                <Switch checked={draft.showPrices} disabled={saving} onCheckedChange={(v) => void save({ showPrices: v })} />
              </Row>
              <Row title="Let guests add notes" hint="For example “No sugar” or “Extra hot”.">
                <Switch checked={draft.allowNotes} disabled={saving} onCheckedChange={(v) => void save({ allowNotes: v })} />
              </Row>
              <div className="space-y-2 py-3">
                <label htmlFor="welcome" className="font-medium text-foreground">
                  Welcome message
                </label>
                <Textarea
                  id="welcome"
                  value={draft.welcomeMessage}
                  maxLength={280}
                  placeholder="Selam! Order from your table — we'll bring it right over."
                  onChange={(e) => setDraft({ ...draft, welcomeMessage: e.target.value })}
                  onBlur={() => {
                    if (draft.welcomeMessage !== data.settings.welcomeMessage) void save({ welcomeMessage: draft.welcomeMessage });
                  }}
                />
              </div>
              <Row title="Most items in one order" hint="Stops accidental huge orders.">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.maxItemsPerOrder}
                  onChange={(e) => setDraft({ ...draft, maxItemsPerOrder: Number(e.target.value) })}
                  onBlur={() => void save({ maxItemsPerOrder: draft.maxItemsPerOrder })}
                  className="w-24"
                />
              </Row>
              <div className="space-y-3 py-3">
                <Row title="Only take table orders at set times">
                  <Switch
                    checked={hours != null}
                    disabled={saving}
                    onCheckedChange={(v) => void save({ orderingHours: v ? { open: "07:00", close: "22:00" } : null })}
                  />
                </Row>
                {hours ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    From
                    <Input
                      type="time"
                      value={hours.open}
                      onChange={(e) => setDraft({ ...draft, orderingHours: { ...hours, open: e.target.value } })}
                      onBlur={() => void save({ orderingHours: hours })}
                      className="w-32"
                    />
                    to
                    <Input
                      type="time"
                      value={hours.close}
                      onChange={(e) => setDraft({ ...draft, orderingHours: { ...hours, close: e.target.value } })}
                      onBlur={() => void save({ orderingHours: hours })}
                      className="w-32"
                    />
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <WalletCardsIcon className="size-5 text-muted-foreground" /> How guests pay
                </CardTitle>
                <CardDescription>With only one way to pay, guests skip the payment step.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {data.providers.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="font-medium text-foreground">{p.name}</span>
                      {p.available ? (
                        <Badge variant={p.enabled ? "success" : "muted"}>{p.enabled ? "On" : "Off"}</Badge>
                      ) : (
                        <Badge variant="secondary">Coming soon</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PrinterIcon className="size-5 text-muted-foreground" /> Where QR orders print
                </CardTitle>
                <CardDescription>
                  Each section prints on its own printer. Change printers on the till under Printer settings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {data.sections.map((s) => (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">{s.name}</span>
                        {s.routed ? (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CheckCircle2Icon className="size-3.5 text-success" /> {s.printer}
                          </span>
                        ) : (
                          <span className="flex items-start gap-1.5 text-sm text-warning">
                            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                            Section &lsquo;{s.name}&rsquo; has no printer, so its orders will print on the main printer.
                          </span>
                        )}
                      </span>
                      <Button variant="outline" size="sm" disabled={testing === s.key} onClick={() => void testTicket(s.key, s.name)}>
                        Print a test QR ticket
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
