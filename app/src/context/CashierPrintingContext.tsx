import React, { createContext, useContext } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  useCashierPrinting,
  type StuckPrintOrder,
} from "@/pages/Dashboards/CashierDashboard/hooks/useCashierPrinting";

// Custom event the engine dispatches after a print pass so the dashboard (when
// mounted) can refresh its on-screen lists. The engine itself has no knowledge
// of the dashboard's data layer.
export const CASHIER_REFRESH_EVENT = "cashier:refresh-dashboard";

export interface CashierPrintingValue {
  qzStatus: any;
  testQzPrint: () => Promise<void>;
  printOrderImmediately: (orderId: number) => Promise<void>;
  pollUnprintedOrders: () => Promise<void>;
  stuckPrintOrders: StuckPrintOrder[];
  retryStuckPrint: (orderId: number) => Promise<void>;
}

const CashierPrintingContext = createContext<CashierPrintingValue | null>(null);

export const CashierPrintingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth() as any;
  const enabled = user?.role === "cashier";

  const printing = useCashierPrinting({
    enabled,
    refreshDashboardData: async () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(CASHIER_REFRESH_EVENT));
      }
    },
  });

  return (
    <CashierPrintingContext.Provider value={printing}>
      {children}
    </CashierPrintingContext.Provider>
  );
};

export const useCashierPrintingContext = (): CashierPrintingValue => {
  const ctx = useContext(CashierPrintingContext);
  if (!ctx) {
    throw new Error(
      "useCashierPrintingContext must be used within a CashierPrintingProvider",
    );
  }
  return ctx;
};

export default CashierPrintingContext;
