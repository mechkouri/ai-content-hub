'use client';

import { FormEvent, useState } from 'react';
import { ChannelProvider, PROVIDER_LABELS } from '@/lib/api';

export interface ChannelFormValues {
  name: string;
  siteUrl?: string;
  username?: string;
  applicationPassword?: string;
  publishAs?: 'publish' | 'draft';
  pageId?: string;
  accessToken?: string;
  autoPublish?: boolean;
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
  const facebook = provider === 'FACEBOOK';
  const linkedin = provider === 'LINKEDIN';
  const [name, setName] = useState(PROVIDER_LABELS[provider].label);
  const [siteUrl, setSiteUrl] = useState('https://');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [publishAs, setPublishAs] = useState<'publish' | 'draft'>('publish');
  const [pageId, setPageId] = useState('');
  const [token, setToken] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);

  const insecure = wordpress && /^http:\/\//i.test(siteUrl.trim());
  const ready =
    name.trim().length >= 2 &&
    (!wordpress ||
      (/^https:\/\/\S+\.\S+/i.test(siteUrl.trim()) &&
        username.trim().length > 0 &&
        password.trim().length >= 8)) &&
    (!facebook || (/^\d{5,25}$/.test(pageId.trim()) && token.trim().length >= 20)) &&
    (!linkedin || token.trim().length >= 20);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (facebook) {
      onSubmit({
        name: name.trim(),
        pageId: pageId.trim(),
        accessToken: token.trim(),
        autoPublish,
      });
      return;
    }
    if (linkedin) {
      onSubmit({ name: name.trim(), accessToken: token.trim(), autoPublish });
      return;
    }
    onSubmit(
      wordpress
        ? {
            name: name.trim(),
            siteUrl: siteUrl.trim(),
            username: username.trim(),
            applicationPassword: password,
            publishAs,
            autoPublish,
          }
        : { name: name.trim(), autoPublish },
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
      {facebook && (
        <>
          <input
            className="input"
            inputMode="numeric"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            required
            maxLength={25}
            autoComplete="off"
            aria-label="Facebook Page ID"
            placeholder="Page ID (numbers only)"
          />
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            minLength={20}
            maxLength={1000}
            autoComplete="new-password"
            aria-label="Page access token"
            placeholder="Page access token"
          />
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">
              Where do I find the Page ID and token?
            </summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>
                Create an app at developers.facebook.com (type “Business”) and add yourself as an
                admin.
              </li>
              <li>
                In the Graph API Explorer, pick your app, choose “Get Page Access Token” and select
                your Page. Grant pages_manage_posts and pages_read_engagement.
              </li>
              <li>Copy the Page ID (shown in your Page’s About section) and the token.</li>
            </ol>
            <p className="mt-1.5">
              It must be a Page access token, not a personal one. It is checked against the Page,
              then stored encrypted and never shown again.
            </p>
          </details>
        </>
      )}
      {linkedin && (
        <>
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            minLength={20}
            maxLength={2000}
            autoComplete="new-password"
            aria-label="LinkedIn access token"
            placeholder="LinkedIn access token"
          />
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">
              How do I get an access token?
            </summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>Create an app at linkedin.com/developers and link it to a LinkedIn Page.</li>
              <li>
                On the Products tab, request “Share on LinkedIn” and “Sign In with LinkedIn using
                OpenID Connect”.
              </li>
              <li>
                Open the Token Generator tool, tick the scopes openid, profile and w_member_social,
                and generate a token for your account.
              </li>
              <li>Copy the token and paste it here.</li>
            </ol>
            <p className="mt-1.5">
              Posts are published on your personal profile. LinkedIn tokens last 60 days; when it
              expires the channel shows “Needs reconnecting” and you add it again with a new token.
              The token is checked, then stored encrypted and never shown again.
            </p>
          </details>
        </>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={autoPublish}
          onChange={(e) => setAutoPublish(e.target.checked)}
        />
        <span>
          Post scheduled content here automatically
          <span className="block text-xs text-slate-500">
            When approved content is scheduled in the calendar, it is queued for this channel and
            posted at that time. You can change this later.
          </span>
        </span>
      </label>
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !ready}>
          {busy ? (wordpress || facebook || linkedin ? 'Checking…' : 'Adding…') : 'Add channel'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export interface ReconnectValues {
  username?: string;
  applicationPassword?: string;
  accessToken?: string;
}

/** A new login for a channel whose old one stopped working. The site, Page or profile stays the same. */
export function ReconnectForm({
  provider,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  provider: ChannelProvider;
  busy: boolean;
  error: string;
  onSubmit: (v: ReconnectValues) => void;
  onCancel: () => void;
}) {
  const wordpress = provider === 'WORDPRESS';
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const ready =
    secret.trim().length >= (wordpress ? 8 : 20) && (!wordpress || username.trim().length > 0);

  return (
    <form
      className="mt-2 w-full space-y-2 rounded-lg bg-surface p-3"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          wordpress
            ? { username: username.trim(), applicationPassword: secret }
            : { accessToken: secret.trim() },
        );
      }}
    >
      <p className="text-xs text-slate-600">
        {wordpress
          ? 'Create a new application password in WordPress (Users, Profile, Application Passwords) and enter it with your username.'
          : provider === 'LINKEDIN'
            ? 'Generate a new access token in the LinkedIn developer portal (Token Generator, with openid, profile and w_member_social).'
            : 'Generate a new Page access token for the same Page in the Graph API Explorer.'}{' '}
        It must belong to the same{' '}
        {wordpress ? 'site' : provider === 'LINKEDIN' ? 'profile' : 'Page'} as before.
      </p>
      {wordpress && (
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
      )}
      <input
        className="input"
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
        autoComplete="new-password"
        aria-label={wordpress ? 'New application password' : 'New access token'}
        placeholder={wordpress ? 'New application password' : 'New access token'}
      />
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !ready}>
          {busy ? 'Checking…' : 'Reconnect'}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
