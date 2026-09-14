import { getRecorderPagePath } from './page-path';

export interface TrackingRule {
  id: string;
  name: string;
  selector: string;
  urlPath: string;
  matchType: 'exact' | 'prefix' | 'all';
  eventType: 'click' | 'submit';
}

export function getMatchingRules(
  rules: TrackingRule[],
  element: Element,
  eventType: 'click' | 'submit',
  href: string,
): TrackingRule[] {
  const path = getRecorderPagePath(href);
  if (!path) return [];
  return rules.filter(rule => {
    if (rule.eventType !== eventType || !rule.name || !rule.selector) return false;
    const scope = getRecorderPagePath(rule.urlPath);
    if (
      rule.matchType !== 'all' &&
      (rule.matchType === 'exact' ? path !== scope : !scope || !path.startsWith(scope))
    )
      return false;
    try {
      return !!element.closest(rule.selector);
    } catch {
      return false;
    }
  });
}
