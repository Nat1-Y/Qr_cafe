import { apiFetch } from "./api";

// Centralized resource calls. The backend wraps lists as
// { status, data: { <key>, count } }; these unwrap to the inner payload.
const j = (body: any) => ({ method: "POST", body: JSON.stringify(body) });
const put = (body: any) => ({ method: "PUT", body: JSON.stringify(body) });
const patch = (body: any) => ({ method: "PATCH", body: JSON.stringify(body) });
const del = { method: "DELETE" };

export const Menu = {
  items: () => apiFetch("/menu").then((d) => d.data.menuItems ?? []),
  // "Main categories" are the printing/kitchen departments — the table that
  // feeds a menu item's `main_category` and drives department→printer routing.
  // Exposed here as `departments` so the UI stops conflating them with the
  // item's real `category`.
  departments: () =>
    apiFetch("/menu/main-categories").then((d) => d.data.mainCategories ?? []),
  // The real menu categories — the list waiters/cashiers filter the menu by,
  // and the source for a menu item's `category`.
  categories: () =>
    apiFetch("/menu/categories").then((d) => d.data.categories ?? []),
  createCategory: (b: any) => apiFetch("/menu/categories", j(b)),
  removeCategory: (id: string) => apiFetch(`/menu/categories/${id}`, del),
  create: (b: any) => apiFetch("/menu", j(b)),
  // Bulk create/update. The backend upserts each item and emits sync events,
  // scoped to the branch from the X-Branch-Id header.
  bulkSync: (menuItems: any[]) => apiFetch("/menu/sync", j({ menuItems })),
  update: (id: string, b: any) => apiFetch(`/menu/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/menu/${id}`, del),
  toggle: (id: string) => apiFetch(`/menu/${id}/toggle-availability`, { method: "POST" }),
  createDepartment: (b: any) => apiFetch("/menu/main-categories", j(b)),
};

export const Inventory = {
  list: () => apiFetch("/inventory?limit=200").then((d) => d.data.items ?? []),
  // Paginated + searchable list, for pickers where the branch may have many
  // items (unlike `list`, which caps at 200 and can't be searched server-side).
  page: (params?: Record<string, any>): Promise<Page<any>> =>
    apiFetch(`/inventory${qs(params)}`).then((d) => ({
      rows: d.data.items ?? [],
      count: d.data.count ?? 0,
      page: d.data.page ?? 1,
      limit: d.data.limit ?? 0,
      window: null,
      stats: {},
    })),
  create: (b: any) => apiFetch("/inventory", j(b)),
  update: (id: string, b: any) => apiFetch(`/inventory/${id}`, put(b)),
  // Bulk create/update. The backend upserts each item (and seeds/reconciles
  // stock) and emits sync events, scoped to the branch from x-branch-id.
  bulkSync: (inventoryItems: any[]) =>
    apiFetch("/inventory/sync", j({ inventoryItems })),
  remove: (id: string) => apiFetch(`/inventory/${id}`, del),
  setQuantity: (id: string, b: any) => apiFetch(`/inventory/${id}/quantity`, put(b)),
  // Paginated stock-transfer history, with server-computed status counts.
  transfers: (params?: Record<string, any>): Promise<Page<any>> =>
    apiFetch(`/inventory/transfers${qs(params)}`).then((d) => ({
      rows: d.data.transfers ?? [],
      count: d.data.count ?? 0,
      page: d.data.page ?? 1,
      limit: d.data.limit ?? 0,
      window: null,
      stats: d.data.stats ?? {},
    })),
  // Full detail for one transfer: items, quantities, and the exact balance
  // left at both the source and destination locations.
  transfer: (id: string) =>
    apiFetch(`/inventory/transfers/${id}`).then((d) => d.data.transfer),
  createTransfer: (b: any) => apiFetch("/inventory/transfers", j(b)),
  // Branch-wide stock ledger — every deduction/addition (sale, transfer,
  // adjustment, initial stock-in) with the running balance after each entry.
  ledger: (params?: Record<string, any>): Promise<Page<any>> =>
    apiFetch(`/inventory/ledger${qs(params)}`).then((d) => ({
      rows: d.data.movements ?? [],
      count: d.data.count ?? 0,
      page: d.data.page ?? 1,
      limit: d.data.limit ?? 0,
      window: null,
      stats: d.data.stats ?? {},
    })),
  // One-to-many transfer links: a source item is received as its target item
  // (quantity × conversion_factor) when transferred. Create upserts by source.
  links: () => apiFetch("/inventory/links").then((d) => d.data.links ?? []),
  createLink: (b: any) => apiFetch("/inventory/links", j(b)),
  removeLink: (id: string) => apiFetch(`/inventory/links/${id}`, del),
};

export const StockLocations = {
  list: () => apiFetch("/stock-locations").then((d) => d.data.locations ?? []),
  create: (b: any) => apiFetch("/stock-locations", j(b)),
  remove: (id: string) => apiFetch(`/stock-locations/${id}`, del),
};

export const Tables = {
  list: () => apiFetch("/tables").then((d) => d.data.tables ?? []),
  create: (b: any) => apiFetch("/tables", j(b)),
  update: (id: string, b: any) => apiFetch(`/tables/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/tables/${id}`, del),
};

export const Users = {
  list: () => apiFetch("/users").then((d) => d.data.users ?? d.data ?? []),
  // Active waiters for the current branch — used when an owner places an order
  // on a waiter's behalf and must attribute it to a real waiter.
  waiters: () =>
    apiFetch("/users?role=cafe_waiter&is_active=true").then(
      (d) => d.data.users ?? [],
    ),
  get: (id: string) => apiFetch(`/users/${id}`).then((d) => d.data.user),
  create: (b: any) => apiFetch("/users", j(b)),
  // Bulk create/update staff. The backend upserts by id, scopes tenancy from
  // the device/owner token, and hashes a default password for new accounts.
  bulkSync: (users: any[]) => apiFetch("/users/sync", j({ users })),
  update: (id: string, b: any) => apiFetch(`/users/${id}`, put(b)),
  toggle: (id: string) => apiFetch(`/users/${id}/toggle-status`, patch({})),
  // Owner-driven access management: reset a staff login (password OR 4-digit PIN,
  // no current secret needed) and change their role.
  resetPassword: (id: string, b: { password?: string; pin?: string }) =>
    apiFetch(`/users/${id}/reset-password`, j(b)),
  changeRole: (id: string, role: string) =>
    apiFetch(`/users/${id}/role`, patch({ role })),
  // Attach a cashier to one or more departments (order item main_category
  // slugs). Drives the web cashier portal's split-payment scope.
  setCashierDepartments: (id: string, departments: string[]) =>
    apiFetch(`/users/${id}/cashier-departments`, put({ departments })),
};

export const Recipes = {
  // The backend returns a single recipe (with ingredients) per menu item, or null.
  forMenuItem: (menuItemId: string) =>
    apiFetch(`/recipes/menu-item/${menuItemId}`).then((d) => d.data.recipe),
  create: (b: any) => apiFetch("/recipes", j(b)),
  update: (id: string, b: any) => apiFetch(`/recipes/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/recipes/${id}`, del),
};

export const Organizations = {
  list: () => apiFetch("/organizations").then((d) => d.data.organizations ?? []),
  get: (id: string) =>
    apiFetch(`/organizations/${id}`).then((d) => d.data.organization),
  create: (b: any) => apiFetch("/organizations", j(b)),
  update: (id: string, b: any) => apiFetch(`/organizations/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/organizations/${id}`, del), // deactivate
  orders: (id: string) =>
    apiFetch(`/organizations/${id}/orders`).then((d) => d.data.orders ?? []),
  credit: (id: string) =>
    apiFetch(`/organizations/${id}/credit`).then((d) => d.data),
  payments: (id: string) =>
    apiFetch(`/organizations/${id}/payments`).then((d) => d.data.payments ?? []),
  addPayment: (id: string, b: any) =>
    apiFetch(`/organizations/${id}/payments`, j(b)),
  transactions: (id: string, params?: Record<string, any>) =>
    apiFetch(`/organizations/${id}/transactions${qs(params)}`).then((d) => d.data),
  addTransaction: (id: string, b: any) =>
    apiFetch(`/organizations/${id}/transactions`, j(b)),
};

const qs = (params?: Record<string, any>) => {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
};

export type Page<T> = {
  rows: T[];
  count: number;
  page: number;
  limit: number;
  window: { from: string; to: string } | null;
  stats: Record<string, number>;
};

export const Orders = {
  list: (params?: Record<string, any>) =>
    apiFetch(`/orders${qs(params)}`).then((d) => d.data.orders ?? []),
  // Paginated + date-windowed list with server-computed stats. Pass page/limit
  // (and optionally date_from/date_to/search) to opt into pagination.
  page: <T = any>(params?: Record<string, any>): Promise<Page<T>> =>
    apiFetch(`/orders${qs(params)}`).then((d) => ({
      rows: d.data.orders ?? [],
      count: d.data.count ?? 0,
      page: d.data.page ?? 1,
      limit: d.data.limit ?? 0,
      window: d.data.window ?? null,
      stats: d.data.stats ?? {},
    })),
  get: (id: string) => apiFetch(`/orders/${id}`).then((d) => d.data.order),
  // Cancel (void) an order. The backend voids its payments and reverses stock,
  // then realtime-pushes the cancellation to the desktop POS. Gated server-side
  // by the `order_cancellation` permission (DELETE → delete action).
  cancel: (id: string, updated_by?: string) =>
    apiFetch(`/orders/${id}/cancel`, {
      method: "DELETE",
      body: JSON.stringify({ updated_by }),
    }).then((d) => d.data?.order),
  forPayment: () =>
    apiFetch("/orders/for-payment").then((d) => d.data.orders ?? []),
  create: (b: any) => apiFetch("/orders", j(b)),
  zReport: (params: { start_date?: string; end_date?: string }) =>
    apiFetch(`/orders/z-report${qs(params)}`).then((d) => d.data.zReport),
  // Owner-only: settles an organization-attributed order on that
  // organization's own credit ledger — never the shared `payments` table.
  // The backend independently re-checks that `confirmed_by` actually
  // resolves to an owner-level role.
  confirmOrganizationPayment: (id: string, confirmed_by?: string) =>
    apiFetch(`/orders/${id}/organization-payment/confirm`, j({ confirmed_by })),
};

// Orders placed through a configured delivery method — its own tracking
// board, separate from the normal Orders/Payments flow (delivery orders
// never touch the shared payments table; see delivery_payments below).
export const Deliveries = {
  list: (params?: Record<string, any>) =>
    apiFetch(`/orders/deliveries${qs(params)}`).then((d) => d.data.orders ?? []),
  updateDetails: (orderId: string, b: any) =>
    apiFetch(`/orders/${orderId}/delivery`, put(b)),
  addPayment: (orderId: string, b: any) =>
    apiFetch(`/orders/${orderId}/delivery-payments`, j(b)),
  updatePayment: (orderId: string, paymentId: string, b: any) =>
    apiFetch(`/orders/${orderId}/delivery-payments/${paymentId}`, put(b)),
};

export const Payments = {
  history: () => apiFetch("/payments/history").then((d) => d.data.payments ?? []),
  // Paginated + date-windowed history with server-computed stats.
  page: <T = any>(params?: Record<string, any>): Promise<Page<T>> =>
    apiFetch(`/payments/history${qs(params)}`).then((d) => ({
      rows: d.data.payments ?? [],
      count: d.data.count ?? 0,
      page: d.data.page ?? 1,
      limit: d.data.limit ?? 0,
      window: d.data.window ?? null,
      stats: d.data.stats ?? {},
    })),
  get: (id: string) => apiFetch(`/payments/${id}`).then((d) => d.data.payment),
  create: (b: any) => apiFetch("/payments", j(b)).then((d) => d.data.payment),
  confirm: (id: string, processed_by?: string) =>
    apiFetch(`/payments/${id}/confirm`, j({ processed_by })),
};

export const Expenses = {
  list: (params?: Record<string, any>) =>
    apiFetch(`/expenses${qs(params)}`).then((d) => d.data.expenses ?? []),
  summary: (params?: Record<string, any>) =>
    apiFetch(`/expenses/summary${qs(params)}`).then((d) => d.data),
  create: (b: any) => apiFetch("/expenses", j(b)),
  update: (id: string, b: any) => apiFetch(`/expenses/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/expenses/${id}`, del),
};

export const StaffPenalties = {
  list: (params?: Record<string, any>) =>
    apiFetch(`/staff-penalties${qs(params)}`).then((d) => d.data.penalties ?? []),
  summary: (params?: Record<string, any>) =>
    apiFetch(`/staff-penalties/summary${qs(params)}`).then((d) => d.data),
  create: (b: any) => apiFetch("/staff-penalties", j(b)),
  update: (id: string, b: any) => apiFetch(`/staff-penalties/${id}`, put(b)),
  remove: (id: string) => apiFetch(`/staff-penalties/${id}`, del),
};

export const Settings = {
  paymentMethods: () =>
    apiFetch("/settings/payment-methods").then((d) => d.data.payment_methods ?? []),
  createPaymentMethod: (b: any) => apiFetch("/settings/payment-methods", j(b)),
  updatePaymentMethod: (id: string, b: any) =>
    apiFetch(`/settings/payment-methods/${id}`, put(b)),
  removePaymentMethod: (id: string) =>
    apiFetch(`/settings/payment-methods/${id}`, del),
  deliveryMethods: () =>
    apiFetch("/settings/delivery-methods").then((d) => d.data.delivery_methods ?? []),
  createDeliveryMethod: (b: any) => apiFetch("/settings/delivery-methods", j(b)),
  updateDeliveryMethod: (id: string, b: any) =>
    apiFetch(`/settings/delivery-methods/${id}`, put(b)),
  removeDeliveryMethod: (id: string) =>
    apiFetch(`/settings/delivery-methods/${id}`, del),
  // Preconfigured courier profiles — pick one from the delivery management
  // dialog's dropdown instead of typing courier name/phone by hand.
  couriers: () => apiFetch("/settings/couriers").then((d) => d.data.couriers ?? []),
  createCourier: (b: any) => apiFetch("/settings/couriers", j(b)),
  updateCourier: (id: string, b: any) => apiFetch(`/settings/couriers/${id}`, put(b)),
  removeCourier: (id: string) => apiFetch(`/settings/couriers/${id}`, del),
  // Waiter ids the owner has allowed to place delivery orders from their own
  // self-service session (cashiers/back-office are never restricted).
  deliveryAllowedWaiters: () =>
    apiFetch("/settings/system/delivery-allowed-waiters").then(
      (d) => d.data?.waiter_ids ?? [],
    ),
  updateDeliveryAllowedWaiters: (waiter_ids: string[]) =>
    apiFetch("/settings/system/delivery-allowed-waiters", put({ waiter_ids })).then(
      (d) => d.data?.waiter_ids ?? [],
    ),
  // Waiter/cashier ids the owner has allowed to attach an order to an
  // organization while placing it. Distinct from allow_cashier_manage_org_orders
  // above (which is a branch-wide, cashier-only toggle for the standalone
  // Organizations screens) — this is per-employee and covers both roles.
  organizationOrderAllowedUsers: () =>
    apiFetch("/settings/system/organization-order-allowed-users").then(
      (d) => d.data?.user_ids ?? [],
    ),
  updateOrganizationOrderAllowedUsers: (user_ids: string[]) =>
    apiFetch(
      "/settings/system/organization-order-allowed-users",
      put({ user_ids }),
    ).then((d) => d.data?.user_ids ?? []),
  roles: () => apiFetch("/settings/roles").then((d) => d.data.roles ?? []),
  createRole: (b: any) => apiFetch("/settings/roles", j(b)),
  removeRole: (id: string) => apiFetch(`/settings/roles/${id}`, del),

  // Per-branch POS behavior rules. All of these are scoped to the branch the
  // owner has selected (sent as x-branch-id by apiFetch).
  tableSelection: () =>
    apiFetch("/settings/system/table-selection").then((d) => d.data),
  updateTableSelection: (b: { force_table_selection: boolean }) =>
    apiFetch("/settings/system/table-selection", put(b)).then((d) => d.data),
  inventory: () => apiFetch("/settings/system/inventory").then((d) => d.data),
  updateInventory: (b: { allow_low_stock_orders: boolean }) =>
    apiFetch("/settings/system/inventory", put(b)).then((d) => d.data),
  menuAvailability: () =>
    apiFetch("/settings/system/menu-availability").then((d) => d.data),
  updateMenuAvailability: (b: { show_menu_inventory_availability: boolean }) =>
    apiFetch("/settings/system/menu-availability", put(b)).then((d) => d.data),
  // Inventory item ids the owner has chosen to expose to waiters (sign-in
  // page's Inventory tab).
  waiterVisibleInventory: () =>
    apiFetch("/settings/system/waiter-visible-inventory").then(
      (d) => (d.data.item_ids ?? []) as string[],
    ),
  updateWaiterVisibleInventory: (item_ids: string[]) =>
    apiFetch("/settings/system/waiter-visible-inventory", put({ item_ids })).then(
      (d) => (d.data.item_ids ?? []) as string[],
    ),
  organizations: () =>
    apiFetch("/settings/system/organizations").then((d) => d.data),
  updateOrganizations: (b: { allow_cashier_manage_org_orders: boolean }) =>
    apiFetch("/settings/system/organizations", put(b)).then((d) => d.data),
  receipt: () => apiFetch("/settings/system/receipt").then((d) => d.data),
  updateReceipt: (b: { enable_cashier_receipt: boolean }) =>
    apiFetch("/settings/system/receipt", put(b)).then((d) => d.data),
  // Whether the POS prints a void/"DO NOT PREPARE" ticket when a cancelled
  // order had already reached the kitchen. Off by default.
  cancellationPrint: () =>
    apiFetch("/settings/system/cancellation-print").then((d) => d.data),
  updateCancellationPrint: (b: { print_cancelled_order_tickets: boolean }) =>
    apiFetch("/settings/system/cancellation-print", put(b)).then(
      (d) => d.data,
    ),
  // Cancel-order override password. The backend never returns the hash, only
  // whether one is set.
  cancelPassword: () =>
    apiFetch("/settings/system/cancel-password").then((d) => d.data),
  updateCancelPassword: (cancel_password: string) =>
    apiFetch("/settings/system/cancel-password", put({ cancel_password })).then(
      (d) => d.data,
    ),
  // Printer-settings password. Cashiers must enter this before opening the POS
  // printer settings. As with the cancel password, the backend never returns
  // the hash, only whether one is set.
  printerPassword: () =>
    apiFetch("/settings/system/printer-password").then((d) => d.data),
  updatePrinterPassword: (printer_password: string) =>
    apiFetch(
      "/settings/system/printer-password",
      put({ printer_password }),
    ).then((d) => d.data),
  // Per-role history lookback: how many days of past payment/order history each
  // role may view. Returned as { role_history_lookback: { role: days } }; a
  // negative value means "unlimited".
  roleHistoryLookback: () =>
    apiFetch("/settings/system/role-history-lookback").then(
      (d) => d.data.role_history_lookback as Record<string, number>,
    ),
  updateRoleHistoryLookback: (role_history_lookback: Record<string, number>) =>
    apiFetch("/settings/system/role-history-lookback", put({ role_history_lookback })).then(
      (d) => d.data.role_history_lookback as Record<string, number>,
    ),
  // Permanently delete every order and payment for the selected branch
  // (scoped server-side via x-branch-id). Irreversible.
  cleanupData: () => apiFetch("/settings/cleanup-data", j({})),
};

// Per-role permission matrices (owner-configurable). `me` is the effective
// matrix for the signed-in user; `list` returns every configurable role for the
// editor; `save` upserts one role's matrix.
export const Permissions = {
  me: () => apiFetch("/role-permissions/me").then((d) => d.data),
  list: () =>
    apiFetch("/role-permissions").then((d) => d.data.roles ?? []),
  // `permissions` values may also carry a `locations?: string[]` allow-list
  // (see PermissionMatrix in lib/permissions.ts) for location-scoped
  // resources like "inventory"/"transfers".
  save: (role: string, permissions: Record<string, Record<string, boolean | string[] | undefined>>) =>
    apiFetch(`/role-permissions/${encodeURIComponent(role)}`, put({ permissions })),
};

export const Account = {
  // Update the signed-in user's profile. The backend splits full_name into
  // first/last and returns the refreshed user under `user`.
  updateProfile: (userId: string, b: { full_name: string; username: string }) =>
    apiFetch(`/auth/profile/${userId}`, put(b)).then((d) => d.user),
  changePassword: (userId: string, current_password: string, new_password: string) =>
    apiFetch(`/users/${userId}/change-password`, j({ current_password, new_password })),
};

export const Devices = {
  // The devices enrolled to a branch, with an online flag.
  list: (branch_id: string) =>
    apiFetch(`/devices?branch_id=${encodeURIComponent(branch_id)}`),
  // Reusable per-branch enrollment code: view the current one, or rotate it.
  getEnrollmentCode: (branch_id: string) =>
    apiFetch(`/devices/enrollment-codes?branch_id=${encodeURIComponent(branch_id)}`),
  rotateEnrollmentCode: (branch_id: string) =>
    apiFetch("/devices/enrollment-codes", j({ branch_id })),
  // Kick out (permanently remove) an enrolled device. The device's token stops
  // working immediately and it falls back to the enrollment screen.
  remove: (id: string, branch_id: string) =>
    apiFetch(
      `/devices/${id}?branch_id=${encodeURIComponent(branch_id)}`,
      del,
    ),
};

// Desktop devices request a local data wipe; the owner approves/rejects it here.
// Once approved, the device clears its local tables and the backend drops this
// branch's orders & payments. Scoped to the branch via branch_id / x-branch-id.
export const DataCleanup = {
  list: (branch_id: string) =>
    apiFetch(
      `/data-cleanup/requests?branch_id=${encodeURIComponent(branch_id)}`,
    ).then((d) => d.requests ?? []),
  approve: (id: string) =>
    apiFetch(`/data-cleanup/requests/${id}/approve`, j({})),
  reject: (id: string) =>
    apiFetch(`/data-cleanup/requests/${id}/reject`, j({})),
  // Owner-initiated: pushes a pre-approved wipe straight to a device, skipping
  // the device-request step. The device clears it on its next poll (~30s).
  push: (branch_id: string, device_id: string, reason?: string) =>
    apiFetch("/data-cleanup/push", j({ branch_id, device_id, reason })),
};
