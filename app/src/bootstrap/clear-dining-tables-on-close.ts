import { getCurrentWindow } from '@tauri-apps/api/window';
import { clearDiningTablesCache } from '@/db/localDb';

let registered = false;

// Clears the dining-tables cache whenever the app window is about to close
// (menu items/categories are handled by sync reconciliation instead, see
// cacheRemoteMenuItems in menu.adapter.ts).
export async function registerClearDiningTablesOnClose(): Promise<void> {
  if (registered) return;
  if (typeof window === 'undefined') return;

  let appWindow: ReturnType<typeof getCurrentWindow>;
  try {
    appWindow = getCurrentWindow();
  } catch {
    // Not running inside Tauri (e.g. plain browser); nothing to do.
    return;
  }

  registered = true;

  await appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    try {
      await clearDiningTablesCache();
    } catch (error) {
      console.error('[ClearDiningTablesOnClose] Failed to clear dining tables cache:', error);
    } finally {
      await appWindow.destroy();
    }
  });
}
