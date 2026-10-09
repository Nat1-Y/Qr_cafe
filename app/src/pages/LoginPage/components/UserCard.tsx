import React from 'react';
import { Button } from '@/components/ui/button';
import { getRoleColors, getUserInitials } from '../utils';

interface UserCardProps {
  user: any;
  onSelect: (user: any) => void;
  isLoading: boolean;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onSelect, isLoading }) => {
  return (
    <div className="flex flex-col items-center gap-2 group">
      <Button
        onClick={() => onSelect(user)}
        disabled={isLoading}
        className={`h-20 w-20 rounded-full text-lg font-semibold transition-colors ${getRoleColors(user.role)} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {getUserInitials(user.full_name || user.name || user.username || '')}
      </Button>
      <span className="w-full max-w-[88px] truncate text-center text-sm font-medium text-foreground">
        {user.full_name || user.name || user.username}
      </span>
    </div>
  );
};
