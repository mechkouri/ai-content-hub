'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace(safeNext());
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        className="input"
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input"
        type="password"
        placeholder="Password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !isSupabaseConfigured}>
        {busy ? 'Signing in…' : 'Log in'}
      </button>
      <p className="pt-2 text-center text-sm text-slate-500">
        New here?{' '}
        <Link href="/signup" className="font-semibold text-brand">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Log in" subtitle="Welcome back to AI Content Hub.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
