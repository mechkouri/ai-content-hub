'use client';

import { MessageCircle, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { whatsappUrl } from '@/lib/share';

/**
 * Send a post without connecting any account: open it in WhatsApp, or (on phones) hand it to the share menu.
 * Nothing is sent by the platform; the person chooses where it goes.
 */
export function SharePost({ text }: { text: () => string }) {
  const t = useT();
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => window.open(whatsappUrl(text()), '_blank', 'noopener,noreferrer')}
      >
        <MessageCircle size={15} aria-hidden /> {t('share.whatsapp')}
      </button>
      {canShare && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            // closing the share menu without choosing is not an error
            navigator.share({ text: text() }).catch(() => undefined);
          }}
        >
          <Share2 size={15} aria-hidden /> {t('share.more')}
        </button>
      )}
    </>
  );
}
