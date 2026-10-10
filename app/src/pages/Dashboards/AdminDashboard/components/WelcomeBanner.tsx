import React from 'react';
import { useAuth } from '@/context/AuthContext';
import BranchBadge from '@/components/common/BranchBadge';
import PageHeader from '@/components/layout/PageHeader';
import { getApproximateServerDate } from '@/shared/utils/serverTime';

interface WelcomeBannerProps {
  /** Muted context appended after the date, e.g. "24 orders". */
  context?: string;
}

/** Dashboard header: who's signed in, today's date, branch. */
export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ context }) => {
  const { user } = useAuth() as any;
  const date = getApproximateServerDate().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <PageHeader
      eyebrow={user?.full_name}
      title="Overview"
      description={[date, context].filter(Boolean).join(' · ')}
      actions={<BranchBadge />}
    />
  );
};
