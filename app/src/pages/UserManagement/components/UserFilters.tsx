import React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterRole: string;
  setFilterRole: (role: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  count: number;
}

export const UserFilters: React.FC<UserFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterRole,
  setFilterRole,
  filterStatus,
  setFilterStatus,
  count
}) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
              placeholder="Search users..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} wrapperClassName="flex-1" />
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center text-sm text-muted-foreground whitespace-nowrap">
            {count} users
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserFilters;
