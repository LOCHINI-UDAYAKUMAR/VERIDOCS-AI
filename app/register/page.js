'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

const ROLES = [
  { value: 'organization', label: 'Organization — upload & verify documents' },
  { value: 'auditor', label: 'Auditor — review flagged documents' },
  { value: 'verifier', label: 'Public Verifier — check documents via QR' },
  // NOTE: 'admin' is intentionally not offered here. Public self-registration
  // as admin was a critical privilege-escalation bug — admin accounts are
  // now created only via `npm run seed` or by an existing admin through
  // POST /api/users/create.
];

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'organization' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      login(data.token, data.user);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent mx-auto flex items-center justify-center text-xl font-bold mb-3">V</div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted text-sm mt-1">Join VeriDocs AI</p>
        </div>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {error && <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Full name</label>
            <input className="input" required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Jordan Lee" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@organization.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => update('role', e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-muted mt-4">
          Already registered? <Link href="/login" className="text-accent">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
