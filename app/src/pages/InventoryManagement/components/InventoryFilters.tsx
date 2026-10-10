import React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';

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
            placeholder="Search stock"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} wrapperClassName="max-w-sm" />
      </CardContent>
    </Card>
  );
};

export default InventoryFilters;
