"use client";

// Every word a guest sees, in English and Amharic. Short, warm, plain — no
// codes or status values. Add a key to `en` and TypeScript requires it in `am`.
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { readJSON, storageKeys, writeJSON } from "./storage";

export type Lang = "en" | "am";

const en = {
  langName: "English",
  switchTo: "አማርኛ",
  switchToLabel: "Switch to Amharic",
  seeMenu: "See the menu",
  lookAtMenu: "Look at the menu",
  table: "Table {n}",
  welcomeTitle: "Welcome to {cafe}",
  welcomeBack: "Welcome back",
  welcomeSub: "Order from your table. We'll bring it over.",
  closedTitle: "Ordering from the table is closed",
  closed_not_available: "Ordering from your table isn't available right now. Please order with a member of staff.",
  closed_table_off: "Ordering from this table is turned off. Please order with a member of staff.",
  closed_closed_now: "We're not taking orders from the table right now. Please order with a member of staff.",
  closedHours: "We take table orders from {open} to {close}.",
  callCafe: "Call the café",
  qrBrokenTitle: "This QR code isn't working",
  qrBrokenBody: "Please ask a member of staff for help.",
  search: "Search the menu",
  clearSearch: "Clear search",
  noResults: "Nothing matches “{q}”.",
  categories: "Menu sections",
  popular: "Popular",
  minutes: "~{n} min",
  soldOut: "Sold out",
  fewLeft: "Only a few left",
  add: "Add",
  addPrice: "Add · {price}",
  addToOrder: "Add to order",
  addItem: "Add {name}",
  quantity: "Quantity",
  decrease: "One less",
  increase: "One more",
  noteLabel: "Note for the kitchen",
  notePlaceholder: "No sugar, extra hot…",
  noteHint: "Optional",
  close: "Close",
  itemCount: "{n} items",
  itemCountOne: "1 item",
  viewOrder: "View order",
  addedToast: "Added {name}",
  yourOrder: "Your order",
  addingTo: "Adding to order #{n}",
  emptyCart: "Your order is empty.",
  backToMenu: "Back to the menu",
  editNote: "Add a note",
  changeNote: "Change note",
  remove: "Remove",
  removedToast: "Removed {name}",
  undo: "Undo",
  orderNote: "Anything else we should know?",
  orderNotePlaceholder: "We're celebrating, please bring candles…",
  yourName: "Your name",
  yourPhone: "Phone",
  optional: "optional",
  nameHint: "So we can call you when it's ready.",
  total: "Total",
  sendOrder: "Send order",
  sendItems: "Add to order",
  sending: "Sending…",
  pricesHidden: "Prices are shown at the counter.",
  changedTitle: "We updated your order",
  changedBody: "A few things changed while you were choosing. Check your order, then send it again.",
  changed_sold_out: "{name} just sold out. We took it out.",
  changed_unavailable: "{name} isn't available right now. We took it out.",
  changed_price_changed: "{name} now costs {price}.",
  reviewOrder: "Check my order",
  someItem: "An item",
  sentTitle: "Order sent!",
  orderNumber: "Order #{n}",
  orderNumberLabel: "Order number",
  payAtCounter: "Pay at the counter when you're ready. Show your order number.",
  waitingStaff: "A member of staff will confirm your order in a moment.",
  stepSent: "Order sent",
  stepKitchen: "In the kitchen",
  stepServed: "Served",
  paid: "Paid",
  notPaid: "Not paid yet",
  cancelled: "This order was cancelled. Please ask a member of staff.",
  yourOrders: "Your orders",
  addMore: "Add more items",
  callWaiter: "Call waiter",
  askBill: "Ask for the bill",
  waiterComing: "A waiter is on the way.",
  billComing: "We'll bring the bill.",
  newOrder: "Start a new order",
  howToPay: "How would you like to pay?",
  liveStatus: "Order #{n}: {stage}",
  offline: "You're offline. We'll keep your order here until you're back.",
  backOnline: "You're back online.",
  tryAgain: "Try again",
  errNetwork: "We couldn't reach the café. Check your connection and try again.",
  errSlowDown: "That's a lot of orders in a short time. Please wait a few minutes, or ask a member of staff.",
  errSession: "Your visit timed out. Scan the QR code on your table again.",
  errInput: "Please check your order and try again.",
  errClosed: "We're not taking orders from the table right now. Please order with a member of staff.",
  errOrderClosed: "This order is closed. Start a new order to add more.",
  errGeneric: "Something went wrong. Please try again.",
  menuLoadError: "We couldn't load the menu.",
  imageOf: "Photo of {name}",
} as const;

export type MessageKey = keyof typeof en;

const am: Record<MessageKey, string> = {
  langName: "አማርኛ",
  switchTo: "English",
  switchToLabel: "ወደ እንግሊዝኛ ቀይር",
  seeMenu: "ምናሌውን ይመልከቱ",
  lookAtMenu: "ምናሌውን ይመልከቱ",
  table: "ጠረጴዛ {n}",
  welcomeTitle: "እንኳን ወደ {cafe} በደህና መጡ",
  welcomeBack: "እንኳን ደህና ተመለሱ",
  welcomeSub: "ከጠረጴዛዎ ሆነው ይዘዙ። እኛ እናመጣልዎታለን።",
  closedTitle: "ከጠረጴዛ ማዘዝ ለጊዜው ተዘግቷል",
  closed_not_available: "አሁን ከጠረጴዛዎ ማዘዝ አይቻልም። እባክዎ በአስተናጋጅ በኩል ይዘዙ።",
  closed_table_off: "ከዚህ ጠረጴዛ ማዘዝ ጠፍቷል። እባክዎ በአስተናጋጅ በኩል ይዘዙ።",
  closed_closed_now: "አሁን ከጠረጴዛ ትዕዛዝ አንቀበልም። እባክዎ በአስተናጋጅ በኩል ይዘዙ።",
  closedHours: "ከጠረጴዛ ትዕዛዝ የምንቀበለው ከ{open} እስከ {close} ነው።",
  callCafe: "ካፌውን ይደውሉ",
  qrBrokenTitle: "ይህ QR ኮድ አይሰራም",
  qrBrokenBody: "እባክዎ አስተናጋጅ ይጠይቁ።",
  search: "ምናሌ ውስጥ ይፈልጉ",
  clearSearch: "ፍለጋውን አጽዳ",
  noResults: "ከ“{q}” ጋር የሚመሳሰል የለም።",
  categories: "የምናሌ ክፍሎች",
  popular: "ተወዳጅ",
  minutes: "~{n} ደቂቃ",
  soldOut: "አልቋል",
  fewLeft: "ጥቂት ብቻ ቀርቷል",
  add: "ጨምር",
  addPrice: "ጨምር · {price}",
  addToOrder: "ወደ ትዕዛዝ ጨምር",
  addItem: "{name} ጨምር",
  quantity: "ብዛት",
  decrease: "አንድ ቀንስ",
  increase: "አንድ ጨምር",
  noteLabel: "ለማብሰያ ቤቱ ማስታወሻ",
  notePlaceholder: "ያለ ስኳር፣ በጣም ትኩስ…",
  noteHint: "ካስፈለገ",
  close: "ዝጋ",
  itemCount: "{n} ዕቃ",
  itemCountOne: "1 ዕቃ",
  viewOrder: "ትዕዛዙን እይ",
  addedToast: "{name} ተጨምሯል",
  yourOrder: "ትዕዛዝዎ",
  addingTo: "ወደ ትዕዛዝ #{n} እየጨመሩ ነው",
  emptyCart: "ትዕዛዝዎ ባዶ ነው።",
  backToMenu: "ወደ ምናሌው ተመለስ",
  editNote: "ማስታወሻ ጨምር",
  changeNote: "ማስታወሻ ቀይር",
  remove: "አስወግድ",
  removedToast: "{name} ተወግዷል",
  undo: "መልስ",
  orderNote: "ሌላ ማወቅ ያለብን ነገር አለ?",
  orderNotePlaceholder: "ልደት እያከበርን ነው፣ ሻማ ቢያመጡልን…",
  yourName: "ስምዎ",
  yourPhone: "ስልክ",
  optional: "ካስፈለገ",
  nameHint: "ሲደርስ እንድንጠራዎ።",
  total: "ጠቅላላ",
  sendOrder: "ትዕዛዙን ላክ",
  sendItems: "ወደ ትዕዛዙ ጨምር",
  sending: "እየተላከ ነው…",
  pricesHidden: "ዋጋዎቹ ካውንተር ላይ ይታያሉ።",
  changedTitle: "ትዕዛዝዎን አስተካክለናል",
  changedBody: "እየመረጡ ሳሉ ጥቂት ነገሮች ተቀይረዋል። ትዕዛዝዎን አይተው እንደገና ይላኩ።",
  changed_sold_out: "{name} አሁን አልቋል። አውጥተነዋል።",
  changed_unavailable: "{name} አሁን የለም። አውጥተነዋል።",
  changed_price_changed: "{name} አሁን {price} ነው።",
  reviewOrder: "ትዕዛዜን ልይ",
  someItem: "አንድ ዕቃ",
  sentTitle: "ትዕዛዝዎ ተልኳል!",
  orderNumber: "ትዕዛዝ #{n}",
  orderNumberLabel: "የትዕዛዝ ቁጥር",
  payAtCounter: "ሲጨርሱ ካውንተር ላይ ይክፈሉ። የትዕዛዝ ቁጥርዎን ያሳዩ።",
  waitingStaff: "አስተናጋጅ በቅርቡ ትዕዛዝዎን ያረጋግጣል።",
  stepSent: "ተልኳል",
  stepKitchen: "እየተዘጋጀ ነው",
  stepServed: "ቀርቧል",
  paid: "ተከፍሏል",
  notPaid: "ገና አልተከፈለም",
  cancelled: "ይህ ትዕዛዝ ተሰርዟል። እባክዎ አስተናጋጅ ይጠይቁ።",
  yourOrders: "ትዕዛዞችዎ",
  addMore: "ተጨማሪ እዘዝ",
  callWaiter: "አስተናጋጅ ጥራ",
  askBill: "ሂሳብ አምጡ",
  waiterComing: "አስተናጋጅ እየመጣ ነው።",
  billComing: "ሂሳቡን እናመጣለን።",
  newOrder: "አዲስ ትዕዛዝ ጀምር",
  howToPay: "እንዴት መክፈል ይፈልጋሉ?",
  liveStatus: "ትዕዛዝ #{n}፦ {stage}",
  offline: "ኢንተርኔት የለም። እስኪመለስ ትዕዛዝዎን እዚሁ እናቆየዋለን።",
  backOnline: "ኢንተርኔት ተመልሷል።",
  tryAgain: "እንደገና ሞክር",
  errNetwork: "ካፌውን ማግኘት አልቻልንም። ኢንተርኔትዎን አረጋግጠው እንደገና ይሞክሩ።",
  errSlowDown: "በአጭር ጊዜ ብዙ ትዕዛዝ ተልኳል። ጥቂት ደቂቃ ይጠብቁ ወይም አስተናጋጅ ይጠይቁ።",
  errSession: "ጊዜው አልፏል። በጠረጴዛዎ ላይ ያለውን QR ኮድ እንደገና ይቃኙ።",
  errInput: "እባክዎ ትዕዛዝዎን አረጋግጠው እንደገና ይሞክሩ።",
  errClosed: "አሁን ከጠረጴዛ ትዕዛዝ አንቀበልም። እባክዎ በአስተናጋጅ በኩል ይዘዙ።",
  errOrderClosed: "ይህ ትዕዛዝ ተዘግቷል። ተጨማሪ ለማዘዝ አዲስ ትዕዛዝ ይጀምሩ።",
  errGeneric: "የሆነ ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።",
  menuLoadError: "ምናሌውን መጫን አልቻልንም።",
  imageOf: "የ{name} ፎቶ",
};

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, am };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

// The chosen language lives in localStorage; React reads it as an external
// store so the server render ('en') and the client's remembered choice never
// fight during hydration.
const langListeners = new Set<() => void>();
let langCache: Lang | null = null;

function readLang(): Lang {
  if (langCache) return langCache;
  const saved = readJSON<Lang | null>(storageKeys.lang, null);
  langCache = saved === "am" ? "am" : "en";
  return langCache;
}

function subscribeLang(cb: () => void) {
  langListeners.add(cb);
  return () => langListeners.delete(cb);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en" as Lang);

  useEffect(() => {
    document.documentElement.lang = lang === "am" ? "am" : "en";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    langCache = next;
    writeJSON(storageKeys.lang, next);
    langListeners.forEach((cb) => cb());
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/**
 * Quick-pick note chips when the owner hasn't set any on the item. They go to
 * the kitchen as written, in the guest's language — staff read both.
 */
export const DEFAULT_NOTE_CHIPS: Record<Lang, { drink: string[]; food: string[] }> = {
  en: {
    drink: ["No sugar", "Less sugar", "Extra hot", "Iced"],
    food: ["Not spicy", "Extra spicy", "No onions"],
  },
  am: {
    drink: ["ያለ ስኳር", "ትንሽ ስኳር", "በጣም ትኩስ", "በበረዶ"],
    food: ["ያለ ቃሪያ", "በጣም የሚያቃጥል", "ያለ ሽንኩርት"],
  },
};
