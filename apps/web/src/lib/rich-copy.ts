interface CopyEnv {
  clipboard: {
    write?: (items: any[]) => Promise<void>;
    writeText: (text: string) => Promise<void>;
  };
  /** ClipboardItem, where the browser has it. */
  Item?: new (parts: Record<string, Promise<Blob>>) => unknown;
}

const browser = (): CopyEnv => ({
  clipboard: navigator.clipboard as unknown as CopyEnv['clipboard'],
  Item:
    typeof ClipboardItem === 'undefined'
      ? undefined
      : (ClipboardItem as unknown as CopyEnv['Item']),
});

/**
 * Copies formatted text, so headings and links survive pasting into a website editor. The HTML may still be on
 * its way: the clipboard is asked right away, because some browsers only allow that during the click.
 */
export async function copyRich(html: Promise<string>, text: string, env: CopyEnv = browser()) {
  const { clipboard, Item } = env;
  if (Item && clipboard.write) {
    const blob = (value: string, type: string) => new Blob([value], { type });
    const formatted = html.then((h) => blob(h, 'text/html'));
    const item = new Item({
      'text/html': formatted,
      'text/plain': Promise.resolve(blob(text, 'text/plain')),
    });
    // waiting for the text as well keeps the original reason when preparing it fails
    await Promise.all([formatted, clipboard.write([item])]);
    return;
  }
  await html;
  await clipboard.writeText(text);
}
