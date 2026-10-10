import React, { useState, useEffect } from 'react';
import { AlertTriangle, Package, MapPin, Receipt, MonitorSmartphone, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PageHeader from '@/components/layout/PageHeader';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import apiService from '@/application';
import { toast } from 'react-hot-toast';
import { getLocalDb, localDbTables, clearAllLocalData } from '@/db/localDb';
import OfflineBanner from '@/components/OfflineBanner';
import { useSyncOnline } from '@/hooks/useSyncOnline';
import { getDeviceEnrollment, clearDeviceEnrollment } from '@/shared/utils/deviceToken';
import { clearSessionUser } from '@/shared/utils/sessionUser';
import { createCleanupRequest, getActiveCleanupRequest, type CleanupRequest } from '@/infrastructure/api/data-cleanup';

const DataManagement = () => {
    const [allowLowStock, setAllowLowStock] = useState(false);
    const [savingInventorySettings, setSavingInventorySettings] = useState(false);
    const [forceTableSelection, setForceTableSelection] = useState(false);
    const [savingDiningSettings, setSavingDiningSettings] = useState(false);
    const [enableCashierReceipt, setEnableCashierReceipt] = useState(false);
    const [savingReceiptSettings, setSavingReceiptSettings] = useState(false);
    const [isResetDeviceOpen, setIsResetDeviceOpen] = useState(false);
    const [resettingDevice, setResettingDevice] = useState(false);
    const [cleanupRequest, setCleanupRequest] = useState<CleanupRequest | null>(null);
    const [isRequestCleanupOpen, setIsRequestCleanupOpen] = useState(false);
    const [requestingCleanup, setRequestingCleanup] = useState(false);
    const enrollment = getDeviceEnrollment();
    const online = useSyncOnline();

    useEffect(() => {
        Promise.all([
            apiService.settings.getSystemSettings(),
            apiService.settings.getTableSelectionSettings(),
            apiService.settings.getReceiptSettings()
        ]).then(([invSettings, diningSettings, receiptSettings]) => {
            setAllowLowStock(invSettings.allow_low_stock_orders);
            setForceTableSelection(diningSettings.force_table_selection);
            setEnableCashierReceipt(receiptSettings.enable_cashier_receipt);
        }).catch((err) => {
            console.error('Failed to load settings:', err);
        });
    }, []);

    useEffect(() => {
        if (!online) return;
        getActiveCleanupRequest()
            .then(setCleanupRequest)
            .catch(() => { /* offline / transient */ });
    }, [online]);

    const handleRequestCleanup = async () => {
        setRequestingCleanup(true);
        try {
            const request = await createCleanupRequest();
            setCleanupRequest(request);
            setIsRequestCleanupOpen(false);
            toast.success('Request sent. Waiting for the owner to say yes.');
        } catch (error) {
            console.error('Cleanup request failed:', error);
            toast.error("Couldn't send the request. Please try again.");
        } finally {
            setRequestingCleanup(false);
        }
    };

    const handleToggleLowStock = async (enabled: boolean) => {
        setSavingInventorySettings(true);
        try {
            await apiService.settings.updateInventorySettings({ allow_low_stock_orders: enabled });
            setAllowLowStock(enabled);
            toast.success(
                enabled
                    ? 'Orders can now be taken even when stock is low.'
                    : 'Orders will be blocked when ingredients are low in stock.',
            );
        } catch (error: any) {
            toast.error("Couldn't save the stock setting. Please try again.");
        } finally {
            setSavingInventorySettings(false);
        }
    };

    const handleToggleForceTableSelection = async (enabled: boolean) => {
        setSavingDiningSettings(true);
        try {
            await apiService.settings.updateTableSelectionSettings({ force_table_selection: enabled });
            setForceTableSelection(enabled);
            toast.success(
                enabled
                    ? 'Staff must now pick a table for dine-in orders.'
                    : 'Picking a table is now optional.',
            );
        } catch (error: any) {
            toast.error("Couldn't save the table setting. Please try again.");
        } finally {
            setSavingDiningSettings(false);
        }
    };

    const handleToggleCashierReceipt = async (enabled: boolean) => {
        setSavingReceiptSettings(true);
        try {
            await apiService.settings.updateReceiptSettings({ enable_cashier_receipt: enabled });
            setEnableCashierReceipt(enabled);
            toast.success(
                enabled
                    ? 'Cashiers can now print receipts.'
                    : 'Cashier receipt page is now hidden from cashiers.',
            );
        } catch (error: any) {
            toast.error("Couldn't save the receipt setting. Please try again.");
        } finally {
            setSavingReceiptSettings(false);
        }
    };

    const handleResetDevice = async () => {
        setResettingDevice(true);
        try {
            // Switching branches: drop this device's token and all cached
            // branch-scoped data, then send the operator back to enrollment.
            clearSessionUser();
            await clearAllLocalData();
            const db = await getLocalDb();
            await db.delete(localDbTables.menuItems);
            await db.delete(localDbTables.categories);
            await db.delete(localDbTables.mainCategories);
            await db.delete(localDbTables.menuItemCategories);
            await db.delete(localDbTables.orders);
            await db.delete(localDbTables.payments);
            await db.delete(localDbTables.expenses);
            await clearDeviceEnrollment();
            toast.success('Device cleared and signed out. Starting setup again…');
            setTimeout(() => window.location.reload(), 600);
        } catch (error) {
            console.error('Device reset failed:', error);
            toast.error("Couldn't clear this device. Please try again.");
            setResettingDevice(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6">
            <PageHeader
                title="Settings"
                description="Stock, tables, receipts and this device."
            />

            <div className="max-w-2xl mx-auto">
                <OfflineBanner online={online} />
            </div>

            <div className="grid gap-6 max-w-2xl mx-auto">
                {/* Inventory Settings */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            Stock
                        </CardTitle>
                        <CardDescription>
                            What happens when stock runs low.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                            <div className="space-y-1">
                                <h4 className="font-medium text-sm">Allow orders when stock is low</h4>
                                <p className="text-xs text-muted-foreground">
                                    When on, staff can take orders even if there isn&apos;t enough
                                    stock. Stock can then go below zero.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-xs font-semibold ${allowLowStock ? 'text-warning' : 'text-muted-foreground'}`}>
                                    {allowLowStock ? 'On' : 'Off'}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={allowLowStock}
                                    disabled={savingInventorySettings || !online}
                                    onClick={() => handleToggleLowStock(!allowLowStock)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
                                        allowLowStock ? 'bg-warning' : 'bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                                            allowLowStock ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                        {allowLowStock && (
                            <p className="mt-3 text-xs text-warning flex items-start gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                Orders are allowed when stock is low. Stock may go below zero after payment.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Dining Settings */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            Tables
                        </CardTitle>
                        <CardDescription>
                            Choose if staff must pick a table.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                            <div className="space-y-1">
                                <h4 className="font-medium text-sm">Staff must pick a table</h4>
                                <p className="text-xs text-muted-foreground">
                                    When on, staff must pick a table or Takeaway before they can send an order.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-xs font-semibold ${forceTableSelection ? 'text-warning' : 'text-muted-foreground'}`}>
                                    {forceTableSelection ? 'On' : 'Off'}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={forceTableSelection}
                                    disabled={savingDiningSettings || !online}
                                    onClick={() => handleToggleForceTableSelection(!forceTableSelection)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
                                        forceTableSelection ? 'bg-warning' : 'bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                                            forceTableSelection ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Receipt Settings */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <Receipt className="h-5 w-5 text-primary" />
                            Receipts
                        </CardTitle>
                        <CardDescription>
                            Choose if cashiers can print receipts.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                            <div className="space-y-1">
                                <h4 className="font-medium text-sm">Let cashiers print receipts</h4>
                                <p className="text-xs text-muted-foreground">
                                    When on, cashiers can open the receipts page and print receipts for orders.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-xs font-semibold ${enableCashierReceipt ? 'text-success' : 'text-muted-foreground'}`}>
                                    {enableCashierReceipt ? 'On' : 'Off'}
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={enableCashierReceipt}
                                    disabled={savingReceiptSettings || !online}
                                    onClick={() => handleToggleCashierReceipt(!enableCashierReceipt)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
                                        enableCashierReceipt ? 'bg-success' : 'bg-muted'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                                            enableCashierReceipt ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Request Data Cleanup */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <Eraser className="h-5 w-5 text-primary" />
                            Ask to clear old data
                        </CardTitle>
                        <CardDescription>
                            Ask the owner to clear the data on this device. If the owner says yes, this branch&apos;s orders and payments are deleted.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                            <div className="space-y-1">
                                {cleanupRequest?.status === 'pending' ? (
                                    <>
                                        <h4 className="font-medium text-sm text-warning">Waiting for the owner</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Your request is sent. This device will clear its data by itself when the owner says yes online.
                                        </p>
                                    </>
                                ) : cleanupRequest?.status === 'approved' ? (
                                    <>
                                        <h4 className="font-medium text-sm text-success">Owner said yes. Clearing data…</h4>
                                        <p className="text-xs text-muted-foreground">
                                            The owner said yes. This device will finish sending updates, then clear its data.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <h4 className="font-medium text-sm">Clear all data on this device</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Sends a request to the owner. Nothing is deleted until they say yes. This device stays set up and downloads the menu, staff and settings again after.
                                        </p>
                                    </>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsRequestCleanupOpen(true)}
                                disabled={!online || cleanupRequest?.status === 'pending' || cleanupRequest?.status === 'approved'}
                                className="w-full sm:w-auto shrink-0"
                            >
                                {cleanupRequest?.status === 'pending' ? 'Request sent' : 'Ask to clear data'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Device Enrollment */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2">
                            <MonitorSmartphone className="h-5 w-5 text-primary" />
                            This device
                        </CardTitle>
                        <CardDescription>
                            This device is set up for one branch.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg bg-background gap-4">
                            <div className="space-y-1">
                                <h4 className="font-medium text-sm">
                                    {enrollment?.deviceName || 'Set up'}
                                </h4>
                                <p className="text-xs text-muted-foreground font-mono">
                                    Branch: {enrollment?.branchId || '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Clearing signs this device out of the branch and goes back to the setup screen, so you can set it up again. All data on this device is cleared.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsResetDeviceOpen(true)}
                                className="w-full sm:w-auto shrink-0"
                            >
                                Clear and sign out device
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isRequestCleanupOpen} onOpenChange={setIsRequestCleanupOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ask to clear old data?</DialogTitle>
                        <DialogDescription>
                            This sends a request to the owner. If they say yes, all data on this
                            device is cleared and this branch&apos;s orders and payments are deleted
                            for good. The device stays set up. You can&apos;t undo this.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRequestCleanupOpen(false)} disabled={requestingCleanup}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleRequestCleanup} disabled={requestingCleanup}>
                            {requestingCleanup ? 'Sending…' : 'Send request'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isResetDeviceOpen} onOpenChange={setIsResetDeviceOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Clear and sign out this device?</DialogTitle>
                        <DialogDescription>
                            This signs the device out of its branch and clears all its data.
                            You&apos;ll need a new setup code to set it up again. You can&apos;t undo this.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsResetDeviceOpen(false)} disabled={resettingDevice}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleResetDevice} disabled={resettingDevice}>
                            {resettingDevice ? 'Clearing…' : 'Yes, clear device'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default DataManagement;
