'use client';

import { FormEvent, useState } from 'react';
import { ChannelProvider, PROVIDER_LABELS } from '@/lib/api';

export interface ChannelFormValues {
  name: string;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  publishAs?: 'publish' | 'draft';
}

/** Connect form. Which fields appear depends on the provider; the server checks the login before saving. */
export function ChannelForm({
  provider,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  provider: ChannelProvider;
  busy: boolean;
  error: string;
  onSubmit: (v: ChannelFormValues) => void;
  onCancel: () => void;
}) {
  const wordpress = provider === 'WORDPRESS';
  const [name, setName] = useState(PROVIDER_LABELS[provider].label);
  const [siteUrl, setSiteUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [publishAs, setPublishAs] = useState<'publish' | 'draft'>('publish');

  const insecure = wordpress && /^http:\/\//i.test(siteUrl.trim());
  const ready =
    name.trim().length >= 2 &&
    (!wordpress ||
      (/^https:\/\/\S+\.\S+/i.test(siteUrl.trim()) &&
        username.trim().length > 0 &&
        password.trim().length >= 8));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(
      wordpress
        ? {
            name: name.trim(),
            siteUrl: siteUrl.trim(),
            username: username.trim(),
            applicationPassword: password,
            publishAs,
          }
        : { name: name.trim() },
    );
  }

  return (
    <form className="mt-2 space-y-2" onSubmit={submit} autoComplete="off">
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        minLength={2}
        maxLength={80}
        required
        aria-label="Channel name"
        placeholder="Channel name"
      />
      {wordpress && (
        <>
          <input
            className="input"
            type="url"
            inputMode="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            required
            aria-label="Website address"
            placeholder="https://your-site.com"
          />
          {insecure && (
            <p className="text-xs text-danger-ink">
              Use the https address. The login would travel unprotected over http.
            </p>
          )}
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={100}
            autoComplete="off"
            aria-label="WordPress username"
            placeholder="WordPress username (not your email)"
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
            aria-label="Application password"
            placeholder="Application password"
          />
          <fieldset className="space-y-1 text-sm">
            <legend className="text-xs font-semibold text-slate-600">New posts are</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="publishAs"
                checked={publishAs === 'publish'}
                onChange={() => setPublishAs('publish')}
              />
              Published right away
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="publishAs"
                checked={publishAs === 'draft'}
                onChange={() => setPublishAs('draft')}
              />
              Saved as drafts for you to review on the site
            </label>
          </fieldset>
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">
              How do I get an application password?
            </summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>Sign in to your WordPress dashboard.</li>
              <li>Open Users, then Profile, and scroll to “Application Passwords”.</li>
              <li>
                Type a name such as “AI Content Hub” and press “Add New Application Password”.
              </li>
              <li>Copy the password WordPress shows once and paste it here.</li>
            </ol>
            <p className="mt-1.5">
              The user needs the Editor or Administrator role to publish. The password is checked
              against your site, then stored encrypted and never shown again. You can revoke it in
              WordPress at any time.
            </p>
          </details>
        </>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !ready}>
          {busy ? (wordpress ? 'Checking the site…' : 'Adding…') : 'Add channel'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
