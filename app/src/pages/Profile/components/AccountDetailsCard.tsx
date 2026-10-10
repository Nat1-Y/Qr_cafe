import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AccountDetailsCardProps {
  user: any;
}

export const AccountDetailsCard: React.FC<AccountDetailsCardProps> = ({ user }) => {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Account details</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs font-semibold">
        <div className="flex justify-between">
          <span className="text-muted-foreground">User ID:</span>
          <span className="text-foreground">#{user?.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span className={`font-semibold ${user?.is_active ? 'text-success' : 'text-destructive'}`}>
            {user?.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountDetailsCard;
