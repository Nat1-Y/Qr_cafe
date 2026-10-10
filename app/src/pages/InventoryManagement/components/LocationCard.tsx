import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Warehouse, Coffee, ChefHat, MapPin, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { StockLocation } from '../types';
import { humanize } from '@/lib/format';

interface LocationCardProps {
  location: StockLocation;
  stats: { inStock: number; lowStock: number; totalItems: number };
  onClick: () => void;
}

const getLocationIcon = (name: string, slug: string) => {
  const term = `${name} ${slug}`.toLowerCase();
  if (term.includes('store') || term.includes('warehouse') || term.includes('storage') || term.includes('main')) {
    return <Warehouse className="h-5 w-5 text-primary" />;
  }
  if (term.includes('barista') || term.includes('bar') || term.includes('coffee') || term.includes('cafe')) {
    return <Coffee className="h-5 w-5 text-warning" />;
  }
  if (term.includes('kitchen') || term.includes('chef') || term.includes('food')) {
    return <ChefHat className="h-5 w-5 text-success" />;
  }
  return <MapPin className="h-5 w-5 text-info" />;
};

export const LocationCard: React.FC<LocationCardProps> = ({ location, stats, onClick }) => {
  return (
    <Card 
      className={`cursor-pointer hover:shadow-md hover:border-primary/40 transition-all duration-200 overflow-hidden group border ${
        location.is_default ? 'border-primary/25 bg-primary/[0.02]' : ''
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-3 border-b border-muted/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">
              {getLocationIcon(location.name, location.slug)}
            </div>
            <div>
              <CardTitle className="group-hover:text-primary transition-colors">{location.name}</CardTitle>
              <span className="text-xs text-muted-foreground font-semibold">{humanize(location.type)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            {location.is_default && (
              <Badge variant="default">Main</Badge>
            )}
            {!location.active && (
              <Badge variant="outline" className="bg-muted">Not active</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-4 space-y-3 bg-muted/[0.05]">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 rounded-md bg-background border text-center">
            <span className="text-xs text-muted-foreground block font-medium">In stock</span>
            <span className="text-lg font-semibold">{stats.inStock}</span>
          </div>
          <div className="p-2 rounded-md bg-background border text-center">
            <span className="text-xs text-muted-foreground block font-medium">Items counted</span>
            <span className="text-lg font-semibold">{stats.totalItems}</span>
          </div>
        </div>

        {stats.lowStock > 0 ? (
          <div className="flex items-center gap-2 text-xs font-medium text-warning bg-warning/10 p-2 rounded-md">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{stats.lowStock} items are running low</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium text-success bg-success/10 p-2 rounded-md">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>All items have enough stock</span>
          </div>
        )}

        <div className="flex items-center justify-end text-xs text-primary font-semibold pt-1 group-hover:translate-x-1 transition-transform">
          <span>See stock</span>
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationCard;
