// Shared RBAC vocabulary for the web back office. Kept in sync with the web's
// web/lib/permissions.ts. Resources are derived from the dashboard nav; each
// resource supports the four CRUD actions below.

export const ACTIONS = ["read", "write", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export type ResourcePermissions = Record<Action, boolean> & {
  // Stock-location ids this permission is restricted to. Only meaningful for
  // LOCATION_SCOPED_RESOURCES below. Unlike the CRUD flags (which default
  // open when unset), an empty/missing list here means NO locations — an
  // owner must explicitly grant locations before a role can touch inventory
  // or transfers anywhere.
  locations?: string[];
};
export type PermissionMatrix = Record<string, ResourcePermissions>;

// Resources whose permission also carries a stock-location allow-list.
export const LOCATION_SCOPED_RESOURCES = new Set<string>(["inventory", "transfers"]);

// Resource ids guarded across the back office (one per dashboard area).
export const RESOURCES = [
  "orders",
  // Cancelling/voiding a placed order from the back office. Kept separate from
  // the generic `orders` resource so an owner can grant the ability to cancel
  // (a terminal, money-voiding action) independently of ordinary order access.
  "order_cancellation",
  "payments",
  "items_sold",
  "tables",
  "menu",
  "inventory",
  "stock_locations",
  "transfers",
  "staff",
  // Logging disciplinary penalties against an employee. Kept separate from the
  // generic `staff` resource so an owner can grant/restrict this independently
  // of ordinary staff-account management.
  "staff_penalty",
  "customers",
  "reports",
  "expenses",
  "settings",
  "payment_methods",
  "delivery_methods",
  // Preconfigured courier profiles (name/phone) an owner sets up so a cashier
  // can pick one instead of typing courier details by hand every time.
  "couriers",
  // Delivery tracking board — separate from `orders` so an owner can grant
  // access to the delivery pipeline without granting general order access.
  "deliveries",
  "roles",
  "devices",
] as const;
export type Resource = (typeof RESOURCES)[number];

// Roles the owner can configure. super_admin / owner / business_admin are always
// all-access and never appear here.
export const CONFIGURABLE_ROLES = [
  "admin",
  "fb_manager",
  "finance",
  "cashier",
  "cafe_waiter",
  "kitchen_staff",
  "barista",
  "host",
  "storekeeper",
  "accountant",
  "housekeeping",
] as const;

// Roles that bypass all permission checks (full access).
export const ALL_ACCESS_ROLES = ["super_admin", "owner", "business_admin"];

export function isAllAccessRole(role?: string | null): boolean {
  return !!role && ALL_ACCESS_ROLES.includes(role);
}

// A full matrix with every action allowed — the default when no row is stored.
// Location-scoped resources still default their `locations` list to empty:
// that facet is deny-by-default regardless of how open the CRUD flags are.
export function allAllowedMatrix(): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const resource of RESOURCES) {
    matrix[resource] = {
      read: true,
      write: true,
      update: true,
      delete: true,
      ...(LOCATION_SCOPED_RESOURCES.has(resource) ? { locations: [] } : {}),
    };
  }
  return matrix;
}

// Merge a stored (possibly partial) matrix over the all-allowed defaults so a
// missing resource/action reads as allowed.
export function withDefaults(stored?: PermissionMatrix | null): PermissionMatrix {
  const base = allAllowedMatrix();
  if (!stored) return base;
  for (const resource of RESOURCES) {
    const row = stored[resource];
    if (!row) continue;
    base[resource] = {
      read: row.read ?? true,
      write: row.write ?? true,
      update: row.update ?? true,
      delete: row.delete ?? true,
      ...(LOCATION_SCOPED_RESOURCES.has(resource)
        ? { locations: Array.isArray(row.locations) ? row.locations : [] }
        : {}),
    };
  }
  return base;
}
