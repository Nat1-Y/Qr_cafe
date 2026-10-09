import React from "react";
import { StatCard } from "@/components/stat-card";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Accepted for compatibility; KPI cards deliberately show no icon. */
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
}

// Waiter-portal alias for the shared KPI card.
const StatsCard: React.FC<StatsCardProps> = ({ title, value, subtitle, variant, className }) => (
  <StatCard title={title} value={value} subtitle={subtitle} variant={variant} className={className} />
);

export default StatsCard;
