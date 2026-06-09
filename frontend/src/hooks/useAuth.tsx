import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'seller' | 'buyer' | 'admin' | 'master_admin';
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
  const [token, setToken] = useState<string | null>(typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      // If there is a token but no user cache, show loading. If no token at all, no loading needed.
      return !!localStorage.getItem('token') && !localStorage.getItem('msme_user_cache');
    }
    return true;
  });

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem('token');
    if (currentToken) {
      void api.post('/api/auth/logout', {}, {
        headers: { Authorization: `Bearer ${currentToken}` }
      }).catch(() => undefined);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('msme_user_cache');
    document.cookie = 'token=; path=/; max-age=0';
    setToken(null);
    setUser(null);
    setLoading(false);
    api.invalidate();
  }, []);

  const refreshUser = useCallback(async (options?: { skipCache?: boolean }) => {
    let currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setLoading(false);
      return;
    }

    // Keep the auth cookie in sync with localStorage so Next.js middleware
    // (which only sees the cookie) doesn't redirect us to '/' while we're
    // still authenticated. The cookie is short-lived by design (15 min); we
    // re-stamp it here on every refresh to extend its lifetime.
    document.cookie = `token=${currentToken}; path=/; max-age=900; SameSite=Lax`;

    const headers = { Authorization: `Bearer ${currentToken}` };
    
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
        localStorage.setItem('msme_user_cache', JSON.stringify(data.user));
        // Re-stamp the cookie now that the token is confirmed valid.
        document.cookie = `token=${currentToken}; path=/; max-age=900; SameSite=Lax`;
      } else {
        if (![401, 403].includes(res.status)) return;

        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          logout();
          return;
        }

        const refreshRes = await api.post('/api/auth/refresh', { refreshToken });
        if (!refreshRes.ok) {
          logout();
          return;
        }
        const refreshData = await refreshRes.json();
        currentToken = refreshData.accessToken || refreshData.token;
        localStorage.setItem('token', currentToken || '');
        document.cookie = `token=${currentToken}; path=/; max-age=900; SameSite=Lax`;

        const retry = await api.fetch('/api/auth/me', { headers: { Authorization: `Bearer ${currentToken}` }, skipCache: true });
        if (!retry.ok) {
          logout();
          return;
        }
        const data = await retry.json();
        setUser(data.user);
        localStorage.setItem('msme_user_cache', JSON.stringify(data.user));
      }
    } catch {
      logout();
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

  // Cookie heartbeat: middleware reads the auth cookie and redirects to '/'
  // when it's missing. The cookie has a 15-minute max-age but the JWT lasts
  // longer; without periodic re-stamping, an active session would get bounced
  // when the cookie expired, even though the JWT is still valid.
  useEffect(() => {
    if (!user) return;
    const restamp = () => {
      const t = localStorage.getItem('token');
      if (t) {
        document.cookie = `token=${t}; path=/; max-age=900; SameSite=Lax`;
      }
    };
    restamp();
    const interval = setInterval(restamp, 5 * 60_000);
    return () => clearInterval(interval);
  }, [user]);

  const login = useCallback((token: string, user: User, refreshToken?: string) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('msme_user_cache', JSON.stringify(user));
    document.cookie = `token=${token}; path=/; max-age=900; SameSite=Lax`;
    setToken(token);
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
