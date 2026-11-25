import { UnsafeUrlError } from '../sources/safe-fetch';
import { StrategyService } from './strategy.service';

const answer = {
  summary: 's',
  clusters: [{ name: 'c', intent: 'local', keywords: ['bakery casablanca'] }],
  articles: [{ title: 'Best bakery', keyword: 'best bakery', intent: 'local', priority: 1 }],
  quickWins: [],
};

function make(fetch: () => Promise<any>) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Atlas' }) },
    contentPiece: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const ai = {
    generateJson: jest.fn(async (_ctx: unknown, o: any) => ({
      data: o.schema.parse(answer),
      model: 'fake',
      provider: 'fake',
    })),
  };
  return { service: new StrategyService(prisma as any, { fetch } as any, ai as any), prisma, ai };
}

describe('StrategyService', () => {
  const input = { business: 'A bakery in Casablanca', language: 'en' as const };

  it('only reads this organization and uses the website as context', async () => {
    const { service, prisma, ai } = make(async () => ({
      finalUrl: 'https://a.example/',
      contentType: 'text/html',
      body: '<html><head><title>Atlas Bakery</title></head><body><h1>Bread</h1></body></html>',
    }));
    const out = await service.plan('org1', 'u1', { ...input, website: 'https://a.example' });
    expect(out.site?.url).toBe('https://a.example/');
    expect(out.siteError).toBeNull();
    expect(prisma.contentPiece.findMany.mock.calls[0][0].where.organizationId).toBe('org1');
    expect(ai.generateJson.mock.calls[0][1].prompt).toContain('Atlas Bakery');
  });

  it('still makes a plan when the website cannot be checked', async () => {
    const { service } = make(async () => {
      throw new UnsafeUrlError('private');
    });
    const out = await service.plan('org1', 'u1', { ...input, website: 'http://localhost' });
    expect(out.site).toBeNull();
    expect(out.siteError).toMatch(/not allowed/);
    expect(out.articles).toHaveLength(1);
  });
});
