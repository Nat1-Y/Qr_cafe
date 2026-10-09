import { formatOrderNumber } from "@/lib/utils";
import React from 'react';
import { Order } from '@/types/api.types';

interface ReceiptSelectorProps {
  loading: boolean;
  orders: Order[];
  selectedOrder: Order | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectOrder: (order: Order) => void;
}

export const ReceiptSelector: React.FC<ReceiptSelectorProps> = ({
  loading,
  orders,
  selectedOrder,
  searchTerm,
  setSearchTerm,
  selectOrder
}) => {


  return (
    <div className="bg-card rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-lg">Select order</h3>

      <input
        type="text"
        placeholder="Search by order ID or table..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-info/30"
      />

      {loading ? (
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid orders available</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => selectOrder(order)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedOrder?.id === order.id
                      ? 'bg-info-soft border-info/30'
                      : 'bg-muted hover:bg-row-hover'
                    }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Order {formatOrderNumber(order)}</span>
                    <span className="text-sm text-muted-foreground">
                      {parseFloat(String(order.total_amount)).toFixed(2)} Birr
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {order.table_number && `Table ${order.table_number}`} • {order.status}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReceiptSelector;
