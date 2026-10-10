"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, Link2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Inventory } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";

type ItemLink = {
  id: string;
  source_item_id: string;
  source_item_name?: string | null;
  target_item_id: string;
  target_item_name?: string | null;
  conversion_factor: number;
};

export default function ItemLinksPage() {
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [factor, setFactor] = useState("1");

  async function reload() {
    setLoading(true);
    try {
      const [l, i] = await Promise.all([Inventory.links(), Inventory.list()]);
      setLinks(l);
      setItems(i);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    reload();
  }, []);

  const linkedSourceIds = useMemo(
    () => new Set(links.map((l) => l.source_item_id)),
    [links],
  );
  const targetIds = useMemo(
    () => new Set(links.map((l) => l.target_item_id)),
    [links],
  );

  // Keep the topology a one-level star (mirrors the backend validation):
  // a source may link to exactly one target and may not itself be a target;
  // a target may receive many sources but may not be a source.
  const sourceOptions = items.filter(
    (i) => !linkedSourceIds.has(i.id) && !targetIds.has(i.id),
  );
  const targetOptions = items.filter(
    (i) => i.id !== sourceId && !linkedSourceIds.has(i.id),
  );

  const sourceItem = items.find((i) => i.id === sourceId);
  const targetItem = items.find((i) => i.id === targetId);
  const factorNum = Math.max(1, Math.round(Number(factor) || 1));

  async function submit() {
    if (!sourceId || !targetId) {
      toast.error("Pick both items.");
      return;
    }
    try {
      await Inventory.createLink({
        source_item_id: sourceId,
        target_item_id: targetId,
        conversion_factor: factorNum,
      });
      toast.success("Pack contents saved");
      setOpen(false);
      setSourceId("");
      setTargetId("");
      setFactor("1");
      await reload();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  }

  async function remove(link: ItemLink) {
    try {
      await Inventory.removeLink(link.id);
      toast.success("Pack contents removed");
      await reload();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  }

  const itemName = (id: string, fallback?: string | null) =>
    fallback ?? items.find((i) => i.id === id)?.name ?? "—";

  const columns: Column<ItemLink>[] = [
    {
      key: "source",
      label: "Pack",
      searchValue: (l) => itemName(l.source_item_id, l.source_item_name),
      render: (l) => (
        <span className="font-medium">
          {itemName(l.source_item_id, l.source_item_name)}
        </span>
      ),
    },
    {
      key: "target",
      label: "Item inside",
      searchValue: (l) => itemName(l.target_item_id, l.target_item_name),
      render: (l) => (
        <span className="flex items-center gap-2">
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          {itemName(l.target_item_id, l.target_item_name)}
        </span>
      ),
    },
    {
      key: "factor",
      label: "How many inside",
      render: (l) => (
        <Badge variant="muted">
          1 → {Math.max(1, Number(l.conversion_factor) || 1)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pack contents"
        description="Pack contents (e.g. 1 crate = 24 bottles). When you move a pack, the place it goes to gets the items inside it. Items with no pack contents move as they are."
        action={
          <Button onClick={() => setOpen(true)}>
            <PlusIcon />
            Add pack contents
          </Button>
        }
      />

      <DataTable<ItemLink>
        columns={columns}
        rows={links}
        loading={loading}
        searchKeys={["source", "target"]}
        searchPlaceholder="Search packs"
        emptyMessage="None yet. Every item moves as it is."
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => remove(row)}>
            Remove
          </Button>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2Icon className="size-4" />
              Add pack contents
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>When you move this pack…</Label>
              <select
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Pick the pack</option>
                {sourceOptions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>…the other place gets</Label>
              <select
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Pick the item inside</option>
                {targetOptions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                How many inside one pack
                {sourceItem && targetItem
                  ? ` (${targetItem.base_unit ?? "unit"} per ${sourceItem.base_unit ?? "unit"})`
                  : ""}
              </Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
              />
            </div>
            {sourceItem && targetItem && (
              <div className="rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                Transferring 1 {sourceItem.base_unit ?? "unit"} of{" "}
                <strong>{sourceItem.name}</strong> adds{" "}
                <strong>
                  {factorNum} {targetItem.base_unit ?? "unit"}
                </strong>{" "}
                of <strong>{targetItem.name}</strong> in the other place.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
