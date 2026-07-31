'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [ready, user, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted">
      Loading VeriDocs AI…
    </div>
  );
}
