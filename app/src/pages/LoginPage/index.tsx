import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useLoginForm } from './hooks/useLoginForm';
import { useLoginPhase } from './hooks/useLoginPhase';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import AuthSplitLayout from '@/components/layout/AuthSplitLayout';
import syncEngine from '@/infrastructure/sync/sync-engine';
import { WifiOff, RefreshCw } from 'lucide-react';

const LoginPageContainer = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  // ─── Online gate ──────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [checkingConn, setCheckingConn] = useState<boolean>(true);

  const checkConnection = useCallback(async () => {
    setCheckingConn(true);
    const online = await syncEngine.verifyConnection();
    setIsOnline(online);
    setCheckingConn(false);
  }, []);

  // Probe on mount and every 10 s
  useEffect(() => {
    checkConnection();
    const timer = setInterval(checkConnection, 10_000);
    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);
  // ─────────────────────────────────────────────────────────────────────────

  const {
    loginPhase,
    selectedUser,
    employees,
    selectUser,
    goToAdminLogin,
    goBackToUserSelection
  } = useLoginPhase();

  const form = useLoginForm(loginPhase);

  const usernameRef = useRef<HTMLInputElement>(null);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Hard-block login if offline
    if (!isOnline) return;

    if (!form.validateForm(loginPhase)) return;

    form.setIsLoading(true);

    try {
      let result: any = { success: false };

      if (loginPhase === 'pin-entry') {
        result = await login(
          { name: form.formData.username, pin: form.formData.pin },
          'pin'
        );
      } else if (loginPhase === 'admin') {
        result = await login(
          { username: form.formData.username, password: form.formData.password },
          'traditional'
        );

        if (!result?.success) {
          result = await login(
            { name: form.formData.username, password: form.formData.password },
            'staff'
          );
        }
        if (!result?.success) {
          result = await login(
            { name: form.formData.username, pin: form.formData.password },
            'pin'
          );
        }
      }

      if (result?.success && result?.user) {
        // login() hydrates the essentials in the background, so navigate immediately.
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
    } finally {
      form.setIsLoading(false);
    }
  };

  // Handle user selection — block when offline
  const handleUserSelect = (user: any) => {
    if (!isOnline) return;
    selectUser(user);
    form.setFormData(prev => ({
      ...prev,
      username: user.username || user.full_name || '',
      pin: ''
    }));
    form.setErrors({});
  };

  // Handle back button
  const handleBack = () => {
    goBackToUserSelection();
    form.resetForm();
  };

  // Auto-focus management
  useEffect(() => {
    if (loginPhase === 'pin-entry') {
      setTimeout(() => usernameRef.current?.focus(), 100);
    }
  }, [loginPhase]);

  return (
    <AuthSplitLayout>
      {!isOnline && (
        <div className="mb-6 flex items-start gap-3 rounded-card bg-destructive-soft px-4 py-3 text-destructive animate-fade-in">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">No internet</p>
            <p className="mt-0.5 text-meta">You need internet to sign in. Check the connection and try again.</p>
          </div>
          <button
            onClick={checkConnection}
            disabled={checkingConn}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive/10 disabled:opacity-50"
            title="Try again"
            aria-label="Try again"
          >
            <RefreshCw className={`h-4 w-4 ${checkingConn ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {loginPhase === 'admin' && (
        <AdminLoginScreen
          formData={{ username: form.formData.username, password: form.formData.password }}
          errors={form.errors}
          isLoading={form.isLoading}
          showPassword={form.showPassword}
          onUsernameChange={form.handleChange}
          onPasswordChange={form.handleChange}
          onTogglePassword={() => form.setShowPassword(!form.showPassword)}
          onSubmit={handleSubmit}
          onBack={handleBack}
          disabled={!isOnline}
        />
      )}
    </AuthSplitLayout>
  );
};

export default LoginPageContainer;

