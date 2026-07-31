'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Protected from '../../../components/Protected';
import { useAuth } from '../../../components/AuthProvider';
import { StatusBadge, TrustBar } from '../../../components/Badges';

export default function DocumentDetailPage() {
  return (
    <Protected>
      <DetailInner />
    </Protected>
  );
}

function safeParse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

function DetailInner() {
  const { id } = useParams();
  const { authFetch, token, user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [labelStatus, setLabelStatus] = useState('');
  const [qrUrl, setQrUrl] = useState(null);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/documents/${id}`);
    const data = await res.json();
    if (res.ok) setDoc(data.document);
    setLoading(false);
  }, [authFetch, id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!doc || !token) return;
    let revoked;
    fetch(`/api/documents/${id}/qr`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        revoked = URL.createObjectURL(blob);
        setQrUrl(revoked);
      });
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [doc, token, id]);

  async function handleVerify() {
    setVerifying(true);
    const res = await authFetch(`/api/documents/${id}/verify`, { method: 'POST' });
    const data = await res.json();
    setVerifyResult(data);
    setVerifying(false);
  }

  async function handleLabel(label) {
    const res = await authFetch(`/api/documents/${id}/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (res.ok) setLabelStatus(label === null ? 'Label cleared.' : `Labeled as "${label}".`);
    else setLabelStatus(`Error: ${data.error}`);
  }

  async function handleExplain() {
    setExplaining(true);
    const res = await authFetch(`/api/documents/${id}/explain`);
    const data = await res.json();
    setExplanation(data.explanation || '');
    setExplaining(false);
  }

  if (loading) return <p className="text-muted">Loading…</p>;
  if (!doc) return <p className="text-bad">Document not found or access denied.</p>;

  const extractedFields = safeParse(doc.extractedFields, {});
  const metadataFlags = safeParse(doc.metadataFlags, []);
  const forgeryFlags = safeParse(doc.forgeryFlags, []);
  const metadata = safeParse(doc.metadataJson, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold break-all">{doc.originalFilename}</h1>
          <p className="text-muted text-sm mt-1">{doc.documentType} • {doc.classificationConfidence}% classification confidence • v{doc.version}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={doc.status} />
          <a href={`/api/documents/${id}/file`} target="_blank" rel="noreferrer" className="btn-secondary text-sm">
            View file
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5">
            <TrustBar score={doc.trustScore} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-sm">
              <Metric label="OCR confidence" value={`${Math.round(doc.ocrConfidence || 0)}%`} />
              <Metric label="Forgery score" value={`${doc.forgeryScore}/100`} sub="100 = clean" />
              <Metric label="Duplicate similarity" value={`${doc.duplicateScore}%`} />
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Blockchain integrity ledger</h2>
              <button className="btn-secondary text-sm" onClick={handleVerify} disabled={verifying}>
                {verifying ? 'Checking…' : 'Verify now'}
              </button>
            </div>
            <p className="text-muted text-sm mb-2">SHA-256 file hash sealed into an append-only local hash chain (block #{doc.blockIndex}) at upload time.</p>
            <code className="text-xs text-accent2 break-all block bg-ink p-2 rounded-lg">{doc.sha256}</code>
            {verifyResult && (
              <div className={`mt-3 text-sm rounded-lg px-3 py-2 border ${verifyResult.blockchainVerified ? 'bg-good/10 border-good/30 text-good' : 'bg-bad/10 border-bad/30 text-bad'}`}>
                {verifyResult.blockchainVerified ? '✓ ' : '✗ '}{verifyResult.reason}
              </div>
            )}
          </div>

          {(forgeryFlags.length > 0 || metadataFlags.length > 0) && (
            <div className="card p-5">
              <h2 className="font-semibold mb-3">Risk flags</h2>
              <ul className="space-y-2 text-sm">
                {forgeryFlags.map((f, i) => (
                  <li key={'f' + i} className="flex gap-2"><span className="text-warn">⚠</span><span>{f}</span></li>
                ))}
                {metadataFlags.map((f, i) => (
                  <li key={'m' + i} className="flex gap-2"><span className="text-warn">⚠</span><span>{f}</span></li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(extractedFields).length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold mb-3">Extracted fields</h2>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                {Object.entries(extractedFields).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted text-xs capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd className="mt-0.5">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-semibold mb-3">OCR extracted text</h2>
            <pre className="text-xs text-muted whitespace-pre-wrap max-h-56 overflow-y-auto bg-ink p-3 rounded-lg">
              {doc.ocrText?.trim() || '(no text extracted)'}
            </pre>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-3">File metadata</h2>
            <dl className="grid sm:grid-cols-3 gap-3 text-sm">
              <div><dt className="text-muted text-xs">Created</dt><dd>{metadata.createdAt || '—'}</dd></div>
              <div><dt className="text-muted text-xs">Modified</dt><dd>{metadata.modifiedAt || '—'}</dd></div>
              <div><dt className="text-muted text-xs">Software</dt><dd>{metadata.software || '—'}</dd></div>
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          {(user?.role === 'admin' || user?.role === 'auditor') && (
            <div className="card p-5">
              <h2 className="font-semibold mb-1">Ground-truth label</h2>
              <p className="text-xs text-muted mb-3">Used to build a real labeled dataset for model retraining. Labels are exported via <code>node training/export_labeled_data.mjs</code>.</p>
              {doc.humanLabel && (
                <div className={`text-sm rounded-lg px-3 py-2 border mb-3 ${doc.humanLabel === 'genuine' ? 'bg-good/10 border-good/30 text-good' : 'bg-bad/10 border-bad/30 text-bad'}`}>
                  Currently labeled: <strong>{doc.humanLabel}</strong>
                </div>
              )}
              <div className="flex gap-2">
                <button className="btn-primary text-sm flex-1 bg-good/20 hover:opacity-80" style={{background:'rgba(47,212,128,0.18)',color:'#2fd480'}} onClick={() => handleLabel('genuine')}>Confirm genuine</button>
                <button className="btn-primary text-sm flex-1" style={{background:'rgba(245,86,106,0.18)',color:'#f5566a'}} onClick={() => handleLabel('fraudulent')}>Flag fraudulent</button>
              </div>
              {doc.humanLabel && <button className="text-xs text-muted mt-2 hover:text-white w-full text-center" onClick={() => handleLabel(null)}>Clear label</button>}
              {labelStatus && <p className="text-xs text-muted mt-2">{labelStatus}</p>}
            </div>
          )}

          <div className="card p-5 text-center">
            <h2 className="font-semibold mb-3">Public QR verification</h2>
            {qrUrl ? <img src={qrUrl} alt="QR code" className="mx-auto rounded-lg bg-white p-2" /> : <p className="text-muted text-sm">Loading…</p>}
            <p className="text-xs text-muted mt-3">Anyone can scan this to check status & trust score without logging in.</p>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">AI Verification Assistant</h2>
            </div>
            {explanation ? (
              <pre className="text-sm whitespace-pre-wrap">{explanation}</pre>
            ) : (
              <button className="btn-primary w-full text-sm" onClick={handleExplain} disabled={explaining}>
                {explaining ? 'Thinking…' : 'Why was this scored this way?'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="bg-ink rounded-lg p-3">
      <div className="text-muted text-xs">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
