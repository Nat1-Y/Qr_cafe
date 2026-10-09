import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '@/application';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { ArrowLeftIcon } from 'lucide-react';
import { Bike } from 'lucide-react';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/input';
export const SESSION_KEY = 'cashier_order_waiter_v1';
// A delivery order has no waiter to attribute — set when the cashier picks
// "Start Delivery Order" here, read by useCashierCreateOrder as a fallback
// so the mode survives a refresh the same way a picked waiter does.
export const DELIVERY_MODE_KEY = 'cashier_order_delivery_mode_v1';

const CashierSelectWaiterForOrder = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [deliveryMethods, setDeliveryMethods] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchWaiters = async () => {
      try {
        setLoading(true);
        const resp = await api.users.getWaiters();
        const list = (resp as any)?.data?.data?.users ?? (resp as any)?.data?.users ?? (resp as any)?.data?.waiters ?? [];
        const arr = Array.isArray(list) ? list : [];
        if (cancelled) return;
        setUsers(arr);
      } catch (e) {
        console.error('Failed to load waiters:', e);
        if (!cancelled) {
          toast.error('Failed to load waiters');
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWaiters();

    // Only offer the delivery shortcut once the owner has actually
    // configured at least one delivery method.
    api.settings
      .getDeliveryMethods()
      .then((list: any[]) => {
        if (!cancelled) setDeliveryMethods(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDeliveryMethods([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const waiters = useMemo(() => {
    const arr = Array.isArray(users) ? users : [];
    const onlyWaiters = arr.filter((u) => String(u?.role || '').toLowerCase().includes('waiter'));
    const list = onlyWaiters.length > 0 ? onlyWaiters : arr;

    const q = String(search || '').trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((u) => {
          const name = String(u?.full_name || u?.name || u?.username || '').toLowerCase();
          const username = String(u?.username || '').toLowerCase();
          return name.includes(q) || username.includes(q);
        });

    return filtered
      .slice()
      .sort((a, b) => {
        const an = String(a?.full_name || a?.name || a?.username || '').toLowerCase();
        const bn = String(b?.full_name || b?.name || b?.username || '').toLowerCase();
        const nameCompare = an.localeCompare(bn);
        if (nameCompare !== 0) return nameCompare;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
  }, [users, search]);

  const handleSelect = (u: any) => {
    if (!u) return;

    const payload = {
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.name || u.username,
      name: u.full_name || u.name || u.username,
      role: u.role,
      is_active: u.is_active !== false
    };

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      // A real waiter was picked — clear any leftover delivery-mode flag so
      // it can't leak into this (or a later) order.
      sessionStorage.removeItem(DELIVERY_MODE_KEY);
    } catch {
      // ignore
    }

    navigate('/dashboard/cashier/create-order', { state: { waiter: payload } });
  };

  const handleStartDelivery = () => {
    try {
      // No waiter is attributed to a delivery order — drop any waiter left
      // over from a previous order so it can't leak into this one.
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.setItem(DELIVERY_MODE_KEY, '1');
    } catch {
      // ignore
    }
    navigate('/dashboard/cashier/create-order', { state: { deliveryMode: true } });
  };

  if (loading) return <LoadingSpinner text="Loading waiters..." />;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        eyebrow="New order"
        title="Who is it for?"
        description="Pick the waiter serving this table, or start a delivery."
        actions={
          <>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a waiter"
              wrapperClassName="w-full sm:w-64"
            />
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <ArrowLeftIcon />
              Back
            </Button>
          </>
        }
      />

      {deliveryMethods.length > 0 && (
        <button
          type="button"
          onClick={handleStartDelivery}
          className="flex w-full items-center gap-4 rounded-card border border-border bg-card p-4 text-left transition-colors hover:bg-row-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          <Bike className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Delivery order</p>
            <p className="text-sm text-muted-foreground">No waiter needed. Pick the delivery method on the next screen.</p>
          </div>
        </button>
      )}

      {waiters.length === 0 ? (
        <EmptyState
          className="rounded-card border border-dashed border-border"
          title={search ? 'No waiter by that name' : 'No waiters yet'}
          description={search ? 'Check the spelling or clear the search.' : 'Add waiters in Employees first.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {waiters.map((u) => {
            const name = u?.full_name || u?.name || u?.username || 'Waiter';
            const username = u?.username ? String(u.username) : '';
            const inactive = u?.is_active === false;
            const initials = name
              .split(/\s+/)
              .map((p: string) => p.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase();

            return (
              <button
                key={u.id || name}
                type="button"
                onClick={() => handleSelect(u)}
                disabled={inactive}
                className="flex min-h-16 w-full items-center gap-3 rounded-card border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground">
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{name}</span>
                  {username && <span className="block truncate text-meta text-muted-foreground">@{username}</span>}
                </span>
                {inactive && <StatusBadge status="inactive" label="Inactive" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CashierSelectWaiterForOrder;
