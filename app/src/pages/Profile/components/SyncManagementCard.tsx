import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Globe, RefreshCw, UploadCloud, DownloadCloud } from 'lucide-react';
import { SyncFormData, SyncMetaData } from '../types';
import { friendlyError, messageForStatus } from '@/lib/errors';

// The interval is stored in milliseconds; people see and type minutes.
const MS_PER_MINUTE = 60000;
const toMinutes = (ms: number) => Math.round((ms / MS_PER_MINUTE) * 100) / 100;

// Plain words for the last send result instead of a raw HTTP code.
const lastSendLabel = (status: number | null) => {
  if (status == null) return '—';
  if (status >= 200 && status < 300) return 'Sent';
  return messageForStatus(status) ?? "Didn't send";
};

// Friendly sentence on screen, raw text tucked away for support staff.
const ErrorWithDetails: React.FC<{ raw: string }> = ({ raw }) => (
  <div className="space-y-1">
    <div>{friendlyError(raw)}</div>
    <details className="text-[11px] font-normal">
      <summary className="cursor-pointer">Details for support</summary>
      <code className="block break-all pt-1">{raw}</code>
    </details>
  </div>
);


interface SyncManagementCardProps {
  syncForm: SyncFormData;
  setSyncForm: React.Dispatch<React.SetStateAction<SyncFormData>>;
  syncMeta: SyncMetaData;
  remoteStatus: any;
  syncBusy: string;
  refreshRemoteStatus: () => void;
  saveSyncConfig: () => void;
  runSyncAction: (action: string) => void;
}

export const SyncManagementCard: React.FC<SyncManagementCardProps> = ({
  syncForm,
  setSyncForm,
  syncMeta,
  remoteStatus,
  syncBusy,
  refreshRemoteStatus,
  saveSyncConfig,
  runSyncAction
}) => {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span>Send updates online</span>
          </CardTitle>
          <CardDescription>This till sends its orders and payments to your online account.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshRemoteStatus}
            disabled={syncBusy !== ''}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncBusy === 'remote-status' ? 'animate-spin' : ''}`} />
            Connection check
          </Button>
          <Button
            size="sm"
            onClick={saveSyncConfig}
            disabled={syncBusy !== ''}
          >
            {syncBusy === 'save-sync' ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="sync-enabled"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary"
                checked={syncForm.enabled}
                onChange={(e) => setSyncForm((prev: any) => ({ ...prev, enabled: e.target.checked }))}
              />
              <Label htmlFor="sync-enabled" className="cursor-pointer">
                Send updates by itself in the background
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Online address</Label>
              <Input
                type="url"
                value={syncForm.remoteUrl}
                onChange={(e) => setSyncForm((prev) => ({ ...prev, remoteUrl: e.target.value }))}
                placeholder="https://cafenet.adebingobot.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Connection password</Label>
              <Input
                type="password"
                value={syncForm.token}
                onChange={(e) => setSyncForm((prev) => ({ ...prev, token: e.target.value }))}
                placeholder={syncMeta.hasToken ? 'Leave empty to keep the saved password' : 'Connection password (if you have one)'}
              />
              <p className="text-xs text-muted-foreground font-semibold">
                {syncMeta.hasToken ? 'A connection password is already saved on this till.' : 'Only needed if your online account gave you one.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Send updates every (minutes)</Label>
              <Input
                type="number"
                min="0.5"
                max="15"
                step="0.5"
                value={toMinutes(syncForm.intervalMs)}
                onChange={(e) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    intervalMs: e.target.value ? Math.round(Number(e.target.value) * MS_PER_MINUTE) : 30000,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border p-4 bg-muted/40 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Send updates by itself</span>
                <Badge variant={syncForm.enabled ? 'success' : 'secondary'}>
                  {syncForm.enabled ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Not sent yet</span>
                <Badge variant={syncMeta.hasPendingChanges ? 'warning' : 'success'}>
                  {syncMeta.hasPendingChanges ? 'Some changes' : 'All sent'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Last send</span>
                <span className="font-semibold text-foreground">{lastSendLabel(syncMeta.lastResponseStatus)}</span>
              </div>
              <div className="text-xs text-muted-foreground font-semibold pt-2 border-t space-y-1">
                <div>Last tried: {syncMeta.lastAttemptAt ? new Date(syncMeta.lastAttemptAt).toLocaleString() : 'Never'}</div>
                <div>Last sent: {syncMeta.lastSuccessAt ? new Date(syncMeta.lastSuccessAt).toLocaleString() : 'Never'}</div>
                <div>
                  Last problem:{' '}
                  {syncMeta.lastError ? <ErrorWithDetails raw={syncMeta.lastError} /> : 'None'}
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4 bg-muted/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground">Connection check</span>
                <Badge variant={remoteStatus?.success ? 'success' : remoteStatus ? 'destructive' : 'secondary'}>
                  {remoteStatus?.success ? 'Connected' : remoteStatus ? 'Not connected' : 'Not checked yet'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {remoteStatus?.success ? (
                  'Your online account can be reached.'
                ) : remoteStatus?.error || remoteStatus?.remote?.message ? (
                  <ErrorWithDetails raw={String(remoteStatus?.error || remoteStatus?.remote?.message)} />
                ) : remoteStatus ? (
                  'No internet or wrong online address. Check and try again.'
                ) : (
                  'Tap Connection check to test the online address.'
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => runSyncAction('push')}
                disabled={syncBusy !== ''}
                size="sm"
              >
                <UploadCloud />
                {syncBusy === 'push' ? 'Sending…' : 'Send now'}
              </Button>
              <Button
                onClick={() => runSyncAction('pull')}
                disabled={syncBusy !== ''}
                variant="outline"
                size="sm"
              >
                <DownloadCloud />
                {syncBusy === 'pull' ? 'Getting…' : 'Get latest from online'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SyncManagementCard;
