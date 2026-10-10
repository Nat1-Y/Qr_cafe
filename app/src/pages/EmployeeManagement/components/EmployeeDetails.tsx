import { uuidToDisplayId } from "@/lib/utils";
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import EmptyState from '@/components/common/EmptyState';
import { OrderDetailsDialog } from '@/components/common/OrderDetailsDialog';
import { EmployeeDetailsData } from '../types';
import { formatETB, humanize } from '@/lib/format';
import StatusBadge from '@/components/common/StatusBadge';


interface EmployeeDetailsProps {
  details: EmployeeDetailsData | null;
}

export const EmployeeDetails: React.FC<EmployeeDetailsProps> = ({ details }) => {
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Latest orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-center">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(details?.orders || []).length > 0 ? details?.orders?.map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">#{uuidToDisplayId(o.id)}</TableCell>
                  <TableCell>{o.employee_name || 'Staff member'}</TableCell>
                  <TableCell>{humanize(o.type)}</TableCell>
                  <TableCell>{o.table_number ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatETB(o.total_amount)}</TableCell>
                  <TableCell>
                    <StatusBadge kind="order" status={o.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={String(o.payment_status || '').toLowerCase() === 'paid' ? 'success' : 'secondary'}>
                      {String(o.payment_status || '').toLowerCase() === 'paid' ? 'Paid' : 'Not paid yet'}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(o)} className="h-8 w-8 hover:bg-muted hover:text-foreground">
                      <Eye />
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={9}>
                    <EmptyState title="No orders" description="This person has no orders yet" />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderDetailsDialog 
        order={selectedOrder} 
        open={!!selectedOrder} 
        onOpenChange={(open) => !open && setSelectedOrder(null)} 
      />
    </div>
  );
};

export default EmployeeDetails;
