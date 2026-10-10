import React from 'react';
import ConfirmCashPaymentModal from '../modals/ConfirmCashPaymentModal';
import PaymentReportsModal from '../modals/PaymentReportsModal';
import OperatorProfileModal from '../modals/OperatorProfileModal';
import type { LineRow, OrderRow } from '@/types/display.types';
import type { OrderBreakdown } from '../modals/ConfirmCashPaymentModal';

interface ModalSectionProps {
  isOnline: boolean;
  user: any;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  // Confirm Cash Payment Modal
  showConfirmProcessPaymentModal: boolean;
  setShowConfirmProcessPaymentModal: (show: boolean) => void;
  confirmProcessPaymentOrder: any;
  isBlockingPaymentUi: boolean;
  isProcessing: boolean;
  onConfirmCashPayment: () => void;
  // Reports Modal
  showReportsModal: boolean;
  setShowReportsModal: (show: boolean) => void;
  todayStats: any;
  // Profile Modal
  showProfileModal: boolean;
  setShowProfileModal: (show: boolean) => void;
  profileData: any;
  setProfileData: (data: any) => void;
  onUpdateProfile: () => void;
  // Utilities
  formatCurrency: (val: any) => string;
  getOrderUnitBreakdown?: (order: OrderRow, unit: string | null) => OrderBreakdown | null | undefined;
  getItemSubtotalBirr?: (item: LineRow) => number;
}

export const ModalSection: React.FC<ModalSectionProps> = ({
  isOnline,
  user,
  paymentMethod,
  setPaymentMethod,
  showConfirmProcessPaymentModal,
  setShowConfirmProcessPaymentModal,
  confirmProcessPaymentOrder,
  isBlockingPaymentUi,
  isProcessing,
  onConfirmCashPayment,
  showReportsModal,
  setShowReportsModal,
  todayStats,
  showProfileModal,
  setShowProfileModal,
  profileData,
  setProfileData,
  onUpdateProfile,
  formatCurrency,
  getOrderUnitBreakdown,
  getItemSubtotalBirr,
}) => {
  return (
    <>
      <ConfirmCashPaymentModal
        open={showConfirmProcessPaymentModal}
        onOpenChange={setShowConfirmProcessPaymentModal}
        confirmProcessPaymentOrder={confirmProcessPaymentOrder}
        isBlockingPaymentUi={isBlockingPaymentUi}
        isProcessing={isProcessing}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        onConfirm={onConfirmCashPayment}
        formatCurrency={formatCurrency}
        getOrderUnitBreakdown={getOrderUnitBreakdown}
        getItemSubtotalBirr={getItemSubtotalBirr}
      />

      <PaymentReportsModal
        open={showReportsModal}
        onOpenChange={setShowReportsModal}
        todayStats={todayStats}
        formatCurrency={formatCurrency}
      />

      <OperatorProfileModal
        isOnline={isOnline}
        open={showProfileModal}
        onOpenChange={setShowProfileModal}
        user={user}
        profileData={profileData}
        setProfileData={setProfileData}
        onUpdateProfile={onUpdateProfile}
      />
    </>
  );
};
