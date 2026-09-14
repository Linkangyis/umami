import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';

test.skipIf(!process.env.UMAMI_TEST_DATABASE_URL)(
  'campaign recipes and dictionaries persist, remain scoped, and reuse values in PostgreSQL',
  async () => {
    vi.stubEnv('DATABASE_URL', process.env.UMAMI_TEST_DATABASE_URL as string);
    vi.stubEnv('DATABASE_REPLICA_URL', '');
    const { default: prisma } = await import('@/lib/prisma');
    const queries = await import('./campaigns');
    const { campaignLinkSchema } = await import('@/lib/campaigns');
    const websiteId = randomUUID();
    const otherWebsiteId = randomUUID();
    try {
      for (const id of [websiteId, otherWebsiteId])
        await prisma.client.website.create({
          data: { id, name: 'Campaign fixture', domain: 'campaign-test.example' },
        });
      const preset = await queries.saveCampaignParameter(websiteId, {
        field: 'utmSource',
        value: 'newsletter',
        label: 'Newsletter',
      });
      const reused = await queries.saveCampaignParameter(websiteId, {
        field: 'utmSource',
        value: 'newsletter',
      });
      expect(reused.id).toBe(preset.id);
      expect(reused.label).toBe('Newsletter');
      expect(await queries.getCampaignParameters(websiteId)).toHaveLength(1);
      const link = await queries.createCampaignLink(
        websiteId,
        campaignLinkSchema.parse({
          name: 'Spring',
          destinationUrl: 'https://campaign-test.example/?products/&keep=a%2Bb#details',
          utmSource: preset.value,
          utmCampaign: 'spring sale',
        }),
      );
      expect((await queries.getCampaignLinks(websiteId))[0].url).toBe(
        'https://campaign-test.example/?products/&keep=a%2Bb&utm_source=newsletter&utm_campaign=spring%20sale#details',
      );
      const renamed = await queries.updateCampaignLink(websiteId, link.id, { name: 'Renamed' });
      expect(renamed?.utmCampaign).toBe('spring sale');
      expect(renamed?.url).toBe(link.url);
      expect(
        await queries.updateCampaignLink(otherWebsiteId, link.id, { name: 'Stolen' }),
      ).toBeNull();
      expect((await queries.deleteCampaignLink(otherWebsiteId, link.id)).count).toBe(0);
      expect(
        await queries.updateCampaignParameter(otherWebsiteId, preset.id, { value: 'stolen' }),
      ).toBeNull();
      await queries.updateCampaignParameter(websiteId, preset.id, { value: 'email' });
      expect((await queries.getCampaignLinks(websiteId))[0].utmSource).toBe('newsletter');
      await queries.deleteCampaignParameter(websiteId, preset.id);
      expect(await queries.getCampaignParameters(websiteId)).toHaveLength(0);
      expect((await queries.getCampaignLinks(websiteId))[0].url).toBe(link.url);
      await queries.deleteCampaignLink(websiteId, link.id);
      expect(await queries.getCampaignLinks(websiteId)).toHaveLength(0);
    } finally {
      await prisma.client.campaignLink.deleteMany({
        where: { websiteId: { in: [websiteId, otherWebsiteId] } },
      });
      await prisma.client.campaignParameter.deleteMany({
        where: { websiteId: { in: [websiteId, otherWebsiteId] } },
      });
      await prisma.client.website.deleteMany({
        where: { id: { in: [websiteId, otherWebsiteId] } },
      });
      await prisma.client.$disconnect();
      vi.unstubAllEnvs();
    }
  },
);
