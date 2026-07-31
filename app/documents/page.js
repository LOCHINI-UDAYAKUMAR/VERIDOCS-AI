'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Protected from '../../components/Protected';
import { useAuth } from '../../components/AuthProvider';
import { StatusBadge, TrustBar } from '../../components/Badges';

export default function DocumentsPage() {
  return (
    <Protected>
      <DocumentsInner />
    </Protected>
  );
}

function DocumentsInner() {
  const { authFetch } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    authFetch('/api/documents').then((r) => r.json()).then((d) => {
      setDocs(d.documents || []);
      setLoading(false);
    });
  }, [authFetch]);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (filter !== 'all' && d.status !== filter) return false;
      if (query && !d.originalFilename.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [docs, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex gap-2">
          <input
            className="input sm:w-56"
            placeholder="Search by filename…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="input sm:w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="Verified">Verified</option>
            <option value="Needs Review">Needs Review</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted">No documents match your filters.</div>
      ) : (
        <div className="card overflow-hidden">
          {filtered.map((d, i) => (
            <Link
              key={d.id}
              href={`/documents/${d.id}`}
              className={`flex items-center justify-between p-4 hover:bg-line/30 ${i !== filtered.length - 1 ? 'border-b border-line' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{d.originalFilename}</div>
                <div className="text-xs text-muted mt-0.5">
                  {d.documentType || 'Unclassified'} • v{d.version} • {new Date(d.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <div className="w-32 hidden md:block"><TrustBar score={d.trustScore} /></div>
                <StatusBadge status={d.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
