import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { WifiOff } from 'lucide-react';
import { humanize } from '@/lib/format';

interface OperatorProfileModalProps {
  isOnline: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  profileData: {
    full_name: string;
    phone: string;
    address: string;
  };
  setProfileData: React.Dispatch<React.SetStateAction<any>>;
  onUpdateProfile: () => void;
}

const OperatorProfileModal: React.FC<OperatorProfileModalProps> = ({
  isOnline,
  open,
  onOpenChange,
  user,
  profileData,
  setProfileData,
  onUpdateProfile
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
          <DialogDescription>Change your name, phone and address.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!isOnline && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-center gap-3 text-xs font-semibold">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>No internet. Connect to change your profile.</span>
            </div>
          )}

          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-highlight rounded-full flex items-center justify-center mx-auto mb-2 text-highlight-foreground">
              <span className="text-xl font-semibold">
                {user?.full_name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <h4 className="text-base font-semibold text-foreground">{user?.full_name}</h4>
            <Badge variant="secondary" className="px-2 mt-0.5">
              {humanize(user?.role)}
            </Badge>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input
                type="text"
                value={profileData.full_name}
                onChange={(e) => setProfileData((prev: any) => ({ ...prev, full_name: e.target.value }))}
                disabled={!isOnline}
                className="h-10"
              />
            </div>



            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData((prev: any) => ({ ...prev, phone: e.target.value }))}
                disabled={!isOnline}
                className="h-10"
                placeholder="Enter phone number"
              />
            </div>

            <div className="space-y-1">
              <Label>Address</Label>
              <Textarea
                value={profileData.address}
                onChange={(e) => setProfileData((prev: any) => ({ ...prev, address: e.target.value }))}
                disabled={!isOnline}
               
                rows={3}
                placeholder="Enter address"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onUpdateProfile} disabled={!isOnline}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OperatorProfileModal;
