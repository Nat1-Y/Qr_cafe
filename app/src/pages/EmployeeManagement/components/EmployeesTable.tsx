import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import EmptyState from '@/components/common/EmptyState';
import { EmployeeSummary } from '../types';
import { formatETB } from '@/lib/format';


interface EmployeesTableProps {
  loading: boolean;
  employees: EmployeeSummary[];
  selectedEmployeeId: string;
  setSelectedEmployeeId: (id: string) => void;
}

export const EmployeesTable: React.FC<EmployeesTableProps> = ({
  loading,
  employees,
  selectedEmployeeId,
  setSelectedEmployeeId
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff summary</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Orders total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Not paid yet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length > 0 ? employees.map(e => (
                <TableRow
                  key={e.employee_id}
                  className="cursor-pointer"
                  onClick={() => setSelectedEmployeeId(String(e.employee_id))}
                  data-state={String(e.employee_id) === selectedEmployeeId ? 'selected' : undefined}
                >
                  <TableCell className="font-medium">{e.employee_name}</TableCell>
                  <TableCell className="text-right">{formatETB(e.orders_total)}</TableCell>
                  <TableCell className="text-right text-success font-medium">{formatETB(e.paid_total)}</TableCell>
                  <TableCell className="text-right text-destructive font-medium">{formatETB(e.unpaid_total)}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState
                      icon={<Users />}
                      title="No staff yet"
                      description="No orders taken by staff yet."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default EmployeesTable;
