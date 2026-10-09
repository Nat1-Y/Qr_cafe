// Per-branch list of waiter/cashier user ids the owner has allowed to attach an
// order to an organization while placing it. Stored as a single JSON array
// under one system_settings key, same shape/pattern as
// DELIVERY_ALLOWED_WAITERS_SETTING_KEY in ../delivery/delivery-settings.ts
// (id-list cleaning/parsing reused from ../inventory/waiter-visibility.ts).
// Unlike the delivery allow-list, this one isn't role-scoped to waiters only —
// see order.service.ts's assertUserAllowedForOrganizationOrder.

export { cleanItemIdList as cleanOrgOrderUserIdList, parseItemIdList as parseOrgOrderUserIdList } from "../inventory/waiter-visibility";

export const ORGANIZATION_ORDER_ALLOWED_USERS_SETTING_KEY = "organization_order_allowed_user_ids";
