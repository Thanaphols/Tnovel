'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  loading: true,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Cross-user leak guard: reading history is cached in device-global localStorage. When the
  // account on this device changes (switch or logout), drop those caches so one user never sees
  // another's history. Keyed by the last-seen uid; first visit just records it (no clear).
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    try {
      const KEY = 'tnovel_last_uid';
      const prev = localStorage.getItem(KEY);
      const cur = user?.id || '';
      if (prev !== null && prev !== cur) {
        ['tnovel_cached_reading_history', 'tnovel_guest_history'].forEach((k) => localStorage.removeItem(k));
      }
      localStorage.setItem(KEY, cur);
    } catch {}
  }, [user, loading]);

  const isAdmin = user?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
