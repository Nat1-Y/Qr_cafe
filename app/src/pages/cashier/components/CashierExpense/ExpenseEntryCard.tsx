import React from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import ExpenseRowEditor, { ExpenseRow } from './ExpenseRowEditor';
import { formatETB } from '@/lib/format';

interface ExpenseEntryCardProps {
  rows: ExpenseRow[];
  onRowsChange: (rows: ExpenseRow[]) => void;
  total: number;
  saving: boolean;
  onSubmit: () => void;
}

export const ExpenseEntryCard: React.FC<ExpenseEntryCardProps> = ({
  rows,
  onRowsChange,
  total,
  saving,
  onSubmit,
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>New expense</CardTitle>
        <div className="text-sm font-semibold rounded-md border bg-muted/50 px-3 py-1.5">
          Total: {formatETB(total)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ExpenseRowEditor rows={rows} onChange={onRowsChange} total={total} showTotal={false} />

        <div className="flex flex-col sm:flex-row gap-3 border-t pt-4">
          <Button type="button" onClick={onSubmit} disabled={saving}>
            <Save />
            {saving ? 'Saving…' : 'Save expenses'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExpenseEntryCard;
