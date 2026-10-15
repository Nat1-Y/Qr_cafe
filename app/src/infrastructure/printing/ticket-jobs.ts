import type { ReceiptBlock } from "@/utils/receiptImage";
import {
  hasOrderBeenPrintedHere,
  recordOrderPrintedHere,
} from "@/infrastructure/printing/printed-registry";

/**
 * Pick the printer for one ticket. The section's own printer when it's
 * connected; otherwise the main printer — the simple-mode printer when simple
 * mode is on, else the active printer — so a section with no printer assigned
 * still prints instead of silently dropping its ticket. `viaFallback` tells
 * callers the ticket isn't on its own route (the price toggle then applies).
 */
export function pickTicketPrinter(
  configured: string | undefined,
  availablePrinters: string[],
  mainPrinter: string,
): { printer: string; viaFallback: boolean } | null {
  const name = String(configured || "").trim();
  if (name && availablePrinters.includes(name)) {
    return { printer: name, viaFallback: false };
  }
  const main = String(mainPrinter || "").trim();
  if (main && availablePrinters.includes(main)) {
    return { printer: main, viaFallback: true };
  }
  return null;
}

/**
 * Send one job per printer, at most once each. Every printer's success is
 * recorded under `${key}@${printer}` the moment it prints, so when one printer
 * fails (out of paper, unplugged) the retry prints ONLY the missing tickets —
 * never a duplicate of the ones that already came out. Throws if any printer
 * failed, so the caller doesn't mark the order printed until every section's
 * ticket is out: a ticket is never lost and never duplicated.
 *
 * An empty `key` (a deliberate manual reprint) skips the registry and prints
 * every job.
 */
export async function runTicketJobs(
  key: string,
  jobsByPrinter: Record<string, unknown>,
  print: (job: unknown) => Promise<unknown>,
): Promise<void> {
  const failed: string[] = [];
  for (const [printer, job] of Object.entries(jobsByPrinter)) {
    const jobKey = key ? `${key}@${printer}` : "";
    if (jobKey && hasOrderBeenPrintedHere(jobKey)) continue;
    try {
      await print(job);
      if (jobKey) recordOrderPrintedHere(jobKey);
    } catch (err) {
      console.error(`[print] Ticket for ${key} failed on ${printer}`, err);
      failed.push(printer || "main printer");
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `Couldn't print on ${failed.join(", ")}. Check the printer is on and has paper — the ticket will print as soon as it's back.`,
    );
  }
}

/** True for orders guests placed by scanning their table's QR code. */
export function isQrOrder(order: { source?: unknown } | null | undefined): boolean {
  return order?.source === "qr";
}

/**
 * Header lines for a QR order's ticket: a loud "QR ORDER · Table 7" and the
 * guest's name when they gave one. Replaces the Table/Waiter lines (a QR
 * order has no waiter).
 */
export function qrTicketHeader(order: { table_number?: unknown; meta?: unknown }): ReceiptBlock[] {
  const meta = (order.meta ?? {}) as { customer_name?: unknown; qr_table_label?: unknown };
  const table = order.table_number != null ? ` · Table ${String(order.table_number)}` : "";
  const blocks: ReceiptBlock[] = [
    { kind: "text", text: `QR ORDER${table}`, align: "center", bold: true, large: true },
  ];
  if (typeof meta.qr_table_label === "string" && meta.qr_table_label.trim()) {
    blocks.push({ kind: "text", text: meta.qr_table_label.trim(), align: "center", bold: true });
  }
  if (typeof meta.customer_name === "string" && meta.customer_name.trim()) {
    blocks.push({ kind: "text", text: `Guest: ${meta.customer_name.trim()}`, align: "center", bold: true });
  }
  return blocks;
}
