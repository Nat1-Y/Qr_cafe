import React from 'react';
import { Edit3, Trash2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LOCATION_TYPE_OPTIONS, StockLocation } from '../types';

const typeLabel = (value: string) =>
  LOCATION_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;

interface LocationsTableProps {
  loading: boolean;
  locations: StockLocation[];
  onEdit: (location: StockLocation) => void;
  onDeactivate: (location: StockLocation) => void;
}

export const LocationsTable: React.FC<LocationsTableProps> = ({
  loading,
  locations,
  onEdit,
  onDeactivate,
}) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle>Stock places</CardTitle>
        <CardDescription>
          Where you keep stock, and where orders take it from
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-2">
        {locations.map((location) => (
          <div
            key={location.id}
            className="flex items-center gap-4 p-4 rounded-xl border bg-muted/10 hover:bg-muted/20 transition-colors"
          >
            <div className="shrink-0 text-muted-foreground">
              <MapPin className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                {location.name}
                {location.is_default && (
                  <Badge variant="outline">
                    default
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                Short name: {location.slug} · {typeLabel(location.location_type)}
              </div>
              {location.description && (
                <div className="text-xs text-muted-foreground mt-0.5">{location.description}</div>
              )}
              {location.linked_main_category_slug && (
                <div className="text-xs text-muted-foreground mt-1">
                  Section: {location.linked_main_category_slug}
                </div>
              )}
            </div>

            <Badge
              variant={location.is_active ? 'default' : 'outline'}
              className={
                location.is_active
                  ? 'bg-success/15 text-success border-success/30 font-semibold text-xs'
                  : 'bg-muted/30 text-muted-foreground font-semibold text-xs'
              }
            >
              {location.is_active ? 'Active' : 'Not active'}
            </Badge>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => onEdit(location)}
                disabled={!location.is_active}
                title="Edit stock place"
              >
                <Edit3 />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={() => onDeactivate(location)}
                disabled={!location.is_active || location.is_default}
                title={
                  location.is_default
                    ? "You can't turn off the main stock place"
                    : 'Turn off this place'
                }
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}

        {locations.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground font-semibold border border-dashed rounded-xl bg-muted/20">
            No stock places yet. Tap &quot;Add stock place&quot; to add one.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationsTable;
