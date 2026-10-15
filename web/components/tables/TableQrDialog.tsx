"use client";

import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AlertTriangleIcon, DownloadIcon, PrinterIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tables } from "@/lib/resources";
import { friendlyError } from "@/lib/errors";
import { guestUrl, pointsAtLocalhost, tableTitle, type QrTable } from "@/lib/qr";

/** Real colour values for exported files (files can't read CSS variables). */
function paperColors(): { fg: string; bg: string } {
  const css = getComputedStyle(document.documentElement);
  return {
    fg: css.getPropertyValue("--paper-foreground").trim() || "black",
    bg: css.getPropertyValue("--paper").trim() || "white",
  };
}

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function TableQrDialog({
  table,
  open,
  onOpenChange,
  onChanged,
}: {
  table: QrTable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const svgWrap = useRef<HTMLDivElement>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = guestUrl(table.qr_token);
  const fileBase = `table-${table.table_number}-qr`;

  /** The on-screen code as standalone SVG markup, with real paper colours. */
  const svgMarkup = (): string | null => {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return null;
    const { fg, bg } = paperColors();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.querySelector("title")?.remove();
    clone.querySelectorAll("path").forEach((p, i) => p.setAttribute("fill", i === 0 ? bg : fg));
    return new XMLSerializer().serializeToString(clone);
  };

  const downloadSvg = () => {
    const markup = svgMarkup();
    if (!markup) return;
    const href = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    download(`${fileBase}.svg`, href);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  // Rasterise the SVG at print resolution so the PNG stays sharp.
  const downloadPng = () => {
    const markup = svgMarkup();
    if (!markup) return;
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      download(`${fileBase}.png`, canvas.toDataURL("image/png"));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  };

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await Tables.update(table.id, { qr_enabled: on });
      toast.success(on ? "Guests can order from this table again" : "QR ordering is off for this table");
      await onChanged();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't change this table. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      await Tables.rotateQr(table.id);
      toast.success("New QR code made. Print the new card for this table.");
      setConfirmRotate(false);
      await onChanged();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't make a new QR code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setConfirmRotate(false);
        onOpenChange(o);
      }}>
      <DialogContent className="max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{tableTitle(table)}</DialogTitle>
          <DialogDescription>Guests scan this code to see the menu and order from this table.</DialogDescription>
        </DialogHeader>

        {pointsAtLocalhost() ? (
          <p className="flex gap-2 rounded-card bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            This code points to this computer only, so phones can&apos;t open it. Open the dashboard from your
            network or public address before printing.
          </p>
        ) : null}

        <div className="flex flex-col items-center gap-3">
          <div ref={svgWrap} className="rounded-card bg-paper p-4 shadow-pop">
            <QRCodeSVG
              value={url}
              size={220}
              level="M"
              marginSize={1}
              bgColor="var(--paper)"
              fgColor="var(--paper-foreground)"
              title={`QR code for ${tableTitle(table)}`}
            />
          </div>
          <a href={url} target="_blank" rel="noreferrer" className="block w-full text-center text-sm break-all text-primary underline-offset-4 hover:underline">
            {url}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={downloadPng}>
            <DownloadIcon /> PNG
          </Button>
          <Button variant="outline" onClick={downloadSvg}>
            <DownloadIcon /> SVG
          </Button>
          <Button variant="outline" className="col-span-2" asChild>
            <a href={`/dashboard/print-cards?ids=${table.id}`} target="_blank" rel="noreferrer">
              <PrinterIcon /> Print table card
            </a>
          </Button>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-card border border-border p-3">
          <span>
            <span className="block font-semibold text-foreground">Guests can order from this table</span>
            <span className="block text-sm text-muted-foreground">Turn off to stop QR orders here only.</span>
          </span>
          <Switch checked={table.qr_enabled} disabled={busy} onCheckedChange={(on) => void toggle(on)} />
        </label>

        {confirmRotate ? (
          <div className="space-y-3 rounded-card bg-destructive-soft p-4">
            <p className="text-sm font-medium text-destructive">
              The card on this table will stop working straight away. You&apos;ll need to print and put out the new one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirmRotate(false)} disabled={busy}>
                Keep the old code
              </Button>
              <Button onClick={() => void rotate()} disabled={busy}>
                Make a new QR code
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="justify-self-start" onClick={() => setConfirmRotate(true)}>
            <RefreshCwIcon /> Make a new QR code
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
