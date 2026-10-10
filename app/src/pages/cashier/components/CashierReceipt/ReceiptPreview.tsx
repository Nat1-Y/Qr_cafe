
import React, { useRef, useState, useEffect } from 'react';
import { Order } from '@/types/api.types';
import { ReceiptFormat } from '../../hooks/useReceiptData';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { Printer, ChevronDown } from 'lucide-react';

interface ReceiptPreviewProps {
  order: Order | null;
  format: ReceiptFormat;
  loading?: boolean;
}

export const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({
  order,
  format,
  loading = false
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [showPrinterDropdown, setShowPrinterDropdown] = useState(false);

  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const { list_thermal_printers } = await import('tauri-plugin-thermal-printer');
        const printers = (await list_thermal_printers()) as any;
        const printerNames = printers.map((p: any) =>
          typeof p === 'string' ? p : p.name || p.address || ''
        ).filter((p: string) => p.trim() !== '');
        setAvailablePrinters(printerNames);
        if (printerNames.length > 0 && !selectedPrinter) {
          setSelectedPrinter(printerNames[0]);
        }
      } catch (err) {
        console.error('Failed to fetch printers:', err);
      }
    };
    fetchPrinters();
  }, [selectedPrinter]);

  const handlePrint = async () => {
    if (!order) {
      toast.error('No order selected');
      return;
    }

    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    try {
      const { print_thermal_printer } = await import('tauri-plugin-thermal-printer');
      const printerName = selectedPrinter;

      const items = order?.items || [];

      const sections: any[] = [
        { Text: { text: format.businessName, align: 'Center' } },
        { Text: { text: format.businessAddress, align: 'Center' } },
        { Text: { text: format.businessPhone, align: 'Center' } },
        { Text: { text: '--------------------------------', align: 'Center' } },
        { Text: { text: `Date: ${new Date().toLocaleDateString('en-GB')}`, align: 'Center' } },
        { Text: { text: `Time: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, align: 'Center' } },
      ];

      sections.push({ Text: { text: '--------------------------------', align: 'Center' } });
      sections.push({ Text: { text: '--------------------------------', align: 'Center' } });
      sections.push({
        Table: {
          columns: 3,
          column_widths: [24, 8, 16],
          truncate: true,
          header: [{ text: 'Item' }, { text: 'Qty' }, { text: 'Total' }],
          body: items.map(item => [
            { text: item.menu_item_name || 'Item' },
            { text: String(item.quantity) },
            { text: item.subtotal.toFixed(2) }
          ])
        }
      });
      sections.push({ Text: { text: '--------------------------------', align: 'Center' } });
      sections.push({ Text: { text: `Subtotal: ${subtotal.toFixed(2)} ${format.currency}`, align: 'Center' } });

      if (serviceCharge > 0) {
        sections.push({ Text: { text: `Service Charge (${format.serviceChargeRate}%): ${serviceCharge.toFixed(2)} ${format.currency}`, align: 'Center' } });
      }
      if (discount > 0) {
        sections.push({ Text: { text: `Discount: -${discount.toFixed(2)} ${format.currency}`, align: 'Center' } });
      }
      if (tax > 0) {
        sections.push({ Text: { text: `Tax: ${tax.toFixed(2)} ${format.currency}`, align: 'Center' } });
      }

      sections.push({ Text: { text: '--------------------------------', align: 'Center' } });
      sections.push({ Text: { text: `TOTAL: ${total.toFixed(2)} ${format.currency}`, align: 'Center', style: 'bold' } });
      sections.push({ Text: { text: '--------------------------------', align: 'Center' } });
      sections.push({ Text: { text: format.receiptFooter, align: 'Center' } });

      if (format.showRefundPolicy) {
        sections.push({ Text: { text: format.showRefundPolicy, align: 'Center' } });
      }
      sections.push({ Text: { text: 'This is only for internal managment purposes.', align: 'Center', style: 'bold' } });
      sections.push({ Text: { text: 'Don\'t use this for commercial purposes.', align: 'Center', style: 'bold' } });
      sections.push({ Feed: { feed_type: 'lines', value: 3 } });
      sections.push({ Cut: { mode: 'partial', feed: 0 } });

      await print_thermal_printer({
        printer: printerName,
        paper_size: 'Mm80',
        options: { code_page: 6, encode: 'WINDOWS_1252' },
        sections,
      } as any);

      toast.success('Receipt printed successfully');
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print receipt');
    }
  };

  const handleBrowserPrint = () => {
    if (receiptRef.current) {
      const printContent = receiptRef.current.innerHTML;
      const printWindow = window.open('', '', 'width=400,height=600');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Receipt</title>
              <style>
                body { font-family: monospace; margin: 0; padding: 20px; }
                .receipt { max-width: 300px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px dashed black; padding-bottom: 10px; margin-bottom: 10px }
                .title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; }
                .divider { border-top: 1px dashed black; margin: 10px 0; }
                .total { font-weight: bold; font-size: 16px; }
                .footer { text-align: center; margin-top: 15px; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { text-align: left; padding: 5px 0; }
                th { border-bottom: 1px solid black; }
              </style>
            </head>
            <body>
              <div class="receipt">${printContent}</div>
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const calculateTotals = () => {
    const items = order?.items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const serviceCharge = format.showServiceCharge ? (subtotal * format.serviceChargeRate) / 100 : 0;
    const discount = format.showDiscount ? format.discountAmount : 0;
    const tax = format.showTax ? ((subtotal + serviceCharge - discount) * format.taxRate) / 100 : 0;
    const total = subtotal + serviceCharge - discount + tax;

    return { subtotal, serviceCharge, discount, tax, total };
  };

  const { subtotal, serviceCharge, discount, tax, total } = calculateTotals();
  const transaction = order;
  const orderId = order?.id;
  const amount = order?.total_amount || 0;

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-card p-6">
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="rounded-card border border-border bg-card p-6">
        <div className="text-center text-muted-foreground py-12">
          <p className="text-lg">Select a payment or order to preview receipt</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-card border border-border bg-card p-6">
      <div className="flex justify-between items-center gap-2">
        <h3 className="text-section">Receipt preview</h3>
        <div className="flex gap-2">
          {availablePrinters.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowPrinterDropdown(!showPrinterDropdown)}
              >
                <Printer />
                {selectedPrinter || 'Choose printer'}
                <ChevronDown />
              </Button>
              {showPrinterDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border bg-popover p-1 shadow-pop">
                  {availablePrinters.map((printer) => (
                    <button
                      key={printer}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSelectedPrinter(printer);
                        setShowPrinterDropdown(false);
                      }}
                    >
                      {printer}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            onClick={handlePrint}
            disabled={!selectedPrinter}
          >
            Print receipt
          </Button>
          <Button
            onClick={handleBrowserPrint}
            variant="outline"
          >
            Browser print
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-muted p-6">
        <div ref={receiptRef} className="mx-auto max-w-sm bg-paper p-6 font-mono text-sm text-paper-foreground">
          {/* Business Header */}
          <div className="text-center border-b-2 border-paper-foreground pb-4 mb-4">
            <div className="font-semibold text-lg">{format.businessName}</div>
            <div className="text-xs mt-1">{format.businessAddress}</div>
            <div className="text-xs">{format.businessPhone}</div>
            <div className="text-xs">{format.businessEmail}</div>
          </div>

          {/* Receipt Title */}
          <div className="text-center border-b border-dashed border-paper-foreground pb-2 mb-4">
            {format.showDate && (
              <div className="text-xs mt-1">
                {new Date().toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </div>
            )}
            {format.showTime && (
              <div className="text-xs">
                {new Date().toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            )}
          </div>

          {/* Items */}
          {order?.items && order.items.length > 0 ? (
            <div className="border-b border-dashed border-paper-foreground pb-2 mb-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-paper-foreground">
                    <th className="text-left py-1">Item</th>
                    <th className="text-right py-1">Qty</th>
                    <th className="text-right py-1">Price</th>
                    <th className="text-right py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index}>
                      <td className="py-1">{item.menu_item_name || 'Item'}</td>
                      <td className="text-right py-1">{item.quantity}</td>
                      <td className="text-right py-1">
                        {parseFloat(String(item.unit_price)).toFixed(2)}
                      </td>
                      <td className="text-right py-1">
                        {parseFloat(String(item.subtotal)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-b border-dashed border-paper-foreground pb-2 mb-4">
              <div className="flex justify-between">
                <span>Amount:</span>
                <span>{parseFloat(String(amount)).toFixed(2)} {format.currency}</span>
              </div>
            </div>
          )}

          {/* Financial Summary */}
          <div className="border-b-2 border-paper-foreground pb-2 mb-4">
            {format.showSubtotal && order?.items && (
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{parseFloat(String(subtotal || amount)).toFixed(2)} {format.currency}</span>
              </div>
            )}
            {format.showServiceCharge && serviceCharge > 0 && (
              <div className="flex justify-between">
                <span>Service Charge ({format.serviceChargeRate}%):</span>
                <span>{serviceCharge.toFixed(2)} {format.currency}</span>
              </div>
            )}
            {format.showDiscount && discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{discount.toFixed(2)} {format.currency}</span>
              </div>
            )}
            {format.showTax && tax > 0 && (
              <div className="flex justify-between">
                <span>Tax ({format.taxRate}%):</span>
                <span>{tax.toFixed(2)} {format.currency}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-lg mt-2 pt-2 border-t border-paper-foreground">
              <span>TOTAL:</span>
              <span>{parseFloat(String(total || amount)).toFixed(2)} {format.currency}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs space-y-2">
            <div className="border-t border-dashed border-paper-foreground pt-2">
              <p className="font-semibold">{format.receiptFooter}</p>
            </div>
            {/* Demo Disclaimer */}
            <div className="text-center border-b border-dashed border-paper-foreground pb-2 mb-4">
              <p className="font-semibold text-xs text-destructive">
                This is only used for demo purposes. Don't use this for commercial purposes.
              </p>
            </div>

            {format.showRefundPolicy && (
              <p className="text-muted-foreground">{format.showRefundPolicy}</p>
            )}

            {format.showSignature && (
              <div className="mt-4 pt-2 border-t border-dashed border-paper-foreground">
                <div className="flex justify-center mt-6">
                  <div className="text-center">
                    <div className="border-b border-paper-foreground w-32 mb-1"></div>
                    <span>Cashier Signature</span>
                  </div>

                </div>
              </div>
            )}

            {order?.updated_at && (
              <p className="text-muted-foreground mt-2">
                Paid: {new Date(order.updated_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
