import React from 'react';
import { ReceiptFormat } from '../../hooks/useReceiptData';

interface ReceiptFormatSettingsProps {
  format: ReceiptFormat;
  setFormat: (format: ReceiptFormat) => void;
}

export const ReceiptFormatSettings: React.FC<ReceiptFormatSettingsProps> = ({
  format,
  setFormat
}) => {
  const handleChange = <K extends keyof ReceiptFormat>(
    key: K,
    value: ReceiptFormat[K]
  ) => {
    setFormat({ ...format, [key]: value });
  };

  return (
    <div className="bg-card rounded-lg p-4 space-y-4 max-h-96 overflow-y-auto">
      <h3 className="font-semibold text-lg">Receipt format settings</h3>

      {/* Business Information */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Business information</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Business name
          </label>
          <input
            type="text"
            value={format.businessName}
            onChange={(e) => handleChange('businessName', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Business address
          </label>
          <input
            type="text"
            value={format.businessAddress}
            onChange={(e) => handleChange('businessAddress', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Business phone
          </label>
          <input
            type="text"
            value={format.businessPhone}
            onChange={(e) => handleChange('businessPhone', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Business email
          </label>
          <input
            type="text"
            value={format.businessEmail}
            onChange={(e) => handleChange('businessEmail', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>

      </div>

      {/* Receipt Information */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Receipt information</h4>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showReceiptNumber}
              onChange={(e) => handleChange('showReceiptNumber', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show receipt number</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showDate}
              onChange={(e) => handleChange('showDate', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show date</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showTime}
              onChange={(e) => handleChange('showTime', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show time</span>
          </label>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Transaction details</h4>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showOrderNumber}
              onChange={(e) => handleChange('showOrderNumber', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show order number</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showTableNumber}
              onChange={(e) => handleChange('showTableNumber', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show Table number</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showCashierName}
              onChange={(e) => handleChange('showCashierName', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show cashier name</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showCustomerInfo}
              onChange={(e) => handleChange('showCustomerInfo', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show customer info</span>
          </label>
        </div>
      </div>

      {/* Financial Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Financial details</h4>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showSubtotal}
              onChange={(e) => handleChange('showSubtotal', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show subtotal</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showServiceCharge}
              onChange={(e) => handleChange('showServiceCharge', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show service charge</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showTax}
              onChange={(e) => handleChange('showTax', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show tax</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showDiscount}
              onChange={(e) => handleChange('showDiscount', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show discount</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Service charge rate (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={format.serviceChargeRate}
            onChange={(e) => handleChange('serviceChargeRate', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Tax rate (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={format.taxRate}
            onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Discount amount ({format.currency})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={format.discountAmount}
            onChange={(e) => handleChange('discountAmount', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
      </div>

      {/* Payment Details */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Payment details</h4>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showPaymentMethod}
              onChange={(e) => handleChange('showPaymentMethod', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show payment method</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showTransactionRef}
              onChange={(e) => handleChange('showTransactionRef', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show transaction reference</span>
          </label>
        </div>
      </div>

      {/* Footer */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Footer</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Receipt footer message
          </label>
          <input
            type="text"
            value={format.receiptFooter}
            onChange={(e) => handleChange('receiptFooter', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Refund policy
          </label>
          <input
            type="text"
            value={format.showRefundPolicy}
            onChange={(e) => handleChange('showRefundPolicy', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={format.showSignature}
              onChange={(e) => handleChange('showSignature', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Show signature lines</span>
          </label>
        </div>
      </div>

      {/* Currency */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Currency</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Currency symbol
          </label>
          <input
            type="text"
            value={format.currency}
            onChange={(e) => handleChange('currency', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
          />
        </div>
      </div>
    </div>
  );
};

export default ReceiptFormatSettings;
