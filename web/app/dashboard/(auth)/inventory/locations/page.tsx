"use client";

import { Badge } from "@/components/ui/badge";
import { ResourceManager, type Column } from "@/components/resource-manager";
import { StockLocations } from "@/lib/resources";
import { humanize } from "@/lib/format";

type Loc = {
  id: string;
  name: string;
  slug: string;
  location_type: string;
  is_default: boolean;
};

const columns: Column<Loc>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },

  { key: "location_type", label: "Type", render: (r) => <span>{humanize(r.location_type)}</span> },
  {
    key: "is_default",
    label: "Main place",
    render: (r) => (r.is_default ? <Badge variant="success">Main</Badge> : "—"),
  },
];

export default function StockLocationsPage() {
  return (
    <ResourceManager<Loc>
      title="Stock places"
      description="Where this branch keeps its stock."
      createLabel="Add stock place"
      columns={columns}
      fields={[
        { key: "name", label: "Name", required: true },
        {
          key: "location_type",
          label: "Type",
          type: "select",
          default: "storage",
          options: [
            { value: "storage", label: "Store room" },
            { value: "service", label: "Service area" },
            { value: "kitchen", label: "Kitchen" },
          ],
        },
        { key: "description", label: "Description" },
      ]}
      load={StockLocations.list}
      create={StockLocations.create}
      remove={StockLocations.remove}
    />
  );
}
