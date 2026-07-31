'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', roles: ['admin', 'organization', 'auditor', 'verifier'] },
  { href: '/upload', label: 'Upload', roles: ['admin', 'organization'] },
  { href: '/documents', label: 'Documents', roles: ['admin', 'organization', 'auditor', 'verifier'] },
  { href: '/audit', label: 'Audit Trail', roles: ['admin', 'auditor'] },
  { href: '/chain', label: 'Ledger', roles: ['admin', 'organization', 'auditor', 'verifier'] },
  { href: '/admin/users', label: 'Users', roles: ['admin'] },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav className="border-b border-line bg-panel/60 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-bold text-lg flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-sm">V</span>
            VeriDocs AI
          </Link>
          <div className="hidden md:flex gap-1">
            {LINKS.filter((l) => l.roles.includes(user.role)).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm ${pathname === l.href ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted capitalize">{user.role}</div>
          </div>
          <button onClick={logout} className="btn-secondary text-sm py-1.5 px-3">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
