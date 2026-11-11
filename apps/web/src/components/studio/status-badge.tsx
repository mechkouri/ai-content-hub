export function StatusBadge({ status }: { status: string }) {
  return status === 'NEEDS_REVIEW' ? (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      Needs review
    </span>
  ) : (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
      Draft
    </span>
  );
}
