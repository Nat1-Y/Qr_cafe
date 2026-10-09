import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/application';
import { Menu, X, ChevronLeft, ChevronRight, LayoutDashboard, Users, ShoppingBag, ClipboardList, CreditCard, BarChart3, LogOut, User, Coffee, DollarSign, Package, Receipt, UserCog, Utensils, Wrench, ArrowLeftRight, MapPin, Printer, RefreshCw, Bike } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { replaceDepartmentConfigMap } from '@/infrastructure/printing/printer-config';
import { CashierPrintingProvider } from '@/context/CashierPrintingContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
  group: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'cashier'], group: 'Main' },
  { name: 'Profile', href: '/dashboard/profile', icon: User, roles: ['admin', 'cashier'], group: 'Main' },
  { name: 'Orders', href: '/dashboard/orders', icon: ClipboardList, roles: ['admin', 'cashier'], group: 'Operations' },
  { name: 'Delivery Orders', href: '/dashboard/deliveries', icon: Bike, roles: ['admin', 'cashier'], group: 'Operations' },
  { name: 'Menu', href: '/dashboard/menu', icon: Utensils, roles: ['admin'], group: 'Operations' },
  { name: 'Tables', href: '/dashboard/tables', icon: Coffee, roles: ['admin'], group: 'Operations' },
  { name: 'Inventory Management', href: '/dashboard/inventory', icon: Package, roles: ['admin'], group: 'Inventory Management' },
  { name: 'Stock Locations', href: '/dashboard/inventory/locations', icon: MapPin, roles: ['admin'], group: 'Inventory Management' },
  { name: 'Stock Transfer', href: '/dashboard/inventory/transfers', icon: ArrowLeftRight, roles: ['admin'], group: 'Inventory Management' },
  { name: 'Payments', href: '/dashboard/payments', icon: CreditCard, roles: ['admin', 'cashier'], group: 'Finance' },
  { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign, roles: ['admin'], group: 'Finance' },
  { name: 'Payments Items', href: '/dashboard/payments-items', icon: Receipt, roles: ['admin'], group: 'Finance' },
  { name: 'Employees', href: '/dashboard/employees', icon: Users, roles: ['admin'], group: 'HR & People' },
  { name: 'User Management', href: '/dashboard/users', icon: UserCog, roles: ['admin'], group: 'HR & People' },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3, roles: ['admin'], group: 'Reports' },
  { name: 'Payment Methods', href: '/dashboard/settings/payment-methods', icon: CreditCard, roles: ['admin'], group: 'Settings' },
  { name: 'Roles', href: '/dashboard/settings/roles', icon: UserCog, roles: ['admin'], group: 'Settings' },
  { name: 'Cashier Employees', href: '/dashboard/cashier/employees', icon: Users, roles: ['cashier'], group: 'Operations' },
  { name: 'Add Order', href: '/dashboard/cashier/select-waiter', icon: ShoppingBag, roles: ['cashier'], group: 'Operations' },
  { name: 'Items Sold Today', href: '/dashboard/cashier/items-sold', icon: Receipt, roles: ['cashier'], group: 'Operations' },
  { name: 'Cashier Expenses', href: '/dashboard/cashier/expenses', icon: DollarSign, roles: ['cashier'], group: 'Finance' },
  {name: 'Settings', href: '/dashboard/settings/data-management', icon: Wrench, roles: ['admin'], group: 'Settings' },
  { name: 'Printer Settings', href: '/dashboard/settings/printer-settings', icon: Printer, roles: ['admin'], group: 'Settings' },
  { name: 'App Updates', href: '/dashboard/settings/updates', icon: RefreshCw, roles: ['admin', 'cashier'], group: 'Settings' },

];

const BRANCH_NAME = import.meta.env.VITE_BRANCH_NAME || '';

function getUserInitials(name: string) {
  return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, getRoleDisplayName } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [cashierCanManageOrgs, setCashierCanManageOrgs] = useState(false);
  const [enableCashierReceipt, setEnableCashierReceipt] = useState(false);

  // Mirror the branch printer routing into this device's local config so the
  // auto-print queue honors it even on a station that never opened Printer
  // Settings (e.g. a fresh install). Only overwrites when the backend actually
  // has a saved map, so a locally-configured-but-not-yet-synced device is safe.
  useEffect(() => {
    if (!user?.role) return;
    let active = true;
    api.settings
      .getPrinterRoutingSettings()
      .then((map: Record<string, unknown>) => {
        if (active && map && typeof map === 'object' && Object.keys(map).length > 0) {
          replaceDepartmentConfigMap(map);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    if (user?.role !== 'cashier') {
      setCashierCanManageOrgs(false);
      return;
    }
    api.settings
      .getOrganizationSettings()
      .then((res: any) => {
        if (active) setCashierCanManageOrgs(Boolean(res?.allow_cashier_manage_org_orders));
      })
      .catch(() => {
        if (active) setCashierCanManageOrgs(false);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    let active = true;
    if (user?.role !== 'cashier') {
      setEnableCashierReceipt(false);
      return;
    }
    api.settings
      .getReceiptSettings()
      .then((res: any) => {
        if (active) setEnableCashierReceipt(Boolean(res?.enable_cashier_receipt));
      })
      .catch(() => {
        if (active) setEnableCashierReceipt(false);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  const filteredItems = ALL_NAV_ITEMS.filter(
    item => user?.role && item.roles.includes(user.role)
  );

  // Read access is open to any cashier (so they can see why an org-attached
  // table isn't in their payment queue) — the "New order" action inside the
  // page itself is what's gated by the owner's per-employee allow-list.
  if (user?.role === 'cashier' || user?.role === 'cafe_waiter') {
    filteredItems.push({
      name: 'Organization Orders',
      href: '/dashboard/organizations/orders',
      icon: ClipboardList,
      roles: [user.role],
      group: 'Operations',
    });
  }

  if (enableCashierReceipt && user?.role === 'cashier') {
    filteredItems.push({
      name: 'Preview receipt',
      href: '/dashboard/cashier/receipt',
      icon: Receipt,
      roles: ['cashier'],
      group: 'Operations',
    });
  }

  const groups = Array.from(new Set(filteredItems.map(i => i.group)));

  const isActive = (href: string) => {
    if (href === '/dashboard') return location.pathname === '/dashboard';
    if (href === '/dashboard/inventory') return location.pathname === href;
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userDisplayName = user?.full_name || user?.name || 'User';

  // Desktop sidebar: icon rail between md and lg, full width from lg unless
  // the user collapsed it. The mobile drawer always shows labels.
  const NavContent = ({ mobile = false }: { mobile?: boolean }) => {
    const labelInline = mobile ? '' : collapsed ? 'hidden' : 'hidden lg:inline';
    const labelBlock = mobile ? '' : collapsed ? 'hidden' : 'hidden lg:block';
    const rowAlign = mobile ? '' : collapsed ? 'justify-center' : 'justify-center lg:justify-start';
    const roleLine = [getRoleDisplayName(), BRANCH_NAME].filter(Boolean).join(' · ');

    return (
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        {/* Wordmark */}
        <div className={cn('flex h-16 shrink-0 items-center gap-2.5 px-4', rowAlign)}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
            <Coffee className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <p className={cn('min-w-0 truncate text-base font-semibold', labelBlock)}>Buna POS</p>
          {mobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <nav className="px-3 pb-4 pt-1">
            {groups.map((group, gi) => {
              const groupItems = filteredItems.filter(i => i.group === group);
              return (
                <div key={group} className={cn(gi > 0 && 'mt-5')}>
                  <p className={cn('mb-1.5 px-3 text-eyebrow text-sidebar-muted', labelBlock)}>{group}</p>
                  <ul className="space-y-0.5">
                    {groupItems.map(item => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <li key={item.href}>
                          <button
                            title={item.name}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => {
                              navigate(item.href);
                              setSidebarOpen(false);
                            }}
                            className={cn(
                              'flex h-10 w-full items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                              rowAlign,
                              active
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                            )}
                          >
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            <span className={cn('truncate', labelInline)}>{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className={cn('flex items-center gap-1', !mobile && (collapsed ? 'flex-col' : 'flex-col lg:flex-row'))}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2.5 rounded-full p-1.5 text-left transition-colors hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                    rowAlign
                  )}
                  title={userDisplayName}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">{getUserInitials(userDisplayName)}</AvatarFallback>
                  </Avatar>
                  <div className={cn('min-w-0 flex-1', labelBlock)}>
                    <p className="truncate text-sm font-semibold">{userDisplayName}</p>
                    <p className="truncate text-meta text-sidebar-muted">{roleLine}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel>
                  <p className="font-semibold">{userDisplayName}</p>
                  <p className="text-meta font-normal text-muted-foreground">{roleLine}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/dashboard/profile')}>
                  <User className="h-4 w-4" />Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle className="shrink-0 text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground" />
          </div>
          {!mobile && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className={cn(
                'mt-1 hidden h-8 w-full items-center gap-2 rounded-full px-3 text-meta text-sidebar-muted transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground lg:flex',
                collapsed && 'justify-center px-0'
              )}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!collapsed && <span>Collapse</span>}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <CashierPrintingProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop / tablet sidebar */}
      <aside className={cn(
        'hidden h-full shrink-0 transition-[width] duration-200 ease-out md:flex md:w-16 md:flex-col',
        collapsed ? 'lg:w-16' : 'lg:w-52'
      )}>
        <NavContent />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-overlay md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200 ease-out md:hidden',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <NavContent mobile />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Slim mobile bar — on larger screens the sidebar carries everything */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="-ml-1.5 flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
            <Coffee className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold text-foreground">Buna POS</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
    </CashierPrintingProvider>
  );
};

export default DashboardLayout;
