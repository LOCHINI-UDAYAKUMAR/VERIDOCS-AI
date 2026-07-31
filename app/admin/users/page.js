'use client';

import { useEffect, useState } from 'react';
import Protected from '../../../components/Protected';
import { useAuth } from '../../../components/AuthProvider';

export default function AdminUsersPage() {
  return (
    <Protected roles={['admin']}>
      <UsersInner />
    </Protected>
  );
}

const ROLE_COLORS = {
  admin: 'bg-accent2/15 text-accent2 border-accent2/40',
  organization: 'bg-accent/15 text-accent border-accent/40',
  auditor: 'bg-warn/15 text-warn border-warn/40',
  verifier: 'bg-muted/15 text-muted border-muted/40',
};

function UsersInner() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/users').then((r) => r.json()).then((d) => {
      setUsers(d.users || []);
      setLoading(false);
    });
  }, [authFetch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted text-sm mt-1">{users.length} registered account{users.length === 1 ? '' : 's'}.</p>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="card overflow-hidden">
          {users.map((u, i) => (
            <div key={u.id} className={`p-4 flex items-center justify-between ${i !== users.length - 1 ? 'border-b border-line' : ''}`}>
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted">{u.email} • joined {new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${ROLE_COLORS[u.role]}`}>{u.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
