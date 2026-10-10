"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  PackageIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Inventory } from "@/lib/resources";
import { shortDate } from "@/lib/format";

type TransferItem = {
  id: string;
  inventory_item_id: string;
  item_name?: string | null;
  base_unit?: string | null;
  quantity: number;
  received_as_name?: string | null;
  received_quantity?: number | null;
  conversion_factor?: number | null;
  source_quantity_before?: number | null;
  source_quantity_after?: number | null;
  destination_quantity_before?: number | null;
  destination_quantity_after?: number | null;
  source_current_quantity?: number | null;
  destination_current_quantity?: number | null;
};

type Transfer = {
  id: string;
  from_location_name?: string | null;
  to_location_name?: string | null;
  status: string;
  notes?: string | null;
  created_by_name?: string | null;
  received_by_name?: string | null;
  received_at?: string | null;
  created_at: string;
  item_count: number;
  total_quantity: number;
  items: TransferItem[];
};

const STATUS_BADGE: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  sent: "warning",
  received: "success",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting receipt",
  received: "Received",
  cancelled: "Cancelled",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}

// A location's balance right before/after this transfer, plus its live
// balance today (which may have drifted further since).
function BalanceCell({
  before,
  after,
  current,
  tone,
}: {
  before?: number | null;
  after?: number | null;
  current?: number | null;
  tone: "down" | "up";
}) {
  if (after == null) return <span className="text-muted-foreground">—</span>;
  const delta = after - (before ?? after);
  const deltaClass =
    tone === "down"
      ? "text-destructive"
      : "text-success";
  return (
    <div>
      <div className="tabular-nums">
        <span className="text-muted-foreground">{before ?? "—"}</span>
        <ArrowRightIcon className="mx-1 inline size-3 text-muted-foreground" />
        <span className="font-semibold">{after}</span>
      </div>
      <div className={`text-xs tabular-nums ${deltaClass}`}>
        {delta > 0 ? "+" : ""}
        {delta}
      </div>
      {current != null && current !== after && (
        <div className="text-muted-foreground text-xs tabular-nums">now: {current}</div>
      )}
    </div>
  );
}

export default function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Inventory.transfer(id)
      .then((t) => active && setTransfer(t))
      .catch((e: any) => toast.error(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfer details"
        description={`Transfer ${id.slice(0, 8)}`}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/inventory/transfers">
              <ArrowLeftIcon />
              Back to transfers
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-1" />
          <Skeleton className="h-56 lg:col-span-2" />
        </div>
      ) : !transfer ? (
        <p className="text-muted-foreground text-sm">Transfer not found.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-base font-semibold">
                  {transfer.from_location_name ?? "—"}
                  <ArrowRightIcon className="text-muted-foreground size-4" />
                  {transfer.to_location_name ?? "—"}
                </span>
                <Badge variant={STATUS_BADGE[transfer.status] ?? "muted"}>
                  {STATUS_LABEL[transfer.status] ?? transfer.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Row
                  label="Items"
                  value={`${transfer.item_count} item${transfer.item_count === 1 ? "" : "s"}`}
                />
                <Row label="Total quantity" value={transfer.total_quantity.toLocaleString()} />
              </dl>

              <Separator />

              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <UserIcon className="size-3.5" />
                    Created by
                  </dt>
                  <dd className="text-right font-medium">
                    {transfer.created_by_name ?? "—"}
                    <div className="text-muted-foreground flex items-center justify-end gap-1 text-xs font-normal">
                      <CalendarIcon className="size-3" />
                      {shortDate(transfer.created_at)}
                    </div>
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <UserIcon className="size-3.5" />
                    Received by
                  </dt>
                  <dd className="text-right font-medium">
                    {transfer.received_by_name ?? (
                      <span className="text-muted-foreground font-normal">Not yet received</span>
                    )}
                    {transfer.received_at && (
                      <div className="text-muted-foreground flex items-center justify-end gap-1 text-xs font-normal">
                        <CalendarIcon className="size-3" />
                        {shortDate(transfer.received_at)}
                      </div>
                    )}
                  </dd>
                </div>
              </dl>

              {transfer.notes && (
                <>
                  <Separator />
                  <p className="text-sm">
                    <span className="text-muted-foreground">Notes: </span>
                    {transfer.notes}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageIcon className="size-4" />
                Items transferred
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty moved</TableHead>
                    <TableHead>{transfer.from_location_name ?? "Source"}</TableHead>
                    <TableHead>{transfer.to_location_name ?? "Destination"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfer.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground text-center py-8">
                        No items recorded for this transfer.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transfer.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium">{item.item_name ?? "Item"}</div>
                          {item.received_as_name && (
                            <div className="text-primary text-xs">
                              received as <strong>{item.received_as_name}</strong>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.quantity} {item.base_unit ?? ""}
                          {item.received_as_name && item.received_quantity != null && (
                            <div className="text-muted-foreground text-xs">
                              (+{item.received_quantity} received)
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <BalanceCell
                            before={item.source_quantity_before}
                            after={item.source_quantity_after}
                            current={item.source_current_quantity}
                            tone="down"
                          />
                        </TableCell>
                        <TableCell>
                          <BalanceCell
                            before={item.destination_quantity_before}
                            after={item.destination_quantity_after}
                            current={item.destination_current_quantity}
                            tone="up"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
