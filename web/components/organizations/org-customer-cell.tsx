/**
 * Name + phone + notes for who at the organization an order is for, stacked
 * in one table cell. Shared by the Customers → Orders tab and the per-org
 * detail page so both tables render this identically. Display-only — never
 * affects billing.
 */
export function OrgCustomerCell({ order }: { order: any }) {
  const name = order?.meta?.org_customer_name;
  const phone = order?.meta?.org_customer_phone;
  const notes = order?.meta?.org_customer_notes;

  if (!name && !phone && !notes) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {name && <div className="font-medium">{name}</div>}
      {phone && <div className="text-muted-foreground text-xs">{phone}</div>}
      {notes && (
        <div className="text-muted-foreground max-w-45 truncate text-xs italic" title={notes}>
          {notes}
        </div>
      )}
    </div>
  );
}
