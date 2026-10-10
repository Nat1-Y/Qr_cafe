import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/application';
import { syncEngine } from '@/infrastructure/sync/sync-engine';

/** An order still owes money unless it is cancelled or already paid. */
export const isOrderUnpaid = (order: any) => {
  const status = String(order?.status || '').toLowerCase();
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  return (
    status !== 'cancelled' &&
    status !== 'paid' &&
    status !== 'done' &&
    paymentStatus !== 'paid'
  );
};

/**
 * Shared confirm-payment flow for organization orders. Handles the modal
 * state, the create + confirm payment calls, and re-loading afterwards.
 * `onDone` is invoked after a successful (or recovered) confirmation so the
 * caller can refresh its order list.
 */
export const useOrgPayment = (onDone: () => void | Promise<void>) => {
  const { user } = useAuth() as any;

  const [confirmOrder, setConfirmOrder] = useState<any | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(
    null,
  );

  const openConfirmPayment = (order: any) => {
    if (!order) return;
    setConfirmOrder(order);
    setShowConfirmModal(true);
  };

  const closeModal = (open: boolean) => {
    setShowConfirmModal(open);
    if (!open) setConfirmOrder(null);
  };

  // Settles on the organization's own credit ledger — never creates a row in
  // the shared `payments` table, so an organization order never counts toward
  // today's revenue/pending (see backend order.service.ts's
  // confirmOrganizationOrderPayment). The backend independently re-checks
  // that `user.id` actually resolves to an owner-level role; the caller here
  // is expected to have already gated the Confirm Payment control to
  // hasAnyRole(['owner', 'business_admin']) so a non-owner never even sees it.
  const handleConfirmPayment = async () => {
    const order = confirmOrder;
    if (!order) return;

    const orderId = String(order.id ?? order.localId ?? "").trim();
    if (!orderId) {
      toast.error("This order hasn't been sent yet. Tap Send now, then try again.");
      return;
    }

    try {
      setProcessingOrderId(orderId);

      await api.orders.confirmOrganizationPayment(orderId, user?.id);

      toast.success('Marked as paid');
      setShowConfirmModal(false);
      setConfirmOrder(null);
      syncEngine.notifyListeners();
      await onDone();
    } catch (error: any) {
      console.error('[useOrgPayment] confirm payment failed', error);
      if (error?.response?.status === 403) {
        toast.error("Only the owner can mark this order as paid.");
      } else if (
        error?.response?.status === 400 &&
        String(error?.response?.data?.message || '').includes('already confirmed')
      ) {
        toast.error('This order is already marked as paid.');
      } else {
        toast.error("Couldn't mark it as paid. Please try again.");
      }
      await onDone();
    } finally {
      setProcessingOrderId(null);
    }
  };

  return {
    confirmOrder,
    showConfirmModal,
    closeModal,
    processingOrderId,
    openConfirmPayment,
    handleConfirmPayment,
  };
};
