'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function Protected({ roles, children }) {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [ready, user, roles, router]);

  if (!ready || !user) {
    return <div className="min-h-[60vh] flex items-center justify-center text-muted">Loading…</div>;
  }
  if (roles && !roles.includes(user.role)) {
    return <div className="min-h-[60vh] flex items-center justify-center text-muted">Redirecting…</div>;
  }
  return children;
}
