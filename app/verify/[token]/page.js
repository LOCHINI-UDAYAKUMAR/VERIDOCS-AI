'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { StatusBadge, TrustBar } from '../../../components/Badges';

export default function PublicVerifyPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/verify/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Verification failed.');
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent mx-auto flex items-center justify-center text-xl font-bold mb-3">V</div>
          <h1 className="text-xl font-bold">VeriDocs AI — Public Verification</h1>
        </div>

        <div className="card p-6">
          {loading && <p className="text-muted text-center">Checking document…</p>}
          {error && <p className="text-bad text-center">{error}</p>}
          {data && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold break-all">{data.originalFilename}</div>
                  <div className="text-muted text-sm">{data.documentType} • version {data.version}</div>
                </div>
                <StatusBadge status={data.status} />
              </div>
              <TrustBar score={data.trustScore} />
              <div className={`text-sm rounded-lg px-3 py-2 border ${data.blockchainVerified ? 'bg-good/10 border-good/30 text-good' : 'bg-bad/10 border-bad/30 text-bad'}`}>
                {data.blockchainVerified ? '✓ File integrity confirmed against the tamper-proof ledger.' : '✗ File integrity could not be confirmed — content may have changed since it was sealed.'}
              </div>
              <div className="text-xs text-muted text-center">Last checked {new Date(data.verifiedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
