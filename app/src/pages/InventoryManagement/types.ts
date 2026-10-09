export interface StockLocation {
  id: number;
  name: string;
  slug: string;
  type: string;
  linked_main_category_slug?: string;
  is_default: boolean;
  display_order: number;
  active: boolean;
}

export interface LocalInventoryStockEntry {
  location_id: number;
  location_name?: string;
  quantity: number;
  min_quantity: number;
}

/**
 * One-to-many transfer relation: many source items may point at one target
 * item. Transferring a source credits the target at the destination
 * (quantity × conversion_factor) instead of the source itself.
 */
export interface InventoryItemLink {
  id: string;
  source_item_id: string;
  source_item_name?: string | null;
  target_item_id: string;
  target_item_name?: string | null;
  conversion_factor: number;
}

export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  base_unit?: string;
  pieces_per_unit?: string | number;
  min_quantity: string | number;
  notes?: string;
  /** Outgoing link — this item is received as the link target when transferred */
  transfer_link?: InventoryItemLink | null;
  /** Incoming links — items that are received as this one when transferred */
  linked_sources?: InventoryItemLink[];
  /** Preferred normalized shape from Phase 0B */
  stock_by_location?: LocalInventoryStockEntry[];
  /** @deprecated Legacy flat — kept for display compat */
  quantity?: string | number;
  /** @deprecated Legacy flat — kept for display compat */
  store_quantity?: string | number;
  /** @deprecated Legacy flat — kept for display compat */
  barista_quantity?: string | number;
}

export interface NormalizedInventoryItem extends InventoryItem {
  /** Computed totals for display */
  quantity: number;
  store_quantity: number;
  barista_quantity: number;
}

export interface InventoryMovement {
  id: number;
  movement_type: string;
  location_id?: number | null;
  location_name?: string | null;
  quantity_delta?: number | null;
  quantity_after?: number | null;
  notes?: string | null;
  created_at?: string;
  created_by?: number | null;
  user_name?: string | null;
  order_id?: number | null;
  order_item_id?: number | null;
  meta?: any;
  menu_item_name?: string | null;
}

export interface InventoryFormData {
  name: string;
  unit: string;
  base_unit: string;
  pieces_per_unit: number;
  min_quantity: number;
  min_quantity_unit?: "base" | "purchase";
  min_quantity_mode?: "global" | "per_location";
  notes: string;
  initial_stock?: {
    location_id: number;
    quantity: number;
    quantity_unit?: "base" | "purchase";
    min_quantity?: number;
  }[];
}

export interface InventoryQtyData {
  mode: string;
  location?: string; // Legacy field, kept for backward compatibility
  /** Backend location id — a UUID string at runtime (legacy numeric ids may still appear). */
  location_id?: number | string | null;
  quantity: string;
  delta: string;
  quantity_unit?: "base" | "purchase";
}

export interface StockTransfer {
  id: number;
  remote_id?: number;
  from_location_id?: number | null;
  to_location_id?: number | null;
  from_location_name?: string;
  to_location_name?: string;
  /** @deprecated use from_location_id */
  from_location?: string;
  /** @deprecated use to_location_id */
  to_location?: string;
  status: string;
  notes?: string;
  created_at?: string;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id?: number;
  transfer_id?: number;
  inventory_item_id: number;
  quantity: number;
  source_quantity_after?: number | null;
  destination_quantity_after?: number | null;
  /** Set when the line was a link source: { received_as, received_as_name, received_quantity, conversion_factor } */
  meta?: any;
}

export interface MultiTransferLineItem {
  inventory_item_id: string;
  quantity: string;
  quantity_unit: "base" | "purchase";
}

export interface StockTransferFormData {
  from_location: string;
  to_location: string;
  notes: string;
  lines: MultiTransferLineItem[];
}
