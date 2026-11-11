import { Lock } from 'lucide-react';
import Link from 'next/link';

/** Shown instead of a page that needs an account. Visitors can look around; creating or using features needs a login. */
export function AuthGate({ feature, next }: { feature: string; next: string }) {
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Lock size={22} aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-semibold">Log in to use {feature}</h1>
      <p className="mt-1 text-sm text-muted">
        You can explore the dashboard without an account. Creating and managing content needs one,
        so your work is saved and private to your team.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href={`/login${q}`} className="btn-primary">
          Log in
        </Link>
        <Link href="/signup" className="btn-ghost">
          Create account
        </Link>
      </div>
    </div>
  );
}
