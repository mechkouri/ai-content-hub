'use client';

import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api';

/** Loads a protected image with the auth header (plain <img> cannot send Bearer tokens). */
export function AuthImage({
  orgId,
  assetId,
  alt,
  className = '',
}: {
  orgId: string;
  assetId: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    apiBlob(`/organizations/${orgId}/media/${assetId}/content`)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orgId, assetId]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}
      >
        Unavailable
      </div>
    );
  }
  if (!url) return <div className={`animate-pulse bg-slate-100 ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
