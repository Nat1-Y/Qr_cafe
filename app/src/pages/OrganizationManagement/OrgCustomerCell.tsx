import React from 'react';

/**
 * Name + phone + notes for who at the organization an order is for, stacked
 * in one cell. Shared by OrganizationOrders and OrganizationDetail so the two
 * tables render this identically. Display-only — never affects billing.
 */
export const OrgCustomerCell: React.FC<{ order: any }> = ({ order }) => {
  const name = order?.meta?.org_customer_name;
  const phone = order?.meta?.org_customer_phone;
  const notes = order?.meta?.org_customer_notes;

  if (!name && !phone && !notes) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-0.5">
      {name && <div className="font-medium">{name}</div>}
      {phone && <div className="text-xs text-muted-foreground">{phone}</div>}
      {notes && (
        <div
          className="text-xs italic text-muted-foreground max-w-[180px] truncate"
          title={notes}
        >
          {notes}
        </div>
      )}
    </div>
  );
};

export default OrgCustomerCell;
