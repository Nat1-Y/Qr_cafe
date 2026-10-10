"use client";
import React from "react";
import { ClockIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import BranchBadge from "@/components/waiter/BranchBadge";

interface HeaderBannerProps {
  userName?: string;
  attendanceStatus: any;
  onClockIn: () => void;
  onClockOut: () => void;
  onLogout: () => void;
}

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Waiter home header: who's on, today's date, shift and sign-out. */
const HeaderBanner: React.FC<HeaderBannerProps> = ({
  userName,
  attendanceStatus,
  onClockIn,
  onClockOut,
  onLogout,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow mb-1">{userName || "Waiter"}</p>
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-title">
          On the floor
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{todayLabel()}</span>
          <BranchBadge />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {attendanceStatus ? (
          <>
            <span className="inline-flex h-12 items-center gap-1.5 rounded-full bg-success-soft px-4 text-sm font-medium text-success">
              <ClockIcon className="size-4" />
              In since{" "}
              {new Date(attendanceStatus.clock_in_time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <Button variant="outline" size="lg" className="h-12" onClick={onClockOut}>
              Clock out
            </Button>
          </>
        ) : (
          <Button variant="outline" size="lg" className="h-12" onClick={onClockIn}>
            <ClockIcon />
            Clock in
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-12 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out">
          <LogOutIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
};

export default HeaderBanner;
