import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, Trash2, ArrowRight, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { NormalizedInventoryItem, InventoryItemLink } from '../types';
import api from '@/application';

interface ItemLinksTabProps {
  items: NormalizedInventoryItem[];
  online: boolean;
  onChanged: () => void;
}

export const ItemLinksTab: React.FC<ItemLinksTabProps> = ({ items, online, onChanged }) => {
  const [links, setLinks] = useState<InventoryItemLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [factor, setFactor] = useState('1');

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.inventory.getLinks();
      const list = res?.data?.data?.links ?? res?.data?.links ?? [];
      setLinks(Array.isArray(list) ? list : []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const linkedSourceIds = new Set(links.map(l => String(l.source_item_id)));
  const targetIds = new Set(links.map(l => String(l.target_item_id)));

  // Valid sources: not already a source, not already a target (no chains).
  const sourceOptions = items.filter(
    it => !linkedSourceIds.has(String(it.id)) && !targetIds.has(String(it.id)),
  );
  // Valid targets: not the chosen source and not a source themselves (no chains).
  const targetOptions = items.filter(
    it => String(it.id) !== sourceId && !linkedSourceIds.has(String(it.id)),
  );

  const sourceItem = items.find(it => String(it.id) === sourceId);
  const targetItem = items.find(it => String(it.id) === targetId);
  const factorNum = Math.max(1, Math.round(Number(factor) || 1));

  const handleCreate = async () => {
    if (!sourceId || !targetId) {
      toast.error('Choose both a source and a target item');
      return;
    }
    setSaving(true);
    try {
      await api.inventory.createLink({
        source_item_id: sourceId,
        target_item_id: targetId,
        conversion_factor: factorNum,
      });
      toast.success('Item link saved');
      setSourceId('');
      setTargetId('');
      setFactor('1');
      await fetchLinks();
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to save link');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (link: InventoryItemLink) => {
    try {
      await api.inventory.deleteLink(String(link.id));
      toast.success('Item link removed');
      await fetchLinks();
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to remove link');
    }
  };

  // Group links by target so the one-to-many shape is visible at a glance.
  const byTarget = new Map<string, InventoryItemLink[]>();
  for (const link of links) {
    const key = String(link.target_item_id);
    byTarget.set(key, [...(byTarget.get(key) ?? []), link]);
  }

  const itemName = (id: string, fallback?: string | null) =>
    fallback ?? items.find(it => String(it.id) === id)?.name ?? 'Unknown item';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Link items for transfers
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A linked item is received as its target item when transferred: the target's
            quantity increases at the destination instead of the item's own. Several items
            can share one target (one-to-many). Unlinked items transfer as themselves.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>When this item is transferred…</Label>
              <select
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
              >
                <option value="">Choose source item…</option>
                {sourceOptions.map(item => (
                  <option key={item.id} value={String(item.id)}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="pb-2 text-muted-foreground hidden sm:block">
              <ArrowRight className="h-4 w-4" />
            </div>

            <div className="space-y-1.5">
              <Label>…receive it as</Label>
              <select
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="h-10 rounded-field border border-input bg-card px-3.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-50 w-full"
              >
                <option value="">Choose target item…</option>
                {targetOptions.map(item => (
                  <option key={item.id} value={String(item.id)}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 w-28">
              <Label>Units per unit</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={factor}
                onChange={e => setFactor(e.target.value)}
                className="h-9"
              />
            </div>

            <Button
              type="button"
              size="sm"
              className="h-9"
              onClick={handleCreate}
              disabled={saving || !online}
            >
              <Plus />
              {saving ? 'Saving…' : 'Link'}
            </Button>
          </div>

          {sourceItem && targetItem && (
            <p className="text-xs text-muted-foreground mt-3">
              Transferring 1 {sourceItem.base_unit || 'unit'} of <strong>{sourceItem.name}</strong> will
              add <strong>{factorNum} {targetItem.base_unit || 'unit'}</strong> of{' '}
              <strong>{targetItem.name}</strong> at the destination.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured links ({links.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No item links yet. All transfers use the default one-to-one behavior.
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(byTarget.entries()).map(([tId, group]) => (
                <div key={tId} className="rounded-md border">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <Badge variant="secondary">Target</Badge>
                    <span className="text-sm font-medium">
                      {itemName(tId, group[0]?.target_item_name)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      receives {group.length} linked item{group.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="divide-y">
                    {group.map(link => (
                      <div key={link.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                          <span className="truncate">
                            {itemName(String(link.source_item_id), link.source_item_name)}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">
                            ×{Math.max(1, Number(link.conversion_factor) || 1)}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(link)}
                          disabled={!online}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ItemLinksTab;
