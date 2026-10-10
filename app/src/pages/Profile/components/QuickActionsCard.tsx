import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface QuickActionsCardProps {
  isOnline: boolean;
  setShowChangePassword: (show: boolean) => void;
}

export const QuickActionsCard: React.FC<QuickActionsCardProps> = ({ isOnline, setShowChangePassword }) => {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b">
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        <Button
          className="w-full justify-start"
          variant="outline"
          onClick={() => setShowChangePassword(true)}
          disabled={!isOnline}
        >
          Change password {!isOnline && ' (Unavailable Offline)'}
        </Button>
        <Button className="w-full justify-start" variant="outline">
          Download data
        </Button>
        <Button className="w-full justify-start" variant="outline">
          Privacy settings
        </Button>
      </CardContent>
    </Card>
  );
};

export default QuickActionsCard;
