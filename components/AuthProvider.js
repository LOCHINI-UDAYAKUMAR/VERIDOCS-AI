'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem('veridocs_token');
    const u = localStorage.getItem('veridocs_user');
    if (t && u) {
      setToken(t);
      setUser(JSON.parse(u));
    }
    setReady(true);
  }, []);

  const login = useCallback((tok, usr) => {
    localStorage.setItem('veridocs_token', tok);
    localStorage.setItem('veridocs_user', JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('veridocs_token');
    localStorage.removeItem('veridocs_user');
    setToken(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const authFetch = useCallback(async (url, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    return res;
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, ready, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
