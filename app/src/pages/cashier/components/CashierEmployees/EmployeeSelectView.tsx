import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';

interface Employee {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface EmployeeSelectViewProps {
  employees: Employee[];
  onSelectEmployee: (id: string) => void;
}

export const EmployeeSelectView: React.FC<EmployeeSelectViewProps> = ({
  employees,
  onSelectEmployee
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmployees = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(term) ||
        e.username.toLowerCase().includes(term) ||
        e.role.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>All waiters</CardTitle>
        <SearchInput
          placeholder="Find by name"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          wrapperClassName="sm:w-72"
        />
      </CardHeader>

      <CardContent className="p-4">
        {filteredEmployees.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredEmployees.map((e) => {
              const initials = e.full_name
                .split(' ')
                .map((n) => n[0])
                .filter(Boolean)
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelectEmployee(String(e.id))}
                  className="group flex min-h-14 items-center gap-3 rounded-card border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-row-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
                    {initials || '?'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {e.full_name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          e.is_active ? 'bg-success' : 'bg-muted-foreground'
                        }`}
                      />
                      <span className="truncate text-xs capitalize text-muted-foreground">
                        {e.role.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No waiter by that name.</p>
        )}
      </CardContent>
    </Card>
  );
};
