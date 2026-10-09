import { getLocalDb } from "./client";
import { localDbTables } from "./schema";
import {
  LocalAttendance,
  LocalCategory,
  LocalInventoryItem,
  LocalMainCategory,
  LocalMenuItem,
  LocalMenuItemCategory,
  LocalOrder,
  LocalPayment,
  LocalPaymentMethod,
  LocalRole,
  LocalStockMovement,
  LocalStockTransfer,
  LocalStockTransferItem,
  LocalStockLocation,
  LocalTable,
  LocalUser,
} from "./types";
import { getApproximateServerNow } from "@/shared/utils/serverTime";

export type {
  LocalUser,
  LocalRole,
  LocalPaymentMethod,
  LocalMenuItem,
  LocalCategory,
  LocalMainCategory,
  LocalMenuItemCategory,
  LocalTable,
  LocalOrder,
  LocalPayment,
  LocalAttendance,
  LocalInventoryItem,
  LocalStockMovement,
  LocalStockTransfer,
  LocalStockTransferItem,
  LocalStockLocation,
};

export { getLocalDb, localDbTables };

// Utility function to generate unique UUIDs for local records
export function generateLocalId(): string {
  try {
    if (
      typeof window !== "undefined" &&
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }
  } catch (e) {
    // fallback
  }
  return (
    "local_" + getApproximateServerNow() + "_" + Math.random().toString(36).substring(2, 11)
  );
}

// Menu items/categories are no longer wiped here — the menu sync now
// reconciles updates and deletes against the full remote list directly
// (see cacheRemoteMenuItems in menu.adapter.ts), so a full teardown-and-
// refetch on every close is no longer needed.
export async function clearDiningTablesCache(): Promise<void> {
  const db = await getLocalDb();
  await db.delete(localDbTables.diningTables);
}

// Menu items/categories are intentionally NOT wiped here. This runs on every
// ordinary login, paired with an unawaited, interruptible background resync
// (see AuthContext login). If the app closes/crashes or the network drops
// before that resync lands, a delete-then-refetch pair leaves the menu
// permanently empty — the pooled SQLite connection has no working
// transactions to make the pair atomic. The menu sync already reconciles
// updates and deletes safely against the full remote list on its own (see
// cacheRemoteMenuItems in menu.adapter.ts), so wiping first isn't needed for
// routine refreshes. Only deliberate full wipes (wipeAllLocalDataKeepEnrollment,
// device reset) clear the menu — see those call sites below.
export async function clearAllLocalData(): Promise<void> {
  const db = await getLocalDb();
  await db.delete(localDbTables.users);
  await db.delete(localDbTables.roles);
  await db.delete(localDbTables.paymentMethods);
  await db.delete(localDbTables.diningTables);
  await db.delete(localDbTables.attendance);
  await db.delete(localDbTables.inventoryItems);
  await db.delete(localDbTables.inventoryStock);
  await db.delete(localDbTables.stockMovements);
  await db.delete(localDbTables.stockTransfers);
  await db.delete(localDbTables.stockTransferItems);
  await db.delete(localDbTables.stockLocations);
  await db.delete(localDbTables.systemSettings);
  await db.delete(localDbTables.organizations);
  await db.delete(localDbTables.recipes);
  await db.delete(localDbTables.recipeIngredients);
}

/**
 * Full local wipe used by the owner-approved data cleanup. Clears everything
 * clearAllLocalData() does, plus the menu (items/categories — deliberately
 * excluded from clearAllLocalData(), see the comment there) and
 * orders/payments/expenses (which clearAllLocalData() protects on logout).
 * Deliberately KEEPS device_enrollment so the device stays pinned to its
 * branch and re-pulls reference data on the next sync. Deletes run
 * sequentially — the pooled SQLite connection has no working transactions.
 */
export async function wipeAllLocalDataKeepEnrollment(): Promise<void> {
  const db = await getLocalDb();
  await clearAllLocalData();
  await db.delete(localDbTables.menuItems);
  await db.delete(localDbTables.categories);
  await db.delete(localDbTables.mainCategories);
  await db.delete(localDbTables.menuItemCategories);
  await db.delete(localDbTables.orders);
  await db.delete(localDbTables.payments);
  await db.delete(localDbTables.expenses);
  await db.delete(localDbTables.itemAdditions);
}

// Global script to instantly wipe all local data from the Developer Console
if (typeof window !== "undefined") {
  (window as any).clearDb = async () => {
    // console.log("[SQLite DB] Wiping all local data...");
    await clearAllLocalData();
    // console.log("[SQLite DB] All local data has been successfully cleared!");
    alert("Local Database Cleared! Please refresh the page.");
  };
}
