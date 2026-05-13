import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'seller' | 'buyer' | 'admin';
  registrationStatus?: 'incomplete' | 'completed';
  onboardingStatus: 'pending' | 'pending_validation' | 'under_compliance_review' | 'resubmission_required' | 'approved_for_procurement' | 'approved' | 'rejected';
  status?: string;
  adminFeedback?: string;
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
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${currentToken}` };
    const cachedMe = api.peek('/api/auth/me', { headers });
    if (cachedMe?.user) {
      setUser(cachedMe.user);
      setLoading(false);
    }

    try {
      const res = await api.fetch('/api/auth/me', { headers });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        logout();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
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
