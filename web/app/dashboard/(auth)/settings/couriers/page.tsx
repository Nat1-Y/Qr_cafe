"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { Settings } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";

type Courier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

const columns: Column<Courier>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "phone", label: "Phone", render: (r) => r.phone || "—", className: "text-muted-foreground" },
  { key: "notes", label: "Notes", render: (r) => r.notes || "—", className: "text-muted-foreground" },
  {
    key: "is_active",
    label: "Status",
    render: (r) => (
      <Badge variant={r.is_active ? "success" : "muted"}>
        {r.is_active ? "Active" : "Turned off"}
      </Badge>
    ),
  },
];

export default function CouriersPage() {
  return (
    <ResourceManager<Courier>
      title="Drivers"
      description="Saved delivery drivers. The cashier picks one for a delivery order, or types new details for a one-time driver."
      createLabel="Add driver"
      editLabel="Edit driver"
      columns={columns}
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "phone", label: "Phone (optional)" },
        { key: "notes", label: "Notes (optional)" },
      ]}
      load={Settings.couriers}
      create={Settings.createCourier}
      update={Settings.updateCourier}
      remove={Settings.removeCourier}
      rowActions={(row, reload) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await Settings.updateCourier(row.id, { is_active: !row.is_active });
              await reload();
            } catch (e: any) {
              toast.error(friendlyError(e));
            }
          }}
        >
          {row.is_active ? "Turn off" : "Turn on"}
        </Button>
      )}
    />
  );
}
