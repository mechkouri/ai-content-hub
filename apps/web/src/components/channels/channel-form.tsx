'use client';

import { FormEvent, useState } from 'react';
import { ChannelProvider } from '@/lib/api';
import { useT } from '@/lib/i18n';

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
  const t = useT();
  const wordpress = provider === 'WORDPRESS';
  const facebook = provider === 'FACEBOOK';
  const linkedin = provider === 'LINKEDIN';
  const [name, setName] = useState(t(`provider.${provider}`));
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
        aria-label={t('form.channelName')}
        placeholder={t('form.channelName')}
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
            aria-label={t('form.siteAddress')}
            placeholder="https://your-site.com"
          />
          {insecure && <p className="text-xs text-danger-ink">{t('form.useHttps')}</p>}
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={100}
            autoComplete="off"
            aria-label={t('form.wpUser')}
            placeholder={t('form.wpUserPh')}
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
            aria-label={t('form.appPassword')}
            placeholder={t('form.appPassword')}
          />
          <fieldset className="space-y-1 text-sm">
            <legend className="text-xs font-semibold text-slate-600">
              {t('form.newPostsAre')}
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="publishAs"
                checked={publishAs === 'publish'}
                onChange={() => setPublishAs('publish')}
              />
              {t('form.publishNow')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="publishAs"
                checked={publishAs === 'draft'}
                onChange={() => setPublishAs('draft')}
              />
              {t('form.saveDrafts')}
            </label>
          </fieldset>
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">{t('form.wpHelp')}</summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>{t('form.wp1')}</li>
              <li>{t('form.wp2')}</li>
              <li>{t('form.wp3')}</li>
              <li>{t('form.wp4')}</li>
            </ol>
            <p className="mt-1.5">{t('form.wpNote')}</p>
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
            aria-label={t('form.fbPageId')}
            placeholder={t('form.fbPageIdPh')}
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
            aria-label={t('form.fbToken')}
            placeholder={t('form.fbToken')}
          />
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">{t('form.fbHelp')}</summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>{t('form.fb1')}</li>
              <li>{t('form.fb2')}</li>
              <li>{t('form.fb3')}</li>
            </ol>
            <p className="mt-1.5">{t('form.fbNote')}</p>
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
            aria-label={t('form.liToken')}
            placeholder={t('form.liToken')}
          />
          <details className="rounded-lg bg-surface p-2.5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">{t('form.liHelp')}</summary>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              <li>{t('form.li1')}</li>
              <li>{t('form.li2')}</li>
              <li>{t('form.li3')}</li>
              <li>{t('form.li4')}</li>
            </ol>
            <p className="mt-1.5">{t('form.liNote')}</p>
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
          {t('form.auto')}
          <span className="block text-xs text-slate-500">{t('form.autoHint')}</span>
        </span>
      </label>
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !ready}>
          {busy
            ? wordpress || facebook || linkedin
              ? t('form.checking')
              : t('form.adding')
            : t('form.addChannel')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
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
  const t = useT();
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
        {wordpress ? t('form.rcWp') : provider === 'LINKEDIN' ? t('form.rcLi') : t('form.rcFb')}{' '}
        {wordpress
          ? t('form.sameWp')
          : provider === 'LINKEDIN'
            ? t('form.sameLi')
            : t('form.sameFb')}
      </p>
      {wordpress && (
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={100}
          autoComplete="off"
          aria-label={t('form.wpUser')}
          placeholder={t('form.wpUserPh')}
        />
      )}
      <input
        className="input"
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        required
        autoComplete="new-password"
        aria-label={wordpress ? t('form.newAppPassword') : t('form.newToken')}
        placeholder={wordpress ? t('form.newAppPassword') : t('form.newToken')}
      />
      {error && (
        <p className="rounded-lg border border-red-200 bg-danger-soft p-2.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || !ready}>
          {busy ? t('form.checking') : t('ch.reconnect')}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
