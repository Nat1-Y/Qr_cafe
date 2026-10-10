import React from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input, SearchInput } from '@/components/ui/input';

interface InventoryFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const InventoryFilters: React.FC<InventoryFiltersProps> = ({
  searchTerm,
  setSearchTerm
}) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <SearchInput
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} wrapperClassName="max-w-sm" />
      </CardContent>
    </Card>
  );
};

export default InventoryFilters;
