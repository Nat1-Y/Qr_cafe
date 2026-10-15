"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangleIcon, PrinterIcon, ScanLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QrOrdering, Tables } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";
import { guestUrl, pointsAtLocalhost, type QrSettingsResponse, type QrTable } from "@/lib/qr";

/**
 * A6 table cards (105 × 148 mm), one per printed page: café name, the QR,
 * the table, and "Scan to order" in English and Amharic. Prints on any
 * printer; cut along the page edge.
 */
export function PrintCards() {
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const [tables, setTables] = useState<QrTable[] | null>(null);
  const [cafe, setCafe] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ids = idsParam.split(",").filter(Boolean);
    Promise.all([Tables.list() as Promise<QrTable[]>, QrOrdering.get() as Promise<QrSettingsResponse>])
      .then(([rows, qr]) => {
        if (!alive) return;
        const picked = rows
          .filter((t) => ids.length === 0 || ids.includes(t.id))
          .sort((a, b) => a.table_number - b.table_number);
        setTables(picked);
        setCafe(qr.branch.name);
      })
      .catch((e: unknown) => alive && setError(friendlyError(e, "Couldn't load the tables. Please try again.")));
    return () => {
      alive = false;
    };
  }, [idsParam]);

  return (
    <div className="min-h-dvh bg-muted print:bg-paper">
      <style>{`
        @page { size: A6 portrait; margin: 0; }
        @media print {
          html, body { background: var(--paper) !important; }
          .qr-card { break-after: page; box-shadow: none !important; border: 0 !important; margin: 0 !important; }
          .qr-card:last-child { break-after: auto; }
        }
      `}</style>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-card px-6 py-4 print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-section text-foreground">Table QR cards</h1>
          <p className="text-sm text-muted-foreground">
            {tables ? `${tables.length} card${tables.length === 1 ? "" : "s"} · A6, one per page` : "Loading…"}
          </p>
        </div>
        <Button onClick={() => window.print()} disabled={!tables?.length}>
          <PrinterIcon /> Print
        </Button>
      </div>

      {pointsAtLocalhost() ? (
        <p className="mx-6 mt-4 flex gap-2 rounded-card bg-warning-soft p-3 text-sm text-warning print:hidden">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          These codes point to this computer only, so phones can&apos;t open them. Open the dashboard from your
          network or public address before printing.
        </p>
      ) : null}
      {error ? <p className="m-6 text-destructive">{error}</p> : null}

      <div className="flex flex-wrap justify-center gap-6 p-6 print:block print:p-0">
        {tables === null && !error
          ? [0, 1].map((i) => <Skeleton key={i} className="h-[148mm] w-[105mm] rounded-card" />)
          : null}
        {tables?.map((t) => (
          <section
            key={t.id}
            className="qr-card flex h-[148mm] w-[105mm] flex-col items-center justify-between overflow-hidden rounded-card border border-border bg-paper p-[8mm] text-paper-foreground shadow-pop [print-color-adjust:exact]">
            <header className="w-full text-center">
              <p className="truncate text-[15pt] font-semibold">{cafe}</p>
              <div aria-hidden className="mx-auto mt-[2mm] h-[1.2mm] w-[18mm] rounded-full bg-primary" />
            </header>

            <div className="flex flex-col items-center gap-[3mm]">
              <QRCodeSVG
                value={guestUrl(t.qr_token)}
                size={260}
                level="M"
                marginSize={0}
                bgColor="var(--paper)"
                fgColor="var(--paper-foreground)"
                style={{ width: "62mm", height: "62mm" }}
              />
              <p className="flex items-center gap-[2mm] text-[13pt] font-semibold">
                <ScanLineIcon className="size-[5mm]" aria-hidden /> Scan to order
              </p>
              <p lang="am" className="text-[12pt] font-medium">ለማዘዝ ይቃኙ</p>
            </div>

            <footer className="text-center">
              <p className="text-[26pt] leading-none font-semibold">Table {t.table_number}</p>
              <p className="mt-[1.5mm] min-h-[5mm] text-[11pt]">{t.label ?? ""}</p>
              <p className="mt-[2mm] text-[8.5pt] opacity-70">Point your phone camera at the code · No app needed</p>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
