/**
 * Z-Report: end-of-day / shift sales summary with payment breakdown, employee
 * activity, and voided transactions.
 */
import { ReceiptBlock } from "@/utils/receiptImage";
import { AMHARIC_FONT_STACK, printHTML } from "./html-printer";
import { escapeHtml } from "./format";
import { humanize } from "@/lib/format";

// The backend's voided order_id is not a readable number; show the order's own
// number when present, never a raw id.
const voidedOrderLabel = (txn: { order_number?: number | string | null; order_id?: number | string | null }) =>
  txn?.order_number != null ? `#${txn.order_number}` : Number.isFinite(Number(txn?.order_id)) && txn?.order_id != null ? `#${txn.order_id}` : "—";
import {
  isTauriRuntime,
  resolveThermalPrinterName,
  printReceiptImage,
} from "./thermal-printer";

/**
 * Print Z-Report for end-of-day/shift sales summary
 *
 * @param {Object} zReport - The Z-report data object
 * @returns {Promise<void>}
 */
export async function printZReport(zReport: any) {
  if (!zReport) return;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // 1. Try Native Thermal Printing if it's a Tauri app and printer is selected
  try {
    if (isTauriRuntime()) {
      const printerName = await resolveThermalPrinterName();

      if (printerName) {
        // Render Z-report as an image so Amharic / Ge'ez text prints correctly
        const blocks: ReceiptBlock[] = [
          { kind: "title", text: "Syntax services" },
          {
            kind: "text",
            text: "END OF DAY REPORT",
            align: "center",
            bold: true,
          },
          { kind: "divider" },
          { kind: "text", text: `Date: ${formatDate(zReport.report_date)}` },
          { kind: "text", text: `Period: ${formatDate(zReport.period_start)}` },
          { kind: "text", text: `To: ${formatDate(zReport.period_end)}` },
          { kind: "divider" },
          {
            kind: "text",
            text: "SUMMARY",
            align: "center",
            bold: true,
          },
          { kind: "divider" },
          {
            kind: "row",
            widths: [25, 20],
            align: ["left", "right"],
            cells: ["Total orders:", String(zReport.summary.total_orders)],
          },
          {
            kind: "row",
            widths: [25, 20],
            align: ["left", "right"],
            cells: ["Total sales:", formatCurrency(zReport.summary.gross_sales)],
          },
          {
            kind: "row",
            widths: [25, 20],
            align: ["left", "right"],
            cells: ["Cancelled:", formatCurrency(zReport.summary.refunds)],
          },
          {
            kind: "row",
            widths: [25, 20],
            align: ["left", "right"],
            cells: ["Sales after discounts:", formatCurrency(zReport.summary.net_sales)],
          },
          { kind: "divider" },
          {
            kind: "text",
            text: "PAID WITH",
            align: "center",
            bold: true,
          },
          { kind: "divider" },
        ];

        zReport.payment_breakdown.forEach((payment: any) => {
          blocks.push({
            kind: "row",
            widths: [20, 10, 15],
            align: ["left", "right", "right"],
            cells: [
              humanize(payment.method),
              String(payment.count),
              formatCurrency(payment.amount),
            ],
          });
        });

        blocks.push({ kind: "divider" });
        blocks.push({
          kind: "text",
          text: "STAFF SALES",
          align: "center",
          bold: true,
        });
        blocks.push({ kind: "divider" });

        zReport.employee_activity.forEach((employee: any) => {
          blocks.push({
            kind: "row",
            widths: [20, 8, 17],
            align: ["left", "right", "right"],
            cells: [
              employee.employee_name.substring(0, 18),
              String(employee.orders_count),
              formatCurrency(employee.total_sales),
            ],
          });
        });

        if (zReport.voided_transactions.length > 0) {
          blocks.push({ kind: "divider" });
          blocks.push({
            kind: "text",
            text: "CANCELLED ORDERS",
            align: "center",
            bold: true,
          });
          blocks.push({ kind: "divider" });

          zReport.voided_transactions.forEach((txn: any) => {
            blocks.push({
              kind: "row",
              widths: [8, 15, 12],
              align: ["left", "left", "right"],
              cells: [
                voidedOrderLabel(txn),
                txn.employee_name.substring(0, 12),
                formatCurrency(txn.amount),
              ],
            });
          });
        }

        blocks.push({ kind: "divider" });
        blocks.push({ kind: "gap", height: 12 });
        blocks.push({ kind: "text", text: "End of day report" });

        await printReceiptImage(printerName, blocks);

        return; // Success!
      }
    }
  } catch (err) {
    console.error("Native Z-report print failed, falling back to HTML:", err);
  }

  // 2. Fallback: Browser HTML Printing
  const paymentRows = zReport.payment_breakdown
    .map((p: any) => `
      <tr>
        <td class="text-left">${escapeHtml(humanize(p.method))}</td>
        <td class="text-right">${escapeHtml(String(p.count))}</td>
        <td class="text-right">${escapeHtml(formatCurrency(p.amount))}</td>
        <td class="text-right">${escapeHtml(p.percentage.toFixed(1))}%</td>
      </tr>
    `)
    .join("");

  const employeeRows = zReport.employee_activity
    .map((e: any) => `
      <tr>
        <td class="text-left">${escapeHtml(e.employee_name)}</td>
        <td class="text-right">${escapeHtml(String(e.orders_count))}</td>
        <td class="text-right">${escapeHtml(formatCurrency(e.total_sales))}</td>
      </tr>
    `)
    .join("");

  const voidedRows = zReport.voided_transactions.length > 0
    ? zReport.voided_transactions
      .map((v: any) => `
          <tr>
            <td class="text-left">${escapeHtml(voidedOrderLabel(v))}</td>
            <td class="text-left">${escapeHtml(v.employee_name)}</td>
            <td class="text-right text-red-600">${escapeHtml(formatCurrency(v.amount))}</td>
            <td class="text-left">${escapeHtml(formatDate(v.created_at))}</td>
          </tr>
        `)
      .join("")
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>End of day report</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0;
    padding: 0;
    background: white;
    color: #000;
    font-family: ${AMHARIC_FONT_STACK};
  }
  .ticket {
    width: 80mm;
    padding: 5mm;
    background: white;
  }
  .rule { border-top: 1px dashed #000; margin: 8px 0; }
  .header { text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 4px; }
  .section-title { text-align: center; font-weight: bold; font-size: 12px; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
  .text-right { text-align: right; }
  .text-left { text-align: left; }
  .text-center { text-align: center; }
  .text-red-600 { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { text-align: left; font-size: 10px; padding: 2px 0; border-bottom: 1px solid #000; }
  td { font-size: 10px; padding: 2px 0; }
  .meta { font-size: 9px; color: #666; margin-top: 8px; }

  @media print {
    body { width: 80mm; }
    .ticket { padding: 3mm; }
  }
</style>
</head>
<body>
  <div class="ticket">
    <div class="header">Syntax Services</div>
    <div class="section-title">END OF DAY REPORT</div>
    <div class="rule"></div>

    <div class="row"><span>Date:</span><span>${escapeHtml(formatDate(zReport.report_date))}</span></div>
    <div class="row"><span>Period:</span><span>${escapeHtml(formatDate(zReport.period_start))}</span></div>
    <div class="row"><span>To:</span><span>${escapeHtml(formatDate(zReport.period_end))}</span></div>

    <div class="rule"></div>
    <div class="section-title">SUMMARY</div>
    <div class="rule"></div>
    <div class="row"><span>Total orders:</span><span>${escapeHtml(String(zReport.summary.total_orders))}</span></div>
    <div class="row"><span>Total sales:</span><span>${escapeHtml(formatCurrency(zReport.summary.gross_sales))}</span></div>
    <div class="row"><span>Cancelled:</span><span class="text-red-600">${escapeHtml(formatCurrency(zReport.summary.refunds))}</span></div>
    <div class="row"><span>Sales after discounts:</span><span>${escapeHtml(formatCurrency(zReport.summary.net_sales))}</span></div>

    <div class="rule"></div>
    <div class="section-title">PAID WITH</div>
    <div class="rule"></div>
    <table>
      <thead>
        <tr>
          <th>Paid with</th>
          <th class="text-right">Count</th>
          <th class="text-right">Amount</th>
          <th class="text-right">%</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>

    <div class="rule"></div>
    <div class="section-title">STAFF SALES</div>
    <div class="rule"></div>
    <table>
      <thead>
        <tr>
          <th>Staff</th>
          <th class="text-right">Orders</th>
          <th class="text-right">Sales</th>
        </tr>
      </thead>
      <tbody>${employeeRows}</tbody>
    </table>

    ${zReport.voided_transactions.length > 0 ? `
    <div class="rule"></div>
    <div class="section-title">CANCELLED ORDERS</div>
    <div class="rule"></div>
    <table>
      <thead>
        <tr>
          <th>Order</th>
          <th>Staff</th>
          <th class="text-right">Amount</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>${voidedRows}</tbody>
    </table>
    ` : ''}

    <div class="rule"></div>
    <div class="meta text-center">
      Printed via Cafe System
      End of day report
    </div>
  </div>
</body>
</html>`;

  await printHTML(html);
}
