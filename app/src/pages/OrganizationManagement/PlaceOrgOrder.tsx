import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import api from '@/application';

/**
 * The cashier/waiter-facing entry point for organization orders — separate
 * from the admin's full Organizations screen (credit ledger, edit, payment
 * confirmation), which stays admin-only. This page only lets an
 * owner-allow-listed employee pick which organization an order is for, then
 * hands off to the existing per-org order builder (CreateOrgOrder) to fill
 * in the cart and a customer name. It never shows credit balances or lets
 * anyone confirm a payment — that stays owner-only, on the Organizations
 * "Orders" tab.
 */
export const PlaceOrgOrder: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(isAdmin);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (!isAdmin) {
          const allowList = await api.settings.getLocalOrganizationOrderAllowedUsers();
          const isAllowed = (allowList?.user_ids || [])
            .map(String)
            .includes(String(user?.id));
          if (cancelled) return;
          setAllowed(isAllowed);
          if (!isAllowed) {
            setLoading(false);
            return;
          }
        }
        const res: any = await api.organizations.getAll();
        const list =
          res?.data?.data?.organizations ?? res?.data?.organizations ?? [];
        if (!cancelled) setOrgs(Array.isArray(list) ? list.filter((o: any) => o.is_active !== false) : []);
      } catch (error) {
        console.error('[PlaceOrgOrder] load failed', error);
        toast.error('Failed to load organizations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id]);

  const filtered = orgs.filter((o) =>
    String(o.name || '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (!loading && !allowed) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <PageHeader title="Organization Orders" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You're not allowed to place organization orders. Ask the owner to
            add you to the allow-list.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Organization Orders"
        description="Pick which organization this order is for."
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organizations..."
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-center py-10">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">
              No organizations found.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((org) => (
                <button
                  key={org.id}
                  onClick={() =>
                    navigate(`/dashboard/organizations/${org.id}/create-order`)
                  }
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{org.name}</span>
                  </span>
                  <Button size="sm" variant="outline" className="pointer-events-none">
                    New order
                  </Button>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlaceOrgOrder;
