import { track } from '@vercel/analytics';

type AnalyticsValue = string | number | boolean | null | undefined;

export function trackEvent(name: string, properties: Record<string, AnalyticsValue> = {}) {
  if (typeof window === 'undefined') return;

  const cleaned = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null)
  ) as Record<string, string | number | boolean>;

  track(name, cleaned);
}
