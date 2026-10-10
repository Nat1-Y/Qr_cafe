"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { Settings } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";

type PM = {
  id: string;
  name: string;
  display_name: string;
  icon: string | null;
  is_active: boolean;
};

const columns: Column<PM>[] = [
  { key: "display_name", label: "Payment type", render: (r) => <span className="font-medium">{r.display_name}</span> },
  { key: "name", label: "Code name", className: "text-muted-foreground" },
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

export default function PaymentMethodsPage() {
  return (
    <ResourceManager<PM>
      title="Payment types"
      description="How customers can pay at this branch."
      createLabel="Add payment type"
      columns={columns}
      fields={[
        { key: "name", label: "Code name (e.g. cash)", required: true },
        { key: "display_name", label: "Display name", required: true },
        { key: "icon", label: "Icon (optional)" },
      ]}
      load={Settings.paymentMethods}
      create={Settings.createPaymentMethod}
      remove={Settings.removePaymentMethod}
      rowActions={(row, reload) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await Settings.updatePaymentMethod(row.id, { is_active: !row.is_active });
              await reload();
            } catch (e: any) {
              toast.error(friendlyError(e));
            }
          }}>
          {row.is_active ? "Turn off" : "Turn on"}
        </Button>
      )}
    />
  );
}
