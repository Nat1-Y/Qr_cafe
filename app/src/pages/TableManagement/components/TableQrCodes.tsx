import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api as httpApi } from '@/infrastructure/api/http-client';

interface ServerTable {
  id: string;
  table_number: number;
  label: string | null;
  qr_token: string;
  qr_enabled: boolean;
}

/**
 * The QR code guests scan at each table, straight from the server (tokens
 * live there, not in the till's local copy). Viewing only — printing cards,
 * turning QR off for a table and making new codes are in the web dashboard
 * under Tables, so there's one place to manage them.
 */
export function TableQrCodes() {
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<ServerTable[] | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([httpApi.get('/tables'), httpApi.get('/settings/qr')])
      .then(([t, s]) => {
        if (!alive) return;
        const rows = (t?.data?.data?.tables ?? []) as ServerTable[];
        setTables(rows.slice().sort((a, b) => a.table_number - b.table_number));
        setBase((s?.data?.data?.guest_base_url as string | null) ?? null);
      })
      .catch(() => alive && setError("Couldn't load the QR codes. Check the internet connection and try again."));
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <QrCode />
        QR codes
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Table QR codes</DialogTitle>
            <DialogDescription>
              Guests scan these to order from their table. Print table cards, turn QR ordering off for a table or make a
              new code in the web dashboard under Tables.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!tables && !error ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-56 rounded-card" />
              ))}
            </div>
          ) : null}
          {tables && !base ? (
            <p className="text-sm text-warning">The server doesn&apos;t know the guest web address yet (GUEST_BASE_URL).</p>
          ) : null}
          {tables && base ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {tables.map((t) => (
                <li key={t.id} className="flex flex-col items-center gap-2 rounded-card border border-border bg-card p-4">
                  <div className="rounded-lg bg-paper p-2">
                    <QRCodeSVG
                      value={`${base}/t/${t.qr_token}`}
                      size={140}
                      level="M"
                      marginSize={1}
                      bgColor="hsl(var(--paper))"
                      fgColor="hsl(var(--paper-foreground))"
                    />
                  </div>
                  <p className="font-semibold text-foreground">
                    Table {t.table_number}
                    {t.label ? ` · ${t.label}` : ''}
                  </p>
                  {t.qr_enabled ? <Badge variant="success">QR ordering on</Badge> : <Badge variant="secondary">QR ordering off</Badge>}
                </li>
              ))}
            </ul>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
