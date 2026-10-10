import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/application';
import { isOnline } from '@/infrastructure/api/http-client';
import toast from 'react-hot-toast';
import {
  clearSessionUser,
  getSessionUser,
  setSessionUser,
  type SessionUser,
} from '@/shared/utils/sessionUser';
import { syncEngine } from '@/infrastructure/sync/sync-engine';
import { orderSocket } from '@/infrastructure/realtime/order-socket';
import { friendlyError } from '@/lib/errors';
import { humanize } from '@/lib/format';

export interface User {
  id: string | number;
  name?: string;
  role: string;
  is_active: boolean;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (credentials: any, loginType?: string, silent?: boolean) => Promise<{ success: boolean; user?: User; error?: string }>;
  register: (userData: any) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (userId: string | number, profileData: any) => Promise<{ success: boolean; user?: User; error?: string }>;
  changePassword: (userId: string | number, currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  isAdmin: () => boolean;
  getRoleDisplayName: (role?: string) => string;
}

// Create Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Auth Provider Component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Initialize auth state from session storage
  useEffect(() => {
    try {
      const sessionUser = getSessionUser();
      if (sessionUser) {
        setUser(sessionUser as User);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error initializing auth session:', error);
      clearSessionUser();
    } finally {
      setLoading(false);
    }
  }, []);

  // Login function
  const login = async (credentials: any, loginType = 'traditional', silent = true) => {
    try {
      setLoading(true);
      
      let response: any;
      if (loginType === 'pin') {
        response = await api.auth.pinLogin(credentials);
      } else if (loginType === 'staff') {
        response = await api.auth.staffLogin(credentials);
      } else {
        response = await api.auth.login(credentials);
      }
      
      console.log('🔐 Login response:', response);
      const data = response?.data || {};

      const isSuccess = data.status === 'success' || data.success === true;
      const userData = data?.data?.user || data?.user;
      
      if (isSuccess && userData) {
        setUser(userData);
        setIsAuthenticated(true);
        setSessionUser(userData as SessionUser);

        // Hydrate local data in the background so navigation is instant.
        // Run a full sync to refresh it — deliberately NOT wiping local data
        // first (see clearAllLocalData()'s comment in localDb.ts): pairing a
        // wipe with this unawaited, interruptible sync would leave data
        // (e.g. the menu) empty if the app closed mid-sync, since local
        // SQLite writes aren't transactional. Each pull task reconciles
        // safely against the server's list on its own.
        // Fire-and-forget — the sync engine notifies subscribers as it
        // progresses, so pages (via useSyncRefetch) refresh once it lands.
        void (async () => {
          try {
            await syncEngine.sync();
          } catch (hydrationError) {
            console.warn('Background hydration after login failed:', hydrationError);
          }
        })();

        return { success: true, user: userData };
      }
      
      const message = friendlyError(data, "Couldn't sign in. Please try again.");
      console.log('❌ Login failed:', message);
      if (!silent) {
        toast.error(message);
      }
      return { success: false, error: message };
    } catch (error: any) {
      console.error('💥 Login error:', error);
      const message = friendlyError(error, "Couldn't sign in. Please try again.");
      if (!silent) {
        toast.error(message);
      }
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  // Register function
  const register = async (userData: any) => {
    try {
      setLoading(true);
      const response = await api.auth.register(userData);
      
      if (response.data.status === 'success') {
        toast.success('Account created. Please sign in.');
        return { success: true };
      }
      return { success: false };
    } catch (error: any) {
      console.error('Registration error:', error);
      const message = friendlyError(error, "Couldn't create the account. Please try again.");
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setUser(null);
    setIsAuthenticated(false);
    try {
      orderSocket.stop();
    } catch (e) {
      // ignore
    }
    try {
      clearSessionUser();
    } catch (e) {
      // ignore
    }

    try {
      api.auth.logout().catch((error: any) => {
        console.error('Logout error:', error);
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    toast.success('Signed out');
  };

  // Update user profile
  const updateProfile = async (userId: string | number, profileData: any) => {
    if (!isOnline()) {
      const msg = 'No internet. Connect to change your profile.';
      toast.error(msg);
      return { success: false, error: msg };
    }
    try {
      const response = await api.auth.updateProfile(userId, profileData);
      
      if (response.data.status === 'success') {
        const updatedUser = response.data.user;
        setUser(updatedUser);
        setSessionUser(updatedUser as SessionUser);
        toast.success('Profile saved');
        return { success: true, user: updatedUser };
      }
      return { success: false, error: "Couldn't save your profile. Please try again." };
    } catch (error: any) {
      console.error('Profile update error:', error);
      const message = friendlyError(error, "Couldn't save your profile. Please try again.");
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const changePassword = async (userId: string | number, currentPassword: string, newPassword: string) => {
    if (!isOnline()) {
      const msg = 'No internet. Connect to change your password or PIN.';
      toast.error(msg);
      return { success: false, error: msg };
    }
    try {
      const response = await api.auth.changePassword(userId, {
        current_password: currentPassword,
        new_password: newPassword,
      });

      const data = response?.data || {};
      const isSuccess = data.status === 'success' || data.success === true;
      if (isSuccess) {
        toast.success('Password changed');
        return { success: true };
      }

      const message = friendlyError(data, "Couldn't change your password. Please try again.");
      toast.error(message);
      return { success: false, error: message };
    } catch (error: any) {
      console.error('Change password error:', error);
      const message = friendlyError(error, "Couldn't change your password. Please try again.");
      toast.error(message);
      return { success: false, error: message };
    }
  };

  // Check if user has specific role
  const hasRole = (role: string) => {
    return user?.role === role;
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roles: string[]) => {
    return roles.includes(user?.role || '');
  };

  // Check if user is admin
  const isAdmin = () => {
    return user?.role === 'admin';
  };

  // Get user's role display name
  const getRoleDisplayName = (role: string | undefined = user?.role) => {
    const roleNames: Record<string, string> = {
      admin: 'Manager',
      cashier: 'Cashier',
      fb_manager: 'Food & drinks manager',
      cafe_waiter: 'Waiter',
      kitchen_staff: 'Kitchen',
      owner: 'Owner',
    };
    return roleNames[role || ''] || (role ? humanize(role) : '');
  };

  // Context value
  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    hasRole,
    hasAnyRole,
    isAdmin,
    getRoleDisplayName,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
