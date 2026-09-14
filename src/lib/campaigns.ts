import { z } from 'zod';

export const CAMPAIGN_FIELDS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
] as const;
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];
export type CampaignValues = Record<CampaignField, string>;
export const CAMPAIGN_QUERY_KEYS: Record<CampaignField, string> = {
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmTerm: 'utm_term',
  utmContent: 'utm_content',
};
export const MAX_CAMPAIGN_LINKS = 500;
export const MAX_CAMPAIGN_PARAMETERS = 500;
export const MAX_CAMPAIGN_URL_LENGTH = 2183;

// biome-ignore lint/suspicious/noControlCharactersInRegex: Stored labels and URL parameters must not contain control characters.
const controlFree = /^[^\u0000-\u001f\u007f]*$/;
const parameterValue = z.string().trim().max(200).regex(controlFree);
const linkName = z.string().trim().min(1).max(100).regex(controlFree);

export class CampaignValidationError extends Error {
  constructor(
    public code: 'invalid-url' | 'source-required' | 'url-too-long' | 'invalid-parameter',
  ) {
    super(code);
  }
}

export function campaignDestination(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CampaignValidationError('invalid-url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new CampaignValidationError('invalid-url');
  if (url.href.length > MAX_CAMPAIGN_URL_LENGTH) throw new CampaignValidationError('url-too-long');
  return url;
}

export function buildCampaignUrl(destinationUrl: string, values: Partial<CampaignValues>) {
  const url = campaignDestination(destinationUrl);
  if (!values.utmSource?.trim()) throw new CampaignValidationError('source-required');
  const managed = new Set(Object.values(CAMPAIGN_QUERY_KEYS));
  // Keep raw query segments: URLSearchParams would rewrite ?products/ as ?products%2F=.
  const parts = url.search
    ? url.search
        .slice(1)
        .split('&')
        .filter(part => {
          try {
            return !managed.has(
              decodeURIComponent(part.split('=', 1)[0].replace(/\+/g, ' ')).toLowerCase(),
            );
          } catch {
            return true;
          }
        })
    : [];
  for (const field of CAMPAIGN_FIELDS) {
    const value = values[field]?.trim() || '';
    if (!parameterValue.safeParse(value).success)
      throw new CampaignValidationError('invalid-parameter');
    if (value) parts.push(`${CAMPAIGN_QUERY_KEYS[field]}=${encodeURIComponent(value)}`);
  }
  url.search = parts.join('&');
  if (url.href.length > MAX_CAMPAIGN_URL_LENGTH) throw new CampaignValidationError('url-too-long');
  return url.href;
}

const destinationField = z
  .string()
  .trim()
  .min(1)
  .max(MAX_CAMPAIGN_URL_LENGTH)
  .refine(value => {
    try {
      campaignDestination(value);
      return true;
    } catch {
      return false;
    }
  }, 'Use an HTTP or HTTPS URL without credentials.');

export const campaignLinkSchema = z
  .object({
    name: linkName,
    destinationUrl: destinationField,
    utmSource: parameterValue.min(1),
    utmMedium: parameterValue.default(''),
    utmCampaign: parameterValue.default(''),
    utmTerm: parameterValue.default(''),
    utmContent: parameterValue.default(''),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      buildCampaignUrl(value.destinationUrl, value);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['destinationUrl'],
        message: (error as Error).message,
      });
    }
  });

export const campaignLinkUpdateSchema = z
  .object({
    name: linkName.optional(),
    destinationUrl: destinationField.optional(),
    utmSource: parameterValue.min(1).optional(),
    utmMedium: parameterValue.optional(),
    utmCampaign: parameterValue.optional(),
    utmTerm: parameterValue.optional(),
    utmContent: parameterValue.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one link field is required.');

export const campaignParameterSchema = z
  .object({
    field: z.enum(CAMPAIGN_FIELDS),
    value: parameterValue.min(1),
    label: z.string().trim().max(100).regex(controlFree).optional(),
  })
  .strict();
export const campaignParameterUpdateSchema = campaignParameterSchema
  .partial()
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one parameter field is required.');

export type CampaignLinkInput = z.output<typeof campaignLinkSchema>;
export type CampaignParameterInput = z.output<typeof campaignParameterSchema>;

export function campaignAnalysisUrl(websiteId: string, values: Partial<CampaignValues>) {
  const query = new URLSearchParams();
  for (const field of CAMPAIGN_FIELDS) {
    if (values[field]) query.set(field, `eq.${values[field]}`);
  }
  return `/websites/${websiteId}/utm${query.size ? `?${query}` : ''}`;
}
