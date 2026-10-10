import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/application';
import { isOnline } from '@/infrastructure/api/http-client';
import toast from 'react-hot-toast';
import { ProfileFormData, PasswordFormData, CancelPasswordFormData, SyncFormData, SyncMetaData } from '../types';
import { INITIAL_PASSWORD_FORM, INITIAL_CANCEL_PASSWORD_FORM, INITIAL_SYNC_FORM, INITIAL_SYNC_META } from '../constants';
import { isDesktopRuntime } from '../utils';
import { friendlyError } from '@/lib/errors';

export const useProfileData = () => {
  const { user, updateProfile, changePassword, getRoleDisplayName, logout } = useAuth();
  const navigate = useNavigate();

  const [online, setOnline] = useState(isOnline());
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormData>({ ...INITIAL_PASSWORD_FORM });
  const [passwordErrors, setPasswordErrors] = useState<any>({});
  const [cancelPasswordForm, setCancelPasswordForm] = useState<CancelPasswordFormData>({ ...INITIAL_CANCEL_PASSWORD_FORM });
  const [cancelPasswordErrors, setCancelPasswordErrors] = useState<any>({});

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkInterval = setInterval(() => {
      setOnline(isOnline());
    }, 2000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(checkInterval);
    };
  }, []);
  
  const [formData, setFormData] = useState<ProfileFormData>({
    full_name: user?.full_name || '',
    username: user?.username || ''
  });
  const [errors, setErrors] = useState<any>({});

  const [syncForm, setSyncForm] = useState<SyncFormData>({ ...INITIAL_SYNC_FORM });
  const [syncMeta, setSyncMeta] = useState<SyncMetaData>({ ...INITIAL_SYNC_META });
  const [remoteStatus, setRemoteStatus] = useState<any>(null);
  const [syncBusy, setSyncBusy] = useState('');

  const isWaiter = false;
  const isAdmin = user?.role === 'admin';
  const hasDesktop = isDesktopRuntime();

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || '',
        username: user.username || ''
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    if (errors[name]) {
      setErrors((prev: any) => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Enter your full name.';
    }
    
    if (!formData.username.trim()) {
      newErrors.username = 'Enter a username.';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username needs at least 3 letters.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const result = await updateProfile(user.id, formData);
      if (result.success) {
        setIsEditing(false);
        toast.success('Profile saved');
      }
    } catch (error) {
      console.error('Profile update error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: user?.full_name || '',
      username: user?.username || ''
    });
    setErrors({});
    setIsEditing(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      // ignored
    }
  };

  const handlePasswordFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) {
      setPasswordErrors((prev: any) => ({ ...prev, [name]: '' }));
    }
  };

  const validatePasswordForm = () => {
    const newErrors: any = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = isWaiter ? 'Enter your current PIN.' : 'Enter your current password.';
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = isWaiter ? 'Enter a new PIN.' : 'Enter a new password.';
    } else {
      if (isWaiter) {
        if (!/^\d{4}$/.test(passwordForm.newPassword)) {
          newErrors.newPassword = 'PIN must be 4 numbers.';
        }
      } else if (passwordForm.newPassword.length < 6) {
        newErrors.newPassword = 'Password needs at least 6 characters.';
      }
    }

    if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      newErrors.confirmPassword = isWaiter ? "The two PINs don't match." : "The two passwords don't match.";
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitPasswordChange = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validatePasswordForm()) return;
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const result = await changePassword(user.id, passwordForm.currentPassword, passwordForm.newPassword);
      if (result.success) {
        setShowChangePassword(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordErrors({});
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClosePasswordDialog = () => {
    if (isLoading) return;
    setShowChangePassword(false);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordErrors({});
  };

  const handleCancelPasswordFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCancelPasswordForm(prev => ({ ...prev, [name]: value }));
    if (cancelPasswordErrors[name]) {
      setCancelPasswordErrors((prev: any) => ({ ...prev, [name]: '' }));
    }
  };

  const validateCancelPasswordForm = () => {
    const newErrors: any = {};

    if (!cancelPasswordForm.newCancelPassword) {
      newErrors.newCancelPassword = 'Enter a manager PIN for cancelling.';
    } else if (cancelPasswordForm.newCancelPassword.length < 6) {
      newErrors.newCancelPassword = 'Manager PIN for cancelling needs at least 6 characters.';
    }

    if (cancelPasswordForm.confirmCancelPassword !== cancelPasswordForm.newCancelPassword) {
      newErrors.confirmCancelPassword = "The two entries don't match.";
    }

    setCancelPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitCancelPasswordChange = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    if (!validateCancelPasswordForm()) return;
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const response = await api.settings.updateCancelPassword(cancelPasswordForm.newCancelPassword);
      const result = (response as any)?.data || {};
      if (result.status === 'success' || result.success === true) {
        toast.success('Manager PIN for cancelling saved');
        setCancelPasswordForm({ newCancelPassword: '', confirmCancelPassword: '' });
        setCancelPasswordErrors({});
      } else {
        toast.error(friendlyError(result, "Couldn't save the manager PIN. Please try again."));
      }
    } catch (error) {
      console.error('Cancel password update error:', error);
      toast.error(friendlyError(error, "Couldn't save the manager PIN. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseCancelPasswordForm = () => {
    if (isLoading) return;
    setCancelPasswordForm({ newCancelPassword: '', confirmCancelPassword: '' });
    setCancelPasswordErrors({});
  };

  useEffect(() => {
    if (!isAdmin || !hasDesktop) return;

    const loadSyncState = async () => {
      try {
        const configResponse = await api.sync.getConfig();
        const syncData = (configResponse as any)?.data?.data || {};
        setSyncForm((prev) => ({
          ...prev,
          enabled: !!syncData.enabled,
          remoteUrl: syncData.remoteUrl || '',
          intervalMs: syncData.intervalMs || 30000,
          token: '',
        }));
        setSyncMeta({
          hasToken: !!syncData.hasToken,
          currentSyncing: !!syncData.currentSyncing,
          lastAttemptAt: syncData.lastAttemptAt || '',
          lastSuccessAt: syncData.lastSuccessAt || '',
          lastError: syncData.lastError || '',
          lastResponseStatus: syncData.lastResponseStatus ?? null,
          hasPendingChanges: !!syncData.hasPendingChanges,
        });
      } catch (error) {
        console.error('Failed to load sync config:', error);
      }
    };

    loadSyncState();
  }, [isAdmin, hasDesktop]);

  const refreshRemoteStatus = async () => {
    setSyncBusy('remote-status');
    try {
      const response = await api.sync.getRemoteStatus();
      setRemoteStatus((response as any)?.data || null);
      if ((response as any)?.data?.success) {
        toast.success('Connected to your online account.');
      } else {
        toast.error(friendlyError((response as any)?.data?.error, "Can't reach the online address. Check it and the internet."));
      }
    } catch (error) {
      console.error('Remote status error:', error);
      toast.error("Couldn't check the connection. Please try again.");
    } finally {
      setSyncBusy('');
    }
  };

  const saveSyncConfig = async () => {
    setSyncBusy('save-sync');
    try {
      const payload: any = {
        enabled: !!syncForm.enabled,
        remoteUrl: syncForm.remoteUrl,
        intervalMs: syncForm.intervalMs,
      };
      if (syncForm.token.trim()) {
        payload.token = syncForm.token.trim();
      }
      const response = await api.sync.updateConfig(payload);
      const syncData = (response as any)?.data?.data || {};
      setSyncMeta({
        hasToken: !!syncData.hasToken,
        currentSyncing: !!syncData.currentSyncing,
        lastAttemptAt: syncData.lastAttemptAt || '',
        lastSuccessAt: syncData.lastSuccessAt || '',
        lastError: syncData.lastError || '',
        lastResponseStatus: syncData.lastResponseStatus ?? null,
        hasPendingChanges: !!syncData.hasPendingChanges,
      });
      setSyncForm((prev) => ({ ...prev, token: '' }));
      toast.success('Settings saved');
    } catch (error) {
      console.error('Save sync config error:', error);
      toast.error("Couldn't save the settings. Please try again.");
    } finally {
      setSyncBusy('');
    }
  };

  const runSyncAction = async (action: string) => {
    setSyncBusy(action);
    try {
      const response = action === 'push'
        ? await api.sync.pushRemote(true)
        : await api.sync.pullRemote();
      const result = (response as any)?.data || {};
      if (result.success) {
        toast.success(action === 'push' ? 'Updates sent' : 'Latest data downloaded');
      } else {
        toast.error(friendlyError(result.error, "Couldn't send updates. Your work is saved. Please try again."));
      }

      const configResponse = await api.sync.getConfig();
      const syncData = (configResponse as any)?.data?.data || {};
      setSyncMeta({
        hasToken: !!syncData.hasToken,
        currentSyncing: !!syncData.currentSyncing,
        lastAttemptAt: syncData.lastAttemptAt || '',
        lastSuccessAt: syncData.lastSuccessAt || '',
        lastError: syncData.lastError || '',
        lastResponseStatus: syncData.lastResponseStatus ?? null,
        hasPendingChanges: !!syncData.hasPendingChanges,
      });
    } catch (error) {
      console.error('Sync action error:', error);
      toast.error("Couldn't send updates. Your work is saved. Please try again.");
    } finally {
      setSyncBusy('');
    }
  };

  return {
    online,
    user,
    getRoleDisplayName,
    isWaiter,
    isAdmin,
    hasDesktop,
    isEditing,
    setIsEditing,
    isLoading,
    showChangePassword,
    setShowChangePassword,
    passwordForm,
    setPasswordForm,
    passwordErrors,
    cancelPasswordForm,
    cancelPasswordErrors,
    formData,
    setFormData,
    errors,
    syncForm,
    setSyncForm,
    syncMeta,
    remoteStatus,
    syncBusy,
    handleChange,
    handleSubmit,
    handleCancel,
    handleLogout,
    handlePasswordFieldChange,
    submitPasswordChange,
    handleClosePasswordDialog,
    handleCancelPasswordFieldChange,
    submitCancelPasswordChange,
    handleCloseCancelPasswordForm,
    refreshRemoteStatus,
    saveSyncConfig,
    runSyncAction
  };
};

export default useProfileData;
