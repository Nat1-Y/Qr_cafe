import React from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoginHeader } from './LoginHeader';
import { UserCard } from './UserCard';

interface UserSelectionScreenProps {
  employees: any[];
  isLoading: boolean;
  isOffline?: boolean;
  onSelectUser: (user: any) => void;
  onAdminLogin: () => void;
}

export const UserSelectionScreen: React.FC<UserSelectionScreenProps> = ({
  employees,
  isLoading,
  isOffline = false,
  onSelectUser,
  onAdminLogin
}) => {
  const waiters = employees.filter(e => e.role === 'cafe_waiter' || e.role === 'waiter');

  return (
    <div className="space-y-6 animate-fade-in">
      <LoginHeader
        title="Who's on shift?"
        subtitle="Tap your name to sign in."
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          {waiters.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-base font-medium text-foreground">No staff on this device yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Ask your manager to add you.</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto pr-2">
              <div className="grid grid-cols-3 gap-4 sm:gap-6">
                {waiters.map((employee) => (
                  <UserCard
                    key={employee.id}
                    user={employee}
                    onSelect={onSelectUser}
                    isLoading={isLoading || isOffline}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onAdminLogin}
              disabled={isLoading || isOffline}
            >
              <Settings />
              Staff sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
