import { getCurrentVersion } from "@/infrastructure/updater/updater";

// The running app version, resolved once from the Tauri shell and cached so the
// (synchronous) axios request interceptor can stamp it onto the x-app-version
// header. The backend records it against the device for the platform monitor.
let cachedVersion: string | null = null;

// Kick off resolution as soon as this module loads. `getCurrentVersion` returns
// "dev" in the browser and the tauri.conf.json version inside the desktop shell.
void getCurrentVersion()
  .then((v) => {
    cachedVersion = v;
  })
  .catch(() => {
    cachedVersion = null;
  });

/** The cached app version, or null until the async resolution above completes. */
export const getAppVersion = (): string | null => cachedVersion;
