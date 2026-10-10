import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';

interface StaffAttendancePanelProps {
  attendanceData: any[];
}

export const StaffAttendancePanel: React.FC<StaffAttendancePanelProps> = ({
  attendanceData
}) => {
  return (
    <Card>
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <div>
          <CardTitle>Active floor staff</CardTitle>
          <CardDescription>Shift logs and live active workers</CardDescription>
        </div>
        <Badge variant="info">
          {attendanceData.length} On duty
        </Badge>
      </CardHeader>
      <CardContent className="pt-6 space-y-3">
        {attendanceData.length > 0 ? (
          attendanceData.map((attendance: any) => (
            <div
              key={attendance.id}
              className="flex items-center justify-between border-b border-border py-3 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
                    {attendance.full_name?.charAt(0)}
                  </div>
                  {!attendance.clock_out_time && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success border-2 border-background rounded-full"></span>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground">
                    {attendance.full_name}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {attendance.role?.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="text-right space-y-0.5">
                <div className="flex items-center justify-end text-xs font-semibold text-foreground">
                  <Clock className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  {new Date(attendance.clock_in_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
                <Badge
                  variant={attendance.clock_out_time ? 'secondary' : 'success'}
                 
                >
                  {attendance.clock_out_time ? 'Shift Ended' : 'Live'}
                </Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground font-semibold border border-dashed rounded-xl bg-muted/20">
            Team not clocked in today
          </div>
        )}
      </CardContent>
    </Card>
  );
};
