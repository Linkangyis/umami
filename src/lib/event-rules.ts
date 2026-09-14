import { z } from 'zod';
import { getRecorderPagePath } from '@/lib/recorder';
import type { PublicEventRule } from '@/types/eventRule';

export const MAX_EVENT_RULES = 100;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Explicitly reject control characters in stored rule text.
const noControlCharacters = /^[^\u0000-\u001f\u007f]*$/;

export const eventRuleFields = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[^=+\-@]/)
    .regex(noControlCharacters),
  selector: z.string().trim().min(1).max(500).regex(noControlCharacters),
  urlPath: z
    .string()
    .trim()
    .min(1)
    .max(2183)
    .refine(value => !!getRecorderPagePath(value), {
      message: 'Use an HTTP URL or a page path, including its query or hash route.',
    })
    .transform(value => getRecorderPagePath(value) as string)
    .pipe(z.string().max(2183)),
  matchType: z.enum(['exact', 'prefix', 'all']),
  eventType: z.enum(['click', 'submit']),
  isEnabled: z.boolean(),
};

export const createEventRuleSchema = z.object({
  ...eventRuleFields,
  urlPath: eventRuleFields.urlPath.default('/'),
  matchType: eventRuleFields.matchType.default('exact'),
  eventType: eventRuleFields.eventType.default('click'),
  isEnabled: eventRuleFields.isEnabled.default(true),
});

export const updateEventRuleSchema = z
  .object(eventRuleFields)
  .partial()
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one rule field is required.',
  });

export function matchesEventRule(
  rule: Pick<PublicEventRule, 'urlPath' | 'matchType'>,
  url: string,
) {
  const page = getRecorderPagePath(url);
  if (!page) return false;
  if (rule.matchType === 'all') return true;
  return rule.matchType === 'prefix' ? page.startsWith(rule.urlPath) : page === rule.urlPath;
}
