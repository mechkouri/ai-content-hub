export function StatusBadge({ status }: { status: string }) {
  return status === 'NEEDS_REVIEW' ? (
    <span className="chip-warn">Needs review</span>
  ) : (
    <span className="chip-ok">Draft</span>
  );
}
