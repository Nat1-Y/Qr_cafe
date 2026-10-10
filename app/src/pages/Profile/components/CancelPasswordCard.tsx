import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CancelPasswordCardProps {
  isLoading: boolean;
  isOnline?: boolean;
  formData: {
    newCancelPassword: string;
    confirmCancelPassword: string;
  };
  errors: any;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleReset: () => void;
}

const CancelPasswordCard: React.FC<CancelPasswordCardProps> = ({
  isLoading,
  isOnline = true,
  formData,
  errors,
  handleChange,
  handleSubmit,
  handleReset,
}) => {
  const disabled = isLoading || !isOnline;
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Cancel order password</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {!isOnline && (
          <p className="mb-3 text-xs text-warning font-medium">
            You're offline. The cancel password can only be changed with an
            internet connection.
          </p>
        )}
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="newCancelPassword">New cancel password</Label>
            <Input
              id="newCancelPassword"
              name="newCancelPassword"
              type="password"
              value={formData.newCancelPassword}
              onChange={handleChange}
              disabled={disabled}
              autoComplete="new-password"
              className={errors.newCancelPassword ? 'border-destructive' : ''}
            />
            {errors.newCancelPassword && (
              <p className="text-xs text-destructive font-semibold">{errors.newCancelPassword}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="confirmCancelPassword">Confirm cancel password</Label>
            <Input
              id="confirmCancelPassword"
              name="confirmCancelPassword"
              type="password"
              value={formData.confirmCancelPassword}
              onChange={handleChange}
              disabled={disabled}
              autoComplete="new-password"
              className={errors.confirmCancelPassword ? 'border-destructive' : ''}
            />
            {errors.confirmCancelPassword && (
              <p className="text-xs text-destructive font-semibold">{errors.confirmCancelPassword}</p>
            )}
          </div>

          <div className="md:col-span-2 flex gap-2 pt-1">
            <Button type="submit" disabled={disabled}>
              {isLoading ? 'Saving…' : 'Update Cancel Password'}
            </Button>
            <Button type="button" variant="outline" onClick={handleReset} disabled={isLoading}>
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default CancelPasswordCard;