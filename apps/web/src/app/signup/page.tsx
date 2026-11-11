'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const name = fullName.trim();
    const { data, error } = await supabase().auth.signUp({
      email,
      password,
      // Stored with the account (user metadata) and used for the greeting.
      options: name ? { data: { full_name: name } } : undefined,
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) router.replace('/onboarding');
    else setNotice('Check your email to confirm your account, then log in.');
  }

  return (
    <AuthCard title="Create your account" subtitle="Start turning one input into a full campaign.">
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="input"
          type="text"
          placeholder="Your name (optional)"
          autoComplete="name"
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
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
          placeholder="Password (min 8 characters)"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        <button className="btn-primary w-full" disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Creating…' : 'Sign up'}
        </button>
        <p className="pt-2 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
