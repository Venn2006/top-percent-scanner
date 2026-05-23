export type AttributionPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

const STORAGE_KEY = 'vspi-attribution-v1';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

function cleanValue(value: string | null): string | undefined {
  const cleaned = (value || '').trim().slice(0, 120);
  return cleaned || undefined;
}

function getExternalReferrer(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const referrerUrl = new URL(document.referrer);
    if (referrerUrl.hostname === window.location.hostname) return undefined;
    return cleanValue(referrerUrl.hostname);
  } catch {
    return undefined;
  }
}

export function getAttributionPayload(): AttributionPayload {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const fresh: AttributionPayload = {};

  for (const key of UTM_KEYS) {
    const value = cleanValue(params.get(key));
    if (value) fresh[key] = value;
  }

  const referrer = getExternalReferrer();
  if (referrer) fresh.referrer = referrer;

  const hasFresh = Object.keys(fresh).length > 0;
  if (hasFresh) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...fresh, savedAt: Date.now() }));
    } catch {
      // ignore storage errors
    }
    return fresh;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as AttributionPayload;
    return {
      utm_source: cleanValue(stored.utm_source || null),
      utm_medium: cleanValue(stored.utm_medium || null),
      utm_campaign: cleanValue(stored.utm_campaign || null),
      referrer: cleanValue(stored.referrer || null),
    };
  } catch {
    return {};
  }
}
