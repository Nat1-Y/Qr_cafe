// Loose shapes of the rows the dashboard panels read. Rows come from the local
// JSON store, so every field is optional and numbers may arrive as strings.
type Num = number | string | null;

export interface LineRow {
  id?: string | number;
  menu_item_id?: string | number | null;
  menu_item_name?: string | null;
  name?: string | null;
  quantity?: Num;
  unit_price?: Num;
  price?: Num;
  subtotal?: Num;
}

export interface OrderRow {
  id: string;
  order_number?: number | null;
  table_number?: number | string | null;
  type?: string | null;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  total_amount?: Num;
  items?: LineRow[] | null;
}

export interface PaymentRow {
  created_at?: string | null;
}

export interface StockLevelRow {
  quantity?: Num;
  min_quantity?: Num;
}

export interface InventoryRow {
  id: string | number;
  name?: string | null;
  unit?: string | null;
  quantity?: Num;
  store_quantity?: Num;
  min_quantity?: Num;
  min_quantity_mode?: string | null;
  pieces_per_unit?: Num;
  stock_by_location?: StockLevelRow[] | null;
}

/** parseInt that tolerates numbers, strings and missing values. */
export const toInt = (value: Num | undefined): number => parseInt(String(value ?? ''), 10);
