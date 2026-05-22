export const MARKET_LOCATIONS = [
  {
    key: 'hcm',
    label: 'TP.HCM',
    multiplier: 1.12,
    note: 'Thi truong luong cao nhat, nhieu MNC/startup/tech va head office.',
  },
  {
    key: 'hanoi',
    label: 'Ha Noi',
    multiplier: 1.08,
    note: 'Thi truong head office, tai chinh, cong nghe va khu vuc cong lon.',
  },
  {
    key: 'danang',
    label: 'Da Nang',
    multiplier: 0.95,
    note: 'Thi truong tech, du lich, dich vu dang tang nhung mat bang luong thap hon HCM/HN.',
  },
  {
    key: 'industrial',
    label: 'Binh Duong / Dong Nai / Bac Ninh',
    multiplier: 1.02,
    note: 'Cum FDI, san xuat, logistics va ky thuat co premium rieng.',
  },
  {
    key: 'tier2',
    label: 'Thanh pho lon khac',
    multiplier: 0.90,
    note: 'Can Tho, Hai Phong, Nha Trang, Hue va cac do thi vung.',
  },
  {
    key: 'province',
    label: 'Tinh khac',
    multiplier: 0.82,
    note: 'Mat bang luong dia phuong thap hon, tru mot so vai tro remote/kinh doanh rieng.',
  },
] as const;

export type MarketLocationKey = typeof MARKET_LOCATIONS[number]['key'];

export const DEFAULT_MARKET_LOCATION: MarketLocationKey = 'hcm';

export function normalizeMarketLocation(value: unknown): MarketLocationKey {
  return typeof value === 'string' && MARKET_LOCATIONS.some(item => item.key === value)
    ? value as MarketLocationKey
    : DEFAULT_MARKET_LOCATION;
}

export function getMarketLocation(key: MarketLocationKey) {
  return MARKET_LOCATIONS.find(item => item.key === key) ?? MARKET_LOCATIONS[0];
}
