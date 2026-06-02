import { track } from '@vercel/analytics';
import type { PostHog } from 'posthog-js';

type AnalyticsValue = string | number | boolean | null | undefined;
export type FunnelPackage = '29k' | '79k';
export type FunnelEventName = 'view_landing' | 'view_paywall' | 'initiate_checkout' | 'purchase_success';

export type FunnelEventProperties = Record<string, AnalyticsValue> & {
  job: string;
  city: string;
  percentile: number;
  package: FunnelPackage;
};

let posthogClientPromise: Promise<PostHog | null> | null = null;

function getPostHogClient(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return Promise.resolve(null);

  if (!posthogClientPromise) {
    posthogClientPromise = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
          capture_pageview: false,
          person_profiles: 'identified_only',
        });

        return posthog;
      })
      .catch(error => {
        console.warn('[analytics] PostHog init failed:', error);
        return null;
      });
  }

  return posthogClientPromise;
}

export function trackEvent(name: string, properties: Record<string, AnalyticsValue> = {}) {
  if (typeof window === 'undefined') return;

  const cleaned = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null)
  ) as Record<string, string | number | boolean>;

  track(name, cleaned);
  void getPostHogClient().then(posthog => posthog?.capture(name, cleaned));
}

export function trackFunnelEvent(name: FunnelEventName, properties: FunnelEventProperties) {
  trackEvent(name, properties);
}
