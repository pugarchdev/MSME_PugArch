import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'seller' | 'buyer' | 'admin';
  registrationStatus?: 'incomplete' | 'completed';
  onboardingStatus: 'pending' | 'pending_validation' | 'under_compliance_review' | 'resubmission_required' | 'approved_for_procurement' | 'approved' | 'rejected';
  status?: string;
  emailVerified?: boolean;
  mobileVerified?: boolean;
  twoFactorEnabled?: boolean;
  adminFeedback?: string;
  registrationDetails?: {
    userId?: string;
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
  refreshUser: () => Promise<void>;
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
  }, []);

  const refreshUser = useCallback(async () => {
    let currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${currentToken}` };
    const cachedMe = api.peek('/api/auth/me', { headers });
    if (cachedMe?.user) {
      setUser(cachedMe.user);
      localStorage.setItem('msme_user_cache', JSON.stringify(cachedMe.user));
      setLoading(false);
    }

    try {
      const res = await api.fetch('/api/auth/me', { headers });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('msme_user_cache', JSON.stringify(data.user));
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
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error(err);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback((token: string, user: User, refreshToken?: string) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('msme_user_cache', JSON.stringify(user));
    document.cookie = `token=${token}; path=/; max-age=900; SameSite=Lax`; 
    setToken(token);
    setUser(user);
    setLoading(false);
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
