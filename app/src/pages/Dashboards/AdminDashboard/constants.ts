export const ADMIN_DASHBOARD_CACHE_KEY = "admin_dashboard_v1";
export const ADMIN_DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;

export const BUSINESS_UNITS = [
  { value: "all", label: "All sections" },
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Cafe" },
  { value: "barista", label: "Barista" },
];

export const TIME_RANGE_OPTIONS = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "custom", label: "Custom" },
];

export const MANAGEMENT_CENTER_ITEMS = [
  {
    label: "Staff",
    desc: "How staff are doing",
    path: "/dashboard/employees",
  },
  { label: "Payments", desc: "Money history", path: "/dashboard/payments" },

  { label: "Reports", desc: "Download Excel", path: "/dashboard/reports" },
  { label: "Tables", desc: "Your tables", path: "/dashboard/tables" },
  {
    label: "Stock",
    desc: "How much you have",
    path: "/dashboard/inventory",
  },
  {
    label: "Settings",
    desc: "Stock, tables and this device",
    path: "/dashboard/settings/data-management",
  },
  {
    label: "Printers",
    desc: "Receipt printer setup",
    path: "/dashboard/settings/printer-settings",
  },
  { label: "Profile", desc: "Your name and password", path: "/dashboard/profile" },
];
