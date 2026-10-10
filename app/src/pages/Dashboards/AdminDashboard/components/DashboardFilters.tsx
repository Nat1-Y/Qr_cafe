import React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Segmented from '@/components/common/Segmented';
import { Badge } from '@/components/ui/badge';
import { BUSINESS_UNITS, TIME_RANGE_OPTIONS } from '../constants';

interface DashboardFiltersProps {
  businessUnit: string;
  setBusinessUnit: (value: string) => void;
  selectedMenuItemId: string;
  setSelectedMenuItemId: (value: string) => void;
  menuItems: any[];
  timeRange: string;
  setTimeRange: (value: string) => void;
  customMode: string;
  setCustomMode: (value: string) => void;
  customDate: string;
  setCustomDate: (value: string) => void;
  customStartDate: string;
  setCustomStartDate: (value: string) => void;
  customEndDate: string;
  setCustomEndDate: (value: string) => void;
  customRangeText: string;
}

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  businessUnit,
  setBusinessUnit,
  selectedMenuItemId,
  setSelectedMenuItemId,
  menuItems,
  timeRange,
  setTimeRange,
  customMode,
  setCustomMode,
  customDate,
  setCustomDate,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  customRangeText
}) => {
  return (
    <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={businessUnit} onValueChange={setBusinessUnit}>
              <SelectTrigger className="w-[150px] rounded-full px-4">
                <SelectValue placeholder="All units" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedMenuItemId}
              onValueChange={setSelectedMenuItemId}
              disabled={businessUnit === 'all'}
            >
              <SelectTrigger className="w-[190px] rounded-full px-4">
                <SelectValue placeholder="All foods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All foods</SelectItem>
                {menuItems.map((it: any) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Segmented
            aria-label="Time range"
            value={timeRange}
            onChange={(v) => setTimeRange(v)}
            options={TIME_RANGE_OPTIONS.map((opt) => ({ value: opt.key, label: opt.label }))}
          />
        </div>

        {timeRange === 'custom' && (
          <div className="space-y-3 rounded-card border border-border bg-card p-4">
            <Segmented
              aria-label="Custom range"
              value={customMode}
              onChange={(v) => setCustomMode(v)}
              options={[
                { value: 'single', label: 'One day' },
                { value: 'date_range', label: 'Date range' },
              ]}
            />

            <div className="flex flex-wrap gap-4 items-center">
              {customMode === 'single' ? (
                <div className="space-y-1">
                  <Label>Select date</Label>
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="max-w-[200px]"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="max-w-[160px]"
                    />
                  </div>
                  <span className="mt-6 text-muted-foreground">to</span>
                  <div className="space-y-1">
                    <Label>End date</Label>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="max-w-[160px]"
                    />
                  </div>
                </div>
              )}

              {customRangeText && (
                <Badge variant="secondary" className="mt-6 h-fit">
                  Showing {customRangeText}
                </Badge>
              )}
            </div>
          </div>
        )}
    </div>
  );
};
