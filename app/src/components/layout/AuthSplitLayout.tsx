import React from 'react';
import { Coffee } from 'lucide-react';

interface AuthSplitLayoutProps {
  /** Big line on the terracotta panel. */
  headline?: React.ReactNode;
  /** Muted line under the headline. */
  subline?: React.ReactNode;
  children: React.ReactNode;
}

const Wordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
      <Coffee className="h-5 w-5" />
    </span>
    <span className="text-lg font-semibold">Buna POS</span>
  </div>
);

/** Login / PIN / enrollment frame: terracotta brand panel left, cream form right. */
const AuthSplitLayout: React.FC<AuthSplitLayoutProps> = ({
  headline = 'Open the till, take orders, close the day.',
  subline = 'Sign in with the account your manager set up for you.',
  children,
}) => (
  <div className="grid min-h-screen bg-background md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
      <Wordmark />
      <div className="max-w-sm">
        <p className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em]">{headline}</p>
        <p className="mt-4 text-base text-sidebar-muted">{subline}</p>
      </div>
      <a
        href="https://syntaxsoftwaresolution.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-meta text-sidebar-muted transition-colors hover:text-sidebar-foreground"
      >
        © Syntax Software Solution
      </a>
    </aside>

    <main className="flex min-h-screen flex-col px-4 py-8 md:px-12">
      <Wordmark className="text-foreground md:hidden" />
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  </div>
);

export default AuthSplitLayout;
