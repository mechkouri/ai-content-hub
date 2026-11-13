'use client';

import { useCallback, useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { apiFetch, ContentImage, ContentKind, MediaAsset } from '@/lib/api';
import { describeError } from '@/lib/errors';

const LIMITS: Record<ContentKind, number> = {
  ARTICLE: 1,
  INSTAGRAM: 10,
  FACEBOOK: 10,
  LINKEDIN: 9,
};

/** Pictures attached to a piece of content: pick from the media library, or draw one from the post's own idea. */
export function ImagesPanel({
  orgId,
  contentId,
  kind,
  hasIdea,
  canEdit,
  canDraw,
  onChanged,
}: {
  orgId: string;
  contentId: string;
  kind: ContentKind;
  /** Whether the writer produced an image idea to draw from. */
  hasIdea: boolean;
  canEdit: boolean;
  canDraw: boolean;
  /** Called after any change: attaching or removing a picture can void an approval. */
  onChanged: () => void | Promise<void>;
}) {
  const base = `/organizations/${orgId}/content/${contentId}/images`;
  const max = LIMITS[kind];
  const [images, setImages] = useState<ContentImage[] | null>(null);
  const [library, setLibrary] = useState<MediaAsset[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setImages(await apiFetch<ContentImage[]>(base));
    } catch (e) {
      setError(describeError(e));
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function change(fn: () => Promise<ContentImage[]>) {
    setBusy(true);
    setError('');
    try {
      setImages(await fn());
      await onChanged();
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openLibrary() {
    setPicking(true);
    try {
      setLibrary(await apiFetch<MediaAsset[]>(`/organizations/${orgId}/media`));
    } catch (e) {
      setError(describeError(e));
    }
  }

  const full = (images?.length ?? 0) >= max;
  const attachedIds = new Set((images ?? []).map((i) => i.assetId));
  const choices = (library ?? []).filter((a) => !attachedIds.has(a.id));

  return (
    <div className="space-y-3">
      {images === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-xs text-muted">
          No pictures yet.{' '}
          {kind === 'INSTAGRAM'
            ? 'Instagram posts need at least one.'
            : 'A picture helps a post stand out.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {images.map((i) => (
            <PictureRow
              key={i.id}
              orgId={orgId}
              image={i}
              canEdit={canEdit}
              busy={busy}
              onRemove={() =>
                change(() => apiFetch<ContentImage[]>(`${base}/${i.assetId}`, { method: 'DELETE' }))
              }
              onDescribe={(altText) =>
                change(() =>
                  apiFetch<ContentImage[]>(`${base}/${i.assetId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ altText }),
                  }),
                )
              }
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2">
          {full ? (
            <p className="text-[11px] text-slate-400">
              {max === 1
                ? 'This content takes one picture. Remove it to use another.'
                : `The limit of ${max} pictures is reached.`}
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  className="btn-ghost flex-1"
                  onClick={openLibrary}
                  disabled={busy || picking}
                >
                  From library
                </button>
                {canDraw && (
                  <button
                    className="btn-ghost flex-1"
                    onClick={() => setDrawing((v) => !v)}
                    disabled={busy}
                  >
                    Draw with AI
                  </button>
                )}
              </div>
              {drawing && (
                <div className="space-y-2 rounded-lg bg-surface p-2.5">
                  <textarea
                    className="input min-h-[60px]"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    maxLength={500}
                    placeholder={
                      hasIdea
                        ? 'Leave empty to use the picture idea written for this post'
                        : 'Describe the picture you want'
                    }
                    aria-label="Picture description"
                  />
                  <button
                    className="btn-primary w-full"
                    disabled={busy || (!hasIdea && prompt.trim().length < 3)}
                    onClick={async () => {
                      const ok = await change(() =>
                        apiFetch<ContentImage[]>(`${base}/generate`, {
                          method: 'POST',
                          body: JSON.stringify(prompt.trim() ? { prompt: prompt.trim() } : {}),
                        }),
                      );
                      if (ok) {
                        setPrompt('');
                        setDrawing(false);
                      }
                    }}
                  >
                    {busy ? 'Drawing… this can take a few seconds' : 'Draw and attach'}
                  </button>
                  <p className="text-[11px] text-slate-400">Uses one of your daily AI images.</p>
                </div>
              )}
            </>
          )}

          {picking && (
            <div className="rounded-lg border border-line p-2.5">
              {library === null ? (
                <p className="text-xs text-muted">Loading your library…</p>
              ) : choices.length === 0 ? (
                <p className="text-xs text-muted">
                  Nothing left to add. Upload pictures on the Media library page.
                </p>
              ) : (
                <ul className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto">
                  {choices.map((a) => (
                    <li key={a.id}>
                      <button
                        className="block w-full overflow-hidden rounded-md ring-brand hover:ring-2"
                        disabled={busy || full}
                        title={a.filename}
                        onClick={async () => {
                          const ok = await change(() =>
                            apiFetch<ContentImage[]>(base, {
                              method: 'POST',
                              body: JSON.stringify({ assetId: a.id }),
                            }),
                          );
                          if (ok) setPicking(false);
                        }}
                      >
                        <AuthImage
                          orgId={orgId}
                          assetId={a.id}
                          alt={a.filename}
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="mt-2 text-xs font-semibold text-slate-500"
                onClick={() => setPicking(false)}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger-ink">{error}</p>}
      <p className="text-[11px] text-slate-400">
        Changing the pictures of approved content sends it back to draft.
      </p>
    </div>
  );
}

/** One attached picture with its description, which is read out for people who cannot see it and sent with the post. */
function PictureRow({
  orgId,
  image,
  canEdit,
  busy,
  onRemove,
  onDescribe,
}: {
  orgId: string;
  image: ContentImage;
  canEdit: boolean;
  busy: boolean;
  onRemove: () => void;
  onDescribe: (altText: string) => void;
}) {
  const [alt, setAlt] = useState(image.altText ?? '');
  // Follow the server (e.g. after another change), but never overwrite what is being typed.
  useEffect(() => setAlt(image.altText ?? ''), [image.altText]);
  const changed = alt.trim() !== (image.altText ?? '');

  return (
    <li className="flex gap-2.5">
      <AuthImage
        orgId={orgId}
        assetId={image.assetId}
        alt={image.altText ?? image.asset.filename}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <textarea
          className="input min-h-[44px] text-xs"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          onBlur={() => changed && onDescribe(alt)}
          maxLength={500}
          disabled={!canEdit || busy}
          placeholder="Describe the picture for people who cannot see it"
          aria-label={`Description of ${image.asset.filename}`}
          dir="auto"
        />
        <div className="flex items-center justify-between text-[11px]">
          <span className={image.altText ? 'text-ok-ink' : 'text-amber-700'}>
            {image.altText ? 'Description saved' : 'No description yet'}
          </span>
          {canEdit && (
            <button
              className="font-semibold text-slate-500 hover:text-danger"
              onClick={onRemove}
              disabled={busy}
              aria-label={`Remove ${image.asset.filename}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
