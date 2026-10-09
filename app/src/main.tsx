import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/outfit'
import '@fontsource-variable/noto-sans-ethiopic'
import './index.css'
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from 'next-themes';
import { bootstrapApp } from './bootstrap/container';
import { startSyncServices } from './bootstrap/sync';
import { registerClearDiningTablesOnClose } from './bootstrap/clear-dining-tables-on-close';
import { loadDeviceEnrollment } from '@/shared/utils/deviceToken';
import '@/infrastructure/sync/sync-engine';

// Hydrate the device token from SQLite before sync starts so every request
// carries x-device-token from the first call.
void bootstrapApp()
  .then(() => loadDeviceEnrollment())
  .then(() => startSyncServices());
void registerClearDiningTablesOnClose();

// Compact toast: ink on white with a coloured left rule for the status.
const TOAST_BASE =
  '!bg-card !text-foreground !border !border-border !border-l-4 !shadow-pop !rounded-xl !text-meta !font-medium !px-3 !py-2';


ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 2000,
            className: `${TOAST_BASE} !border-l-muted-foreground`,
            success: {
              className: `${TOAST_BASE} !border-l-success`,
              iconTheme: { primary: 'hsl(var(--success))', secondary: 'hsl(var(--success-foreground))' },
            },
            error: {
              duration: 2000,
              className: `${TOAST_BASE} !border-l-destructive`,
              iconTheme: { primary: 'hsl(var(--destructive))', secondary: 'hsl(var(--destructive-foreground))' },
            },
            loading: {
              className: `${TOAST_BASE} !border-l-primary`,
            },
          }}
        />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
