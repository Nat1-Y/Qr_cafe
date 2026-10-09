// Per-branch list of waiter user ids the owner has allowed to place delivery
// orders. Stored as a single JSON array under one system_settings key, same
// shape/pattern as WAITER_VISIBLE_INVENTORY_SETTING_KEY in
// ../inventory/waiter-visibility.ts (id-list cleaning/parsing reused from there).

export { cleanItemIdList as cleanWaiterIdList, parseItemIdList as parseWaiterIdList } from "../inventory/waiter-visibility";

export const DELIVERY_ALLOWED_WAITERS_SETTING_KEY = "delivery_allowed_waiter_ids";
