/**
 * Whether a click on a link would close the current page inside the app. The browser warns about unsaved work
 * only when the whole site is left, not when the app moves between its own pages.
 */
export function leavesPage(
  click: { button: number; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  link: { href: string; target: string; download: boolean },
  here: string,
): boolean {
  if (click.button !== 0 || click.ctrlKey || click.metaKey || click.shiftKey) return false;
  if (link.download || (link.target && link.target !== '_self')) return false;
  const from = new URL(here);
  const to = new URL(link.href, here);
  if (to.origin !== from.origin) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}
