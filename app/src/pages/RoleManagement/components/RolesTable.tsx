import React from 'react';
import { Edit3, Trash2, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Role } from '../types';

const DEFAULT_ROLES = ['admin', 'cashier'];

interface RolesTableProps {
  loading: boolean;
  roles: Role[];
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export const RolesTable: React.FC<RolesTableProps> = ({
  loading,
  roles,
  onEdit,
  onDelete,
}) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle>Roles</CardTitle>
        <CardDescription>Roles you can give staff when you add them</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-2">
        {roles.map(role => {
          const isDefault = DEFAULT_ROLES.includes(role.name);
          return (
            <div
              key={role.id}
              className="flex items-center gap-4 p-4 rounded-xl border bg-muted/10 hover:bg-muted/20 transition-colors"
            >
              <div className="shrink-0 text-muted-foreground">
                {isDefault ? <Shield className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm flex items-center gap-2">
                  {role.display_name}
                  {isDefault && (
                    <Badge variant="outline" className="border-none text-muted-foreground">default</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-medium">Code name: {role.name}</div>
                {role.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{role.description}</div>
                )}
              </div>

              <Badge
                variant={role.is_active ? 'default' : 'outline'}
                className={
                  role.is_active
                    ? 'bg-success/15 text-success border-success/30 font-semibold text-xs'
                    : 'bg-muted/30 text-muted-foreground font-semibold text-xs'
                }
              >
                {role.is_active ? 'Active' : 'Off'}
              </Badge>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => onEdit(role)}
                  disabled={isDefault}
                  title={isDefault ? "Built-in roles can't be changed" : 'Edit role'}
                >
                  <Edit3 />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => onDelete(role)}
                  disabled={isDefault}
                  title={isDefault ? "Built-in roles can't be turned off" : 'Turn off role'}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}

        {roles.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground font-semibold border border-dashed rounded-xl bg-muted/20">
            No roles yet. Tap "Add role" to add one.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
