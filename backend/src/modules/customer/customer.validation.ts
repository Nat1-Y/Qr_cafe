import { BadRequestException } from "@nestjs/common";

// Guest input is untrusted and arrives without class-validator (the backend
// has no ValidationPipe), so every public body is parsed by hand here into a
// typed, cleaned shape. Messages are guest-facing: short and plain.

export const NOTE_MAX = 200;
export const QTY_MIN = 1;
export const QTY_MAX = 50;
export const NAME_MAX = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?[0-9][0-9 ]{6,19}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Plain text only: drop tags, control characters and runs of whitespace. */
export function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/<[^>]*>?/g, "")
    // ASCII control characters only — Ethiopic and other printable text stays.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNote(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new BadRequestException(`${field} must be text.`);
  const cleaned = cleanText(v);
  if (cleaned.length > NOTE_MAX) {
    throw new BadRequestException(`Keep notes under ${NOTE_MAX} characters.`);
  }
  return cleaned || null;
}

export interface GuestLine {
  menu_item_id: string;
  quantity: number;
  note: string | null;
  /** Price the guest was shown. Never charged — only compared, to detect a price change. */
  seen_price: number | null;
}

export interface GuestOrderInput {
  client_order_id: string;
  items: GuestLine[];
  order_note: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface GuestAddItemsInput {
  addition_id: string;
  items: GuestLine[];
}

function parseLines(raw: unknown, opts: { allowNotes: boolean; maxItems: number }): GuestLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException("Add at least one item.");
  }
  if (raw.length > opts.maxItems) {
    throw new BadRequestException(`You can order up to ${opts.maxItems} items at a time.`);
  }
  let units = 0;
  const lines = raw.map((entry): GuestLine => {
    const e = (entry ?? {}) as Record<string, unknown>;
    if (!isUuid(e.menu_item_id)) throw new BadRequestException("One of the items isn't on the menu.");
    const q = Number(e.quantity);
    if (!Number.isInteger(q) || q < QTY_MIN || q > QTY_MAX) {
      throw new BadRequestException(`Choose between ${QTY_MIN} and ${QTY_MAX} of each item.`);
    }
    units += q;
    const note = cleanNote(e.note, "Note");
    const seen = e.seen_price == null ? null : Number(e.seen_price);
    return {
      menu_item_id: e.menu_item_id,
      quantity: q,
      note: opts.allowNotes ? note : null,
      seen_price: seen != null && Number.isFinite(seen) ? seen : null,
    };
  });
  if (units > opts.maxItems) {
    throw new BadRequestException(`You can order up to ${opts.maxItems} items at a time.`);
  }
  return lines;
}

export function parseGuestOrder(
  body: unknown,
  opts: { allowNotes: boolean; maxItems: number },
): GuestOrderInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.client_order_id)) {
    throw new BadRequestException("Something went wrong sending your order. Please try again.");
  }
  const name = b.customer_name == null || b.customer_name === "" ? null : cleanText(b.customer_name);
  if (name && name.length > NAME_MAX) throw new BadRequestException("Keep your name short.");
  const phoneRaw = b.customer_phone == null || b.customer_phone === "" ? null : cleanText(b.customer_phone);
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) throw new BadRequestException("Check the phone number.");
  return {
    client_order_id: b.client_order_id.toLowerCase(),
    items: parseLines(b.items, opts),
    order_note: opts.allowNotes ? cleanNote(b.order_note, "Note") : null,
    customer_name: name || null,
    customer_phone: phoneRaw,
  };
}

export function parseGuestAddItems(
  body: unknown,
  opts: { allowNotes: boolean; maxItems: number },
): GuestAddItemsInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.addition_id)) {
    throw new BadRequestException("Something went wrong adding items. Please try again.");
  }
  return { addition_id: b.addition_id.toLowerCase(), items: parseLines(b.items, opts) };
}

export type AssistType = "call_waiter" | "request_bill";

export function parseAssist(body: unknown): AssistType {
  const t = ((body ?? {}) as Record<string, unknown>).type;
  if (t === "call_waiter" || t === "request_bill") return t;
  throw new BadRequestException("Choose what you need.");
}
