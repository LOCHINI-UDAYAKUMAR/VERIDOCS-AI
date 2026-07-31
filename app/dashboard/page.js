'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import Protected from '../../components/Protected';
import { useAuth } from '../../components/AuthProvider';
import { StatusBadge, TrustBar } from '../../components/Badges';

const COLORS = ['#4f8cff', '#22d3ee', '#2fd480', '#f5b642', '#f5566a', '#a78bfa'];

export default function DashboardPage() {
  return (
    <Protected>
      <DashboardInner />
    </Protected>
  );
}

function DashboardInner() {
  const { user, authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [statsRes, docsRes, modelsRes] = await Promise.all([
        authFetch('/api/dashboard/stats'),
        authFetch('/api/documents'),
        authFetch('/api/models/metrics'),
      ]);
      setStats(await statsRes.json());
      const docsData = await docsRes.json();
      setRecent((docsData.documents || []).slice(0, 6));
      if (modelsRes.ok) setModelInfo(await modelsRes.json());
      setLoading(false);
    }
    load();
  }, [authFetch]);

  if (loading) return <div className="text-muted">Loading dashboard…</div>;

  const pieData = [
    { name: 'Verified', value: stats.verifiedCount },
    { name: 'Needs Review', value: stats.needsReviewCount },
    { name: 'Rejected', value: stats.rejectedCount },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="text-muted text-sm mt-1 capitalize">{user.role} dashboard</p>
        </div>
        {(user.role === 'organization' || user.role === 'admin') && (
          <Link href="/upload" className="btn-primary">Upload document</Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total documents" value={stats.totalDocuments} />
        <StatCard label="Verified" value={stats.verifiedCount} accent="good" />
        <StatCard label="Needs review" value={stats.needsReviewCount} accent="warn" />
        <StatCard label="Avg. trust score" value={`${stats.averageTrustScore}/100`} accent="accent" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Verification outcomes</h2>
          {pieData.length === 0 ? (
            <p className="text-muted text-sm">No documents yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #22304d', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-4">Documents by type</h2>
          {stats.byType.length === 0 ? (
            <p className="text-muted text-sm">No documents yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.byType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22304d" />
                <XAxis dataKey="documentType" tick={{ fill: '#7c8aa8', fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#7c8aa8', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #22304d', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#4f8cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {stats.trend.length > 1 && (
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Upload trend & average trust score</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#22304d" />
              <XAxis dataKey="day" tick={{ fill: '#7c8aa8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#7c8aa8', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111a2e', border: '1px solid #22304d', borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#22d3ee" strokeWidth={2} name="Uploads" />
              <Line type="monotone" dataKey="avgTrust" stroke="#2fd480" strokeWidth={2} name="Avg trust" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {modelInfo && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="text-xs text-muted mb-1">Trust score model</div>
            <div className="text-sm font-medium">{modelInfo.trustScoreModel.type}</div>
            <div className="text-xs text-muted mt-1">
              R² {modelInfo.trustScoreModel.r2?.toFixed(3)} · MAE {modelInfo.trustScoreModel.mae?.toFixed(2)} · {modelInfo.trustScoreModel.n_train?.toLocaleString()} samples
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted mb-1">Classification model</div>
            <div className="text-sm font-medium">{modelInfo.classifierModel.type}</div>
            <div className="text-xs text-muted mt-1">
              {(modelInfo.classifierModel.accuracy * 100).toFixed(1)}% test accuracy · {modelInfo.classifierModel.n_train?.toLocaleString()} real-OCR examples
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted mb-1">Forgery detection</div>
            <div className="text-sm font-medium">Rule-based heuristics (metadata + OCR structural)</div>
            <div className="text-xs text-muted mt-1">
              Trained CNN attempted — did not exceed random baseline on synthetic data. Not deployed.
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted mb-1">Duplicate detection</div>
            <div className="text-sm font-medium">Real sentence embeddings (all-MiniLM-L6-v2)</div>
            <div className="text-xs text-muted mt-1">
              Downloads from Hugging Face on first use · text-similarity fallback if unavailable
            </div>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent documents</h2>
          <Link href="/documents" className="text-accent text-sm">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-muted text-sm">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {recent.map((d) => (
              <Link key={d.id} href={`/documents/${d.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-line/30 border border-transparent hover:border-line">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.originalFilename}</div>
                  <div className="text-xs text-muted">{d.documentType || 'Unclassified'} • {new Date(d.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-28 hidden sm:block"><TrustBar score={d.trustScore} /></div>
                  <StatusBadge status={d.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ACCENT_CLASSES = {
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
  accent: 'text-accent',
};

function StatCard({ label, value, accent }) {
  const color = ACCENT_CLASSES[accent] || 'text-white';
  return (
    <div className="card p-4">
      <div className="text-muted text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
