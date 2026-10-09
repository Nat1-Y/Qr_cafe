import { useMemo } from 'react';
import { getApproximateServerDateString } from '@/shared/utils/serverTime';
import { isBackOfficeOrderRole } from './useOrderData';

const normalizeStatus = (s: string) => String(s || '').trim().toLowerCase();
const isVoidedStatus = (s: string) => ['deleted', 'canceled', 'cancelled', 'void', 'voided'].includes(normalizeStatus(s));

// Local calendar date (YYYY-MM-DD) of a value, built from the local clock.
const toLocalDateString = (value: any): string => {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const useOrderFiltering = (
  orders: any[],
  menuMainCategoryById: { [key: number]: string },
  paidOrderIdSet: Set<string>,
  searchTerm: string,
  filterStatus: string,
  filterType: string,
  selectedDate: string,
  user: any,
  // Earliest calendar day (YYYY-MM-DD) this role may view; null = unlimited.
  // A hard cap so an out-of-window order is never shown, regardless of the
  // day filter the user picks.
  floorDate: string | null = null
) => {
  return useMemo(() => {
    const useDerivedStatus = isBackOfficeOrderRole(user?.role);

    const isPaidOrder = (order: any) => {
      const idKey = order?.id != null ? String(order.id) : null;
      if (idKey && paidOrderIdSet.has(idKey)) return true;
      const st = normalizeStatus(order?.status);
      const pst = normalizeStatus(order?.payment_status);
      return st === 'paid' || st === 'completed' || st === 'done' || pst === 'paid';
    };

    const getDerivedStatus = (order: any) => {
      if (isVoidedStatus(order?.status)) return 'voided';
      if (isPaidOrder(order)) return 'paid';
      return 'pending';
    };

    let filtered = Array.isArray(orders) ? [...orders] : [];

    // Enforce the role's lookback floor first: nothing older than floorDate is
    // ever visible, whatever day filter is selected.
    if (floorDate) {
      filtered = filtered.filter(order => toLocalDateString(order.created_at) >= floorDate);
    }

    // Filter by date
    if (selectedDate && selectedDate !== 'all') {
      const targetDate = selectedDate === 'today'
        ? getApproximateServerDateString()
        : selectedDate;

      filtered = filtered.filter(order => {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        return orderDate === targetDate;
      });
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(order =>
        String(order?.id ?? '').includes(searchTerm) ||
        String(order?.customer_id ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order?.table_number ?? '').includes(searchTerm)
      );
    }

    // Filter by status
    if (filterStatus !== 'all') {
      if (useDerivedStatus) {
        filtered = filtered.filter(order => getDerivedStatus(order) === normalizeStatus(filterStatus));
      } else {
        if (normalizeStatus(filterStatus) === 'voided') {
          filtered = filtered.filter(order => isVoidedStatus(order.status));
        } else {
          filtered = filtered.filter(order => normalizeStatus(order.status) === normalizeStatus(filterStatus));
        }
      }
    }

    // Filter by type
    if (filterType !== 'all') {
      const ft = String(filterType).trim().toLowerCase();
      filtered = filtered.filter(order => {
        const ot = String(order?.type || '').trim().toLowerCase();
        if (ft === 'cafe' && useDerivedStatus) return ot === 'cafe' || ot === 'bakery';
        if (ft === 'cafe') return ot === 'cafe';
        return ot === ft;
      });
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { filteredOrders: filtered };
  }, [orders, searchTerm, filterStatus, filterType, selectedDate, menuMainCategoryById, paidOrderIdSet, user?.role, floorDate]);
};
