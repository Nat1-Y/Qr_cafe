import React from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MenuFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  filterCategory: string;
  setFilterCategory: (category: string) => void;
  isFastingType: boolean;
  availableCategories: string[];
  fastingSubCategories: string[];
  totalItemsCount: number;
  availableItemsCount: number;
  currentPage: number;
  totalPages: number;
}

export const MenuFilters: React.FC<MenuFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  filterCategory,
  setFilterCategory,
  isFastingType,
  availableCategories,
  fastingSubCategories,
  totalItemsCount,
  availableItemsCount,
  currentPage,
  totalPages,
}) => {
  const formatCategoryLabel = (category: string) => {
    const normalized = String(category || '').trim().toLowerCase();
    if (normalized === 'cafe') return 'Cafe';
    if (normalized === 'barista') return 'Barista';
    if (normalized === 'fasting') return 'የጾም ምግብ';
    if (normalized === 'fasting_break') return 'የፍስክ ምግብ';
    return normalized.replace(/_/g, ' ');
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <SearchInput 
              placeholder="Search menu items..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} wrapperClassName="flex-1 min-w-48" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {availableCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {formatCategoryLabel(category)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={filterCategory} 
            onValueChange={setFilterCategory} 
            disabled={!isFastingType}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All sub categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub categories</SelectItem>
              {fastingSubCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center text-sm text-muted-foreground whitespace-nowrap gap-2">
            <span>{totalItemsCount} items</span>
            <span>·</span>
            <span>{availableItemsCount} available</span>
            {totalPages > 1 && (
              <>
                <span>·</span>
                <span>Page {currentPage} of {totalPages}</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MenuFilters;
