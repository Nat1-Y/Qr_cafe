import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import api from '@/application';
import { OrganizationOrders } from './OrganizationOrders';

/**
 * The cashier/waiter-facing "own page" for organization orders — read access
 * is open to any cashier (so they can see why an org-attached table isn't in
 * their payment queue), while the "New order" action stays gated by the
 * owner's per-employee allow-list, same as PlaceOrgOrder. Reuses the same
 * OrganizationOrders table the admin's Organizations → Orders tab renders,
 * which already self-gates the Confirm action to owner-tier roles — a
 * cashier viewing this page only ever sees "Awaiting owner" badges.
 */
export const CashierOrganizationOrders: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const isAdmin = user?.role === 'admin';

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [canPlaceOrders, setCanPlaceOrders] = useState(isAdmin);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.organizations.getAll();
        const list =
          res?.data?.data?.organizations ?? res?.data?.organizations ?? [];
        if (!cancelled) setOrganizations(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error('[CashierOrganizationOrders] load failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const allowList = await api.settings.getLocalOrganizationOrderAllowedUsers();
        const allowed = (allowList?.user_ids || [])
          .map(String)
          .includes(String(user?.id));
        if (!cancelled) setCanPlaceOrders(allowed);
      } catch {
        // Opt-in only — stay hidden on failure (e.g. offline).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Organization Orders"
        description="Orders attached to an organization — billed to its credit account, not collected as cash. Only the owner can confirm one."
        actions={
          canPlaceOrders ? (
            <Button onClick={() => navigate('/dashboard/organizations/place-order')}>
              <Plus className="h-4 w-4 mr-2" />
              New order
            </Button>
          ) : undefined
        }
      />
      <OrganizationOrders organizations={organizations} />
    </div>
  );
};

export default CashierOrganizationOrders;
