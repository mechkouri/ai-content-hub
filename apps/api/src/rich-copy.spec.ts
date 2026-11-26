export {};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const lib = require('../../web/src/lib/rich-copy') as {
  copyRich: (html: Promise<string>, text: string, env: Record<string, unknown>) => Promise<void>;
};

class Item {
  constructor(public parts: Record<string, Promise<Blob>>) {}
}

describe('copyRich', () => {
  it('puts both formatted and plain text on the clipboard', async () => {
    const written: Item[] = [];
    await lib.copyRich(Promise.resolve('<h2>Titre é</h2>'), 'Titre é', {
      Item,
      clipboard: { write: async (items: Item[]) => void written.push(...items) },
    });
    const parts = written[0].parts;
    expect(await (await parts['text/html']).text()).toBe('<h2>Titre é</h2>');
    expect(await (await parts['text/plain']).text()).toBe('Titre é');
  });

  it('copies plain text where formatted copy does not exist', async () => {
    const writeText = jest.fn(async () => undefined);
    await lib.copyRich(Promise.resolve('<p>x</p>'), 'x', { clipboard: { writeText } });
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('fails when the formatted text cannot be prepared', async () => {
    const writeText = jest.fn(async () => undefined);
    await expect(
      lib.copyRich(Promise.reject(new Error('bad draft')), 'x', { clipboard: { writeText } }),
    ).rejects.toThrow('bad draft');
    expect(writeText).not.toHaveBeenCalled();
  });
});
