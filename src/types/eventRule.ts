export type EventRuleMatchType = 'exact' | 'prefix' | 'all';
export type EventRuleEventType = 'click' | 'submit';

export interface EventRuleInput {
  name: string;
  selector: string;
  urlPath: string;
  matchType: EventRuleMatchType;
  eventType: EventRuleEventType;
  isEnabled: boolean;
}

export interface EventRule extends EventRuleInput {
  id: string;
  websiteId: string;
  createdAt: string;
  updatedAt: string;
}

export type PublicEventRule = Pick<
  EventRule,
  'id' | 'name' | 'selector' | 'urlPath' | 'matchType' | 'eventType'
>;

export interface EventRulesResponse {
  data: EventRule[];
  count: number;
  limit: number;
}
