import { FileText, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';

const STEPS = [
  {
    icon: FileText,
    title: '1. Add one input',
    text: 'Paste text, or import a PDF, a Word file or a web page.',
  },
  {
    icon: ShieldCheck,
    title: '2. Verify the facts',
    text: 'Every date, number and link is checked against your source, so nothing is invented.',
  },
  {
    icon: PenLine,
    title: '3. Get your content',
    text: 'An SEO article plus Instagram, Facebook and LinkedIn posts in French, Arabic or English.',
  },
];

/** What visitors see on the dashboard before logging in. */
export function GuestHome() {
  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-8 lg:p-10">
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-1 max-w-2xl font-display text-3xl font-semibold leading-tight">
          One input, a complete digital campaign.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted">
          AI Content Hub turns a single document into verified, on-brand articles and social posts.
          Look around freely; log in when you want to create something.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary">
            <Sparkles size={16} aria-hidden /> Create a free account
          </Link>
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="How it works">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon size={20} aria-hidden />
            </span>
            <h2 className="mt-3 font-display text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
