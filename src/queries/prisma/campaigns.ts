import type { Prisma } from '@/generated/prisma/client';
import {
  buildCampaignUrl,
  type CampaignLinkInput,
  type CampaignParameterInput,
  campaignLinkSchema,
  MAX_CAMPAIGN_LINKS,
  MAX_CAMPAIGN_PARAMETERS,
} from '@/lib/campaigns';
import { uuid } from '@/lib/crypto';
import prisma, { getSchema } from '@/lib/prisma';

export class CampaignLimitError extends Error {}
export class CampaignDuplicateError extends Error {}
export class CampaignWebsiteMissingError extends Error {}

const transaction = prisma.transaction as <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>;

async function lockWebsite(tx: Prisma.TransactionClient, websiteId: string) {
  const schema = getSchema();
  const table = schema ? `"${schema.replace(/"/g, '""')}"."website"` : '"website"';
  const rows = await tx.$queryRawUnsafe<{ website_id: string }[]>(
    `select website_id from ${table} where website_id = $1::uuid and deleted_at is null for update`,
    websiteId,
  );
  if (!rows.length) throw new CampaignWebsiteMissingError('Website was not found.');
}

export function getCampaignLinks(websiteId: string) {
  return prisma.client.campaignLink.findMany({
    where: { websiteId, website: { deletedAt: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
}

export function createCampaignLink(websiteId: string, input: CampaignLinkInput) {
  return transaction(async tx => {
    await lockWebsite(tx, websiteId);
    if ((await tx.campaignLink.count({ where: { websiteId } })) >= MAX_CAMPAIGN_LINKS)
      throw new CampaignLimitError('Campaign link limit reached.');
    const data = campaignLinkSchema.parse(input);
    return tx.campaignLink.create({
      data: { ...data, id: uuid(), websiteId, url: buildCampaignUrl(data.destinationUrl, data) },
    });
  });
}

export function updateCampaignLink(
  websiteId: string,
  id: string,
  input: Partial<CampaignLinkInput>,
) {
  return transaction(async tx => {
    await lockWebsite(tx, websiteId);
    const current = await tx.campaignLink.findFirst({ where: { id, websiteId } });
    if (!current) return null;
    const { name, destinationUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } =
      current;
    const data = campaignLinkSchema.parse({
      name,
      destinationUrl,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      ...input,
    });
    return tx.campaignLink.update({
      where: { id },
      data: { ...data, url: buildCampaignUrl(data.destinationUrl, data) },
    });
  });
}

export function deleteCampaignLink(websiteId: string, id: string) {
  return prisma.client.campaignLink.deleteMany({ where: { id, websiteId } });
}

export function getCampaignParameters(websiteId: string) {
  return prisma.client.campaignParameter.findMany({
    where: { websiteId, website: { deletedAt: null } },
    orderBy: [{ field: 'asc' }, { value: 'asc' }],
  });
}

export function saveCampaignParameter(websiteId: string, input: CampaignParameterInput) {
  return transaction(async tx => {
    await lockWebsite(tx, websiteId);
    const existing = await tx.campaignParameter.findUnique({
      where: { websiteId_field_value: { websiteId, field: input.field, value: input.value } },
    });
    if (existing) {
      return input.label === undefined
        ? existing
        : tx.campaignParameter.update({ where: { id: existing.id }, data: { label: input.label } });
    }
    if ((await tx.campaignParameter.count({ where: { websiteId } })) >= MAX_CAMPAIGN_PARAMETERS)
      throw new CampaignLimitError('Reusable parameter limit reached.');
    return tx.campaignParameter.create({
      data: { id: uuid(), websiteId, ...input, label: input.label || '' },
    });
  });
}

export function updateCampaignParameter(
  websiteId: string,
  id: string,
  input: Partial<CampaignParameterInput>,
) {
  return transaction(async tx => {
    await lockWebsite(tx, websiteId);
    const current = await tx.campaignParameter.findFirst({ where: { id, websiteId } });
    if (!current) return null;
    const field = input.field ?? current.field;
    const value = input.value ?? current.value;
    const duplicate = await tx.campaignParameter.findFirst({
      where: { websiteId, field, value, id: { not: id } },
    });
    if (duplicate) throw new CampaignDuplicateError('That reusable parameter already exists.');
    return tx.campaignParameter.update({ where: { id }, data: input });
  });
}

export function deleteCampaignParameter(websiteId: string, id: string) {
  return prisma.client.campaignParameter.deleteMany({ where: { id, websiteId } });
}
