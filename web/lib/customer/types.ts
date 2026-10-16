// Shapes returned by the guest QR API (backend/src/modules/customer). Kept in
// one place so the screens never reach into raw JSON.

export type ClosedReason = "not_available" | "table_off" | "closed_now";

export interface Landing {
  cafe: {
    name: string;
    logo_url: string | null;
    phone: string | null;
    currency: string;
    welcome_message: string | null;
  };
  table: { number: number; label: string | null };
  ordering: {
    open: boolean;
    reason: ClosedReason | null;
    message: string | null;
    hours: { open: string; close: string } | null;
  };
  options: { show_prices: boolean; allow_notes: boolean; max_items: number };
  session: { token: string; expires_at: string };
}

/** The welcome-screen info, without a session (server-rendered). */
export type PublicInfo = Omit<Landing, "session">;

export type Availability = "in_stock" | "low" | "out";

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  prep_minutes: number | null;
  availability: Availability;
  popular: boolean;
  note_presets: string[];
}

export interface MenuGroup {
  key: string;
  name: string;
  items: MenuItem[];
}

export interface MenuSection {
  key: string;
  name: string;
  groups: MenuGroup[];
}

export interface Menu {
  sections: MenuSection[];
}

export type GuestStage = "sent" | "in_kitchen" | "served" | "cancelled";

export interface GuestOrder {
  id: string;
  order_number: number | null;
  table_number: number | null;
  stage: GuestStage;
  paid: boolean;
  waiting_for_staff: boolean;
  created_at: string | null;
  total: number;
  note: string | null;
  customer_name: string | null;
  can_add_items: boolean;
  items: Array<{ name: string; quantity: number; note: string | null; subtotal: number }>;
}

export interface PaymentOption {
  id: string;
  name: string;
}

export interface CheckoutStart {
  provider: string;
  status: string;
  intent_id: string | null;
  checkout_url: string | null;
  instructions: string | null;
}

export interface PlaceOrderResult {
  order: GuestOrder;
  replay: boolean;
  payment: { options: PaymentOption[]; auto: CheckoutStart | null };
}

export type ChangeReason = "sold_out" | "unavailable" | "price_changed";

export interface MenuChange {
  menu_item_id: string;
  name: string | null;
  reason: ChangeReason;
  price?: number;
}

export interface OrderLineInput {
  menu_item_id: string;
  quantity: number;
  note?: string;
  seen_price?: number;
}
