'use client';

import { useEffect, useState } from 'react';
import Protected from '../../components/Protected';
import { useAuth } from '../../components/AuthProvider';

export default function AuditPage() {
  return (
    <Protected roles={['admin', 'auditor']}>
      <AuditInner />
    </Protected>
  );
}

const ACTION_COLORS = {
  DOCUMENT_UPLOADED: 'text-accent',
  DOCUMENT_VERIFIED: 'text-good',
  INTEGRITY_CHECK: 'text-accent2',
  USER_LOGIN: 'text-muted',
  USER_REGISTERED: 'text-muted',
  PUBLIC_QR_SCAN: 'text-warn',
};

function safeParse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

function AuditInner() {
  const { authFetch } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/audit').then((r) => r.json()).then((d) => {
      setLogs(d.logs || []);
      setLoading(false);
    });
  }, [authFetch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit trail</h1>
        <p className="text-muted text-sm mt-1">Every login, upload, verification, and public QR scan across the platform.</p>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="card overflow-hidden">
          {logs.map((log, i) => {
            const details = safeParse(log.details);
            return (
              <div key={log.id} className={`p-4 flex items-start justify-between gap-4 ${i !== logs.length - 1 ? 'border-b border-line' : ''}`}>
                <div>
                  <span className={`text-sm font-semibold ${ACTION_COLORS[log.action] || 'text-white'}`}>{log.action.replace(/_/g, ' ')}</span>
                  {details && (
                    <div className="text-xs text-muted mt-1">{JSON.stringify(details)}</div>
                  )}
                  <div className="text-xs text-muted mt-1">
                    {log.documentId ? `Document: ${log.documentId.slice(0, 8)}… ` : ''}
                    {log.userId ? `User: ${log.userId.slice(0, 8)}…` : ''}
                  </div>
                </div>
                <div className="text-xs text-muted shrink-0">{new Date(log.timestamp).toLocaleString()}</div>
              </div>
            );
          })}
          {logs.length === 0 && <div className="p-6 text-center text-muted">No activity yet.</div>}
        </div>
      )}
    </div>
  );
}
