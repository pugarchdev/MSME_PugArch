import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { COOKIE_SESSION_TOKEN, clearAuthCookie, clearStoredToken, setStoredToken } from '../lib/auth';
import { clearGuestCart } from '../features/marketplace/hooks/useGuestCart';

interface User {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'seller' | 'buyer' | 'shg' | 'admin' | 'master_admin' | 'financier';
  accountType?: 'MASTER_ADMIN' | 'SUPERADMIN' | 'SELLER' | 'BUYER' | 'SHG' | 'FINANCIER';
  accountTypeId?: number;
  isDualRole?: boolean;
  registrationStatus?: 'incomplete' | 'completed';
  onboardingStatus: 'pending' | 'pending_validation' | 'under_compliance_review' | 'resubmission_required' | 'approved_for_procurement' | 'approved' | 'rejected';
  status?: string;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  twoFactorEnabled?: boolean;
  adminFeedback?: string;
  permissions?: string[];
  enabledFeatures?: string[];
  sellerProfile?: any;
  buyerProfile?: any;
  organizationId?: number;
  companyId?: number | null;
  districtId?: number | null;
  activeScope?: { scopeType: string; scopeId: string | null };
  company?: {
    id: number;
    name: string;
    shortName?: string | null;
    portalDisplayName: string;
    logoUrl?: string | null;
    district?: string | null;
    state?: string | null;
  } | null;
  organization?: {
    id: number;
    organizationName: string;
    verificationStatus: string;
    isBlacklisted: boolean;
  } | null;
  registrationDetails?: {
    userId?: string;
    selectedDocuments?: string[];
    [key: string]: any;
  };
  sectionStatus?: {
    basic: string;
    business: string;
    compliance: string;
    bank: string;
    documents: string;
  };
  sectionRejectionReasons?: {
    basic?: string;
    business?: string;
    compliance?: string;
    bank?: string;
    documents?: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  refreshUser: (options?: { skipCache?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedUser = localStorage.getItem('msme_user_cache');
        return storedUser ? JSON.parse(storedUser) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('msme_user_cache');
    }
    return true;
  });

  const logout = useCallback(() => {
    void api.post('/api/auth/logout', {}).catch(() => undefined);
    clearStoredToken();
    localStorage.removeItem('msme_user_cache');
    clearAuthCookie();
    setToken(null);
    setUser(null);
    setLoading(false);
    api.invalidate();
  }, []);

  const refreshUser = useCallback(async (options?: { skipCache?: boolean }) => {
    const headers = {};
    
    if (!options?.skipCache) {
      const cachedMe = api.peek('/api/auth/me', { headers });
      if (cachedMe?.user) {
        setUser(cachedMe.user);
        localStorage.setItem('msme_user_cache', JSON.stringify(cachedMe.user));
        setLoading(false);
      }
    }

    try {
      const res = await api.fetch('/api/auth/me', { headers, skipCache: options?.skipCache });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setStoredToken(COOKIE_SESSION_TOKEN);
        setToken(COOKIE_SESSION_TOKEN);
        localStorage.setItem('msme_user_cache', JSON.stringify(data.user));
      } else {
        if (![401, 403].includes(res.status)) return;

        const refreshRes = await api.post('/api/auth/refresh', {});
        if (!refreshRes.ok) {
          logout();
          return;
        }
        const refreshData = await refreshRes.json();
        const currentToken = refreshData.accessToken || refreshData.token || COOKIE_SESSION_TOKEN;
        setStoredToken(currentToken);
        setToken(currentToken);

        const retry = await api.fetch('/api/auth/me', { headers: { Authorization: `Bearer ${currentToken}` }, skipCache: true });
        if (!retry.ok) {
          logout();
          return;
        }
        const data = await retry.json();
        setUser(data.user);
        localStorage.setItem('msme_user_cache', JSON.stringify(data.user));
      }
    } catch (err) {
      console.error('Failed to refresh user session:', err);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

  const login = useCallback((token: string, user: User, _refreshToken?: string) => {
    setStoredToken(token || COOKIE_SESSION_TOKEN);
    localStorage.removeItem('refreshToken');
    localStorage.setItem('msme_user_cache', JSON.stringify(user));
    setToken(token || COOKIE_SESSION_TOKEN);
    setUser(user);
    setLoading(false);
    const guestCartToken = localStorage.getItem('jsg_guest_cart_token');
    const localGuestCart = (() => {
      try {
        const raw = localStorage.getItem('jsg_guest_cart');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((item: any) => ({ id: item.id, type: item.type, quantity: item.quantity || 1 })) : [];
      } catch {
        return [];
      }
    })();
    if (user.role === 'buyer' && (guestCartToken || localGuestCart.length > 0)) {
      void api.post('/api/cart/merge-guest', { cartToken: guestCartToken || undefined, items: localGuestCart }, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.ok) {
          localStorage.removeItem('jsg_guest_cart_token');
          localStorage.removeItem('jsg_guest_cart');
          clearGuestCart();
          api.invalidate('/api/cart');
        }
      }).catch(() => undefined);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
