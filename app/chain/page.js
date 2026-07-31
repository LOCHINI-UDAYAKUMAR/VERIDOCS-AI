'use client';

import { useEffect, useState } from 'react';
import Protected from '../../components/Protected';
import { useAuth } from '../../components/AuthProvider';

export default function ChainPage() {
  return (
    <Protected>
      <ChainInner />
    </Protected>
  );
}

function ChainInner() {
  const { authFetch } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/chain/status').then((r) => r.json()).then((d) => {
      setStatus(d);
      setLoading(false);
    });
  }, [authFetch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrity ledger</h1>
        <p className="text-muted text-sm mt-1">Append-only SHA-256 hash chain sealing every document version. Any historical edit breaks the chain from that point forward.</p>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className={`card p-5 flex items-center justify-between ${status.valid ? 'border-good/40' : 'border-bad/40'}`}>
            <div>
              <div className="font-semibold">{status.valid ? '✓ Chain integrity verified' : '✗ Chain integrity compromised'}</div>
              <div className="text-muted text-sm mt-1">{status.blockCount ?? 0} block(s) recomputed and validated from genesis.</div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-line font-semibold text-sm">Latest blocks</div>
            {status.latestBlocks.length === 0 ? (
              <div className="p-6 text-center text-muted">No blocks yet — upload a document to seal the first one.</div>
            ) : (
              status.latestBlocks.map((b, i) => (
                <div key={b.idx} className={`p-4 text-sm ${i !== status.latestBlocks.length - 1 ? 'border-b border-line' : ''}`}>
                  <div className="flex justify-between">
                    <span className="font-medium">Block #{b.idx}</span>
                    <span className="text-muted text-xs">{new Date(b.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted mt-1 space-y-0.5">
                    <div className="break-all">Block hash: <span className="text-accent2">{b.blockHash}</span></div>
                    <div className="break-all">Prev hash: {b.previousBlockHash}</div>
                    <div className="break-all">Document hash: {b.documentHash}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
