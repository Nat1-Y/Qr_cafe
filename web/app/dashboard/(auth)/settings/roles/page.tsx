"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SaveIcon, ShieldCheckIcon, MapPinIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Permissions, StockLocations } from "@/lib/resources";
import {
  ACTIONS,
  CONFIGURABLE_ROLES,
  LOCATION_SCOPED_RESOURCES,
  RESOURCES,
  type Action,
  type PermissionMatrix,
} from "@/lib/permissions";
import { friendlyError } from "@/lib/errors";

const ACTION_LABELS: Record<Action, string> = {
  read: "See",
  write: "Add",
  update: "Change",
  delete: "Delete",
};

type StockLocation = { id: string; name: string };

function emptyAllowed(locationIds: string[] = []): PermissionMatrix {
  const m: PermissionMatrix = {};
  for (const r of RESOURCES) {
    m[r.id] = {
      read: true,
      write: true,
      update: true,
      delete: true,
      ...(LOCATION_SCOPED_RESOURCES.includes(r.id) ? { locations: locationIds } : {}),
    };
  }
  return m;
}

// Owner-facing editor: pick a role, toggle read/create/update/delete per area,
// then save. New/unconfigured roles default to everything allowed; the owner
// restricts from here. Inventory and Transfers also carry a stock-location
// allow-list — unlike the CRUD flags, an empty list there means NO locations,
// so a role needs at least one location granted before it can touch inventory
// or transfers anywhere. super_admin / owner / business_admin are always full
// access and aren't listed.
export default function RolesPermissionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string>(CONFIGURABLE_ROLES[0].value);
  const [byRole, setByRole] = useState<Record<string, PermissionMatrix>>({});
  const [locations, setLocations] = useState<StockLocation[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [rows, locs] = await Promise.all([
          Permissions.list() as Promise<{ role: string; permissions: PermissionMatrix }[]>,
          StockLocations.list() as Promise<StockLocation[]>,
        ]);
        const map: Record<string, PermissionMatrix> = {};
        for (const r of rows) map[r.role] = r.permissions;
        setByRole(map);
        setLocations(locs);
      } catch (e) {
        toast.error(friendlyError(e, "Couldn't load permissions. Please try again."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const locationIds = useMemo(() => locations.map((l) => l.id), [locations]);
  const matrix = byRole[role] ?? emptyAllowed(locationIds);

  const roleLabel = useMemo(
    () => CONFIGURABLE_ROLES.find((r) => r.value === role)?.label ?? role,
    [role],
  );

  const setCell = (resource: string, action: Action, value: boolean) => {
    setByRole((prev) => {
      const current = prev[role] ?? emptyAllowed(locationIds);
      return {
        ...prev,
        [role]: {
          ...current,
          [resource]: { ...current[resource], [action]: value },
        },
      };
    });
  };

  // Toggle a single stock location for a location-scoped resource. Only
  // touches ids currently shown in the picker (this branch's locations) — any
  // ids the stored list already carries for other branches are left as-is.
  const toggleLocation = (resource: string, locationId: string, checked: boolean) => {
    setByRole((prev) => {
      const current = prev[role] ?? emptyAllowed(locationIds);
      const currentLocs = current[resource]?.locations ?? [];
      const nextLocs = checked
        ? Array.from(new Set([...currentLocs, locationId]))
        : currentLocs.filter((id) => id !== locationId);
      return {
        ...prev,
        [role]: { ...current, [resource]: { ...current[resource], locations: nextLocs } },
      };
    });
  };

  const setAllLocationsForResource = (resource: string, checked: boolean) => {
    setByRole((prev) => {
      const current = prev[role] ?? emptyAllowed(locationIds);
      const currentLocs = current[resource]?.locations ?? [];
      const otherBranches = currentLocs.filter((id) => !locationIds.includes(id));
      const nextLocs = checked ? [...otherBranches, ...locationIds] : otherBranches;
      return {
        ...prev,
        [role]: { ...current, [resource]: { ...current[resource], locations: nextLocs } },
      };
    });
  };

  const setAll = (value: boolean) => {
    setByRole((prev) => {
      const next: PermissionMatrix = {};
      for (const r of RESOURCES) {
        next[r.id] = {
          read: value,
          write: value,
          update: value,
          delete: value,
          ...(LOCATION_SCOPED_RESOURCES.includes(r.id)
            ? { locations: value ? locationIds : [] }
            : {}),
        };
      }
      return { ...prev, [role]: next };
    });
  };

  const setColumn = (action: Action, value: boolean) => {
    setByRole((prev) => {
      const current = prev[role] ?? emptyAllowed(locationIds);
      const next: PermissionMatrix = {};
      for (const r of RESOURCES) {
        next[r.id] = { ...current[r.id], [action]: value };
      }
      return { ...prev, [role]: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await Permissions.save(role, matrix);
      toast.success(`Saved permissions for ${roleLabel}`);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't save. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles and access"
        description="Choose what each role can see and do. Owners can always do everything."
        action={
          <Button onClick={save} disabled={saving || loading} size="sm">
            <SaveIcon />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {/* Role picker */}
      <div className="flex flex-wrap gap-2">
        {CONFIGURABLE_ROLES.map((r) => (
          <Button
            key={r.value}
            size="sm"
            variant={role === r.value ? "default" : "outline"}
            onClick={() => setRole(r.value)}>
            {r.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" /> What a {roleLabel} can do
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAll(true)} disabled={loading}>
              Allow all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAll(false)} disabled={loading}>
              Allow none
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">What they can do</TableHead>
                {ACTIONS.map((a) => (
                  <TableHead key={a} className="text-center">
                    <button
                      type="button"
                      className="hover:text-foreground text-muted-foreground text-xs font-medium"
                      onClick={() => setColumn(a, true)}
                      title={`Allow "${ACTION_LABELS[a]}" for everything`}>
                      {ACTION_LABELS[a]}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-[18%] text-center">
                  Stock places
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                RESOURCES.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    {ACTIONS.map((a) => (
                      <TableCell key={a} className="text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={matrix[r.id]?.[a] ?? true}
                            onCheckedChange={(v) => setCell(r.id, a, v)}
                          />
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      {LOCATION_SCOPED_RESOURCES.includes(r.id) ? (
                        <LocationPicker
                          locations={locations}
                          selected={matrix[r.id]?.locations ?? []}
                          onToggle={(locId, checked) => toggleLocation(r.id, locId, checked)}
                          onSetAll={(checked) => setAllLocationsForResource(r.id, checked)}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">All</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Changes work the next time the person signs in or reloads the page. These
        settings don&apos;t change the desktop till app.
      </p>
    </div>
  );
}

// Per-resource stock-location allow-list. An empty selection means the role
// has no access at any location for that resource — an owner must grant at
// least one before staff with this role can use it.
function LocationPicker({
  locations,
  selected,
  onToggle,
  onSetAll,
}: {
  locations: StockLocation[];
  selected: string[];
  onToggle: (locationId: string, checked: boolean) => void;
  onSetAll: (checked: boolean) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedHere = locations.filter((l) => selectedSet.has(l.id));
  const allSelected = locations.length > 0 && selectedHere.length === locations.length;
  const noneSelected = selectedHere.length === 0;

  const summary =
    locations.length === 0
      ? "No stock places"
      : allSelected
        ? `All ${locations.length}`
        : noneSelected
          ? "None"
          : `${selectedHere.length} of ${locations.length}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={locations.length === 0}
          className="h-7 gap-1">
          <MapPinIcon className="size-3" />
          {summary}
          <ChevronDownIcon className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Stock places</p>
            <div className="flex gap-1">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                onClick={() => onSetAll(true)}>
                All
              </button>
              <span className="text-muted-foreground text-xs">/</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                onClick={() => onSetAll(false)}>
                None
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {locations.map((loc) => (
              <label key={loc.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedSet.has(loc.id)}
                  onCheckedChange={(v) => onToggle(loc.id, v === true)}
                />
                {loc.name}
              </label>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
