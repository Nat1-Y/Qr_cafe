import { useState, useEffect } from 'react';
import api from '@/application';
import toast from 'react-hot-toast';
import { getLocalDb, localDbTables } from '@/db/localDb';
import { useHistoryLookbackDays } from '@/shared/hooks/useHistoryLookbackDays';
import { humanize } from '@/lib/format';

// Back-office roles see every order (not just the ones they placed) and use the
// derived paid/pending/voided view. Waiters only see their own orders.
const BACK_OFFICE_ORDER_ROLES = new Set(['admin', 'cashier']);
export const isBackOfficeOrderRole = (role?: string | null) =>
  BACK_OFFICE_ORDER_ROLES.has(String(role || '').toLowerCase());

// Local calendar date (YYYY-MM-DD) `daysAgo` days back, built from the local
// clock (not UTC) so it never drifts a day around midnight.
const localDateString = (daysAgo = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const useOrderData = (showCreateModal: boolean, user: any) => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [menuMainCategoryById, setMenuMainCategoryById] = useState<{ [key: number]: string }>({});
  const [paidOrderIdSet, setPaidOrderIdSet] = useState<Set<string>>(new Set());
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<{ [key: number]: { name: string, role: string } }>({});

  // Per-role history lookback (days back; null = unlimited), kept fresh by the
  // sync loop. floorDate is the earliest calendar day this role may view; every
  // order query is floored to it so out-of-window history is never fetched.
  const lookbackDays = useHistoryLookbackDays();
  const floorDate = lookbackDays == null ? null : localDateString(lookbackDays);
  const isBackOffice = isBackOfficeOrderRole(user?.role);

  // Params scoping the order list to this role: back-office roles see all
  // orders; other roles are scoped to the ones they placed. Both are floored to
  // the role's lookback window.
  const buildOrderParams = () => {
    const params: any = {
      // Delivery orders live on their own Deliveries page (own status, own
      // payments ledger) — never mix them into the normal Orders list.
      exclude_delivery: "1",
      // Same reasoning: organization orders live on their own Orders tab
      // under Organizations (own confirm flow, own credit ledger).
      exclude_organization: "1",
    };
    if (!isBackOffice) params.employee_id = user?.id;
    if (floorDate) params.date_from = floorDate;
    return params;
  };

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const response: any = await api.orders.getAll(buildOrderParams());

        const payload = response?.data;
        const rawOrders = payload?.data?.orders || payload?.orders || payload?.data || payload || [];
        const sortedOrders = (Array.isArray(rawOrders) ? rawOrders : []).sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setOrders(sortedOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast.error("Couldn't load orders. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchOrders();
    }
  }, [user?.id, user?.role, floorDate, isBackOffice]);

  // Fetch menu categories
  useEffect(() => {
    let cancelled = false;
    api.menu
      .getAll()
      .then((resp: any) => {
        if (cancelled) return;
        const payload = resp?.data;
        const items = payload?.data?.menuItems ?? payload?.menuItems ?? payload?.data ?? payload ?? [];
        if (!Array.isArray(items) || items.length === 0) return;
        const next: { [key: number]: string } = {};
        for (const it of items) {
          const id = it?.id != null ? it.id : null;
          if ((id === "")) continue;
          const main = String(it?.main_category || '').trim().toLowerCase();
          if (!main) continue;
          next[id as number] = main;
        }
        setMenuMainCategoryById(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch paid orders (back-office roles use the derived paid/pending view).
  useEffect(() => {
    if (!isBackOffice) {
      setPaidOrderIdSet(new Set());
      return;
    }

    let cancelled = false;
    api.payments
      .getAll(floorDate ? { date_from: floorDate } : undefined)
      .then((resp: any) => {
        if (cancelled) return;
        const paymentsList = resp?.data?.data?.payments ?? resp?.data?.payments ?? [];
        const paid = (Array.isArray(paymentsList) ? paymentsList : [])
          .filter((p) => String(p?.status || '').trim().toLowerCase() === 'paid')
          .map((p) => (p?.order_id != null ? String(p.order_id) : null))
          .filter(Boolean) as string[];
        setPaidOrderIdSet(new Set(paid));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isBackOffice, floorDate]);

  // Fetch menu items
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        let response: any;
        response = await api.menu.getAll();
        const payload = response?.data;
        const allItems = payload?.data?.menuItems || payload?.menuItems || payload?.data || payload || [];
        const available = (Array.isArray(allItems) ? allItems : []).filter((item: any) => item.is_available);
        setMenuItems(available);
      } catch (error) {
        console.error('Error fetching menu items:', error);
        toast.error("Couldn't load the menu. Please try again.");
      }
    };

    if (showCreateModal) {
      fetchMenuItems();
    }
  }, [showCreateModal, user?.role]);

  // Fetch users map for resolving order employee names and roles
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const db = await getLocalDb();
        const userRows = await db.select({ raw_json: localDbTables.users.raw_json }).from(localDbTables.users);
        const usersList = userRows.map((row: any) => JSON.parse(row.raw_json));
        const next: { [key: number]: { name: string, role: string } } = {};
        for (const u of usersList) {
          if (u.id) {
            const name = [u.first_name, u.last_name]
              .filter(Boolean)
              .join(' ')
              .trim() || u.full_name || u.name || u.username || 'Employee';
            next[u.id] = { name, role: u.role || '' };
          }
        }
        setUsersMap(next);
      } catch (e) {
        console.error('Error fetching users map in useOrderData:', e);
      }
    };
    fetchUsers();
  }, []);

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      await api.orders.updateStatus(orderId, {
        status: newStatus,
        updated_by: user?.id
      });

      toast.success(`Order marked as ${humanize(newStatus).toLowerCase()}`);

      const response = await api.orders.getAll(buildOrderParams());

      const payload = (response as any)?.data;
      const rawOrders = payload?.data?.orders || payload?.orders || payload?.data || payload || [];
      const sortedOrders = (Array.isArray(rawOrders) ? rawOrders : []).sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setOrders(sortedOrders);
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error("Couldn't change the order. Please try again.");
    }
  };

  return {
    loading,
    orders,
    menuMainCategoryById,
    paidOrderIdSet,
    menuItems,
    usersMap,
    updateOrderStatus,
    lookbackDays,
    floorDate,
    isBackOffice
  };
};
