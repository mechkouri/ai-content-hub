'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { useT } from '@/lib/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const t = useT();
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
    else setNotice(t('auth.checkEmail'));
  }

  return (
    <AuthCard title={t('auth.signup.title')} subtitle={t('auth.signup.subtitle')}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="input"
          type="text"
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
          maxLength={80}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          className="input"
          type="email"
          placeholder={t('auth.email')}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder={t('auth.passwordMin')}
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
        <button className="btn-primary w-full" disabled={busy || !isSupabaseConfigured}>
          {busy ? t('auth.creating') : t('auth.signup.button')}
        </button>
        <p className="pt-2 text-center text-sm text-slate-500">
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="font-semibold text-brand">
            {t('auth.logIn')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
