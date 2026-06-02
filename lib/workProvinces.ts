import { normalizeMarketLocation, type MarketLocationKey } from '@/lib/locationBenchmark';

export interface WorkProvince {
  key: string;
  label: string;
  marketLocation: MarketLocationKey;
}

export const WORK_PROVINCES = [
  { key: 'hcm', label: 'TP.HCM', marketLocation: 'hcm' },
  { key: 'hanoi', label: 'Hà Nội', marketLocation: 'hanoi' },
  { key: 'binh_duong', label: 'Bình Dương', marketLocation: 'industrial' },
  { key: 'dong_nai', label: 'Đồng Nai', marketLocation: 'industrial' },
  { key: 'bac_ninh', label: 'Bắc Ninh', marketLocation: 'industrial' },
  { key: 'hai_phong', label: 'Hải Phòng', marketLocation: 'industrial' },
  { key: 'da_nang', label: 'Đà Nẵng', marketLocation: 'danang' },
  { key: 'can_tho', label: 'Cần Thơ', marketLocation: 'tier2' },
  { key: 'ba_ria_vung_tau', label: 'Bà Rịa - Vũng Tàu', marketLocation: 'industrial' },
  { key: 'bac_giang', label: 'Bắc Giang', marketLocation: 'industrial' },
  { key: 'hai_duong', label: 'Hải Dương', marketLocation: 'industrial' },
  { key: 'hung_yen', label: 'Hưng Yên', marketLocation: 'industrial' },
  { key: 'long_an', label: 'Long An', marketLocation: 'industrial' },
  { key: 'vinh_phuc', label: 'Vĩnh Phúc', marketLocation: 'industrial' },
  { key: 'quang_ninh', label: 'Quảng Ninh', marketLocation: 'tier2' },
  { key: 'khanh_hoa', label: 'Khánh Hòa', marketLocation: 'tier2' },
  { key: 'thua_thien_hue', label: 'Thừa Thiên Huế / Huế', marketLocation: 'tier2' },
  { key: 'nghe_an', label: 'Nghệ An', marketLocation: 'tier2' },
  { key: 'thanh_hoa', label: 'Thanh Hóa', marketLocation: 'tier2' },
  { key: 'an_giang', label: 'An Giang', marketLocation: 'province' },
  { key: 'bac_kan', label: 'Bắc Kạn', marketLocation: 'province' },
  { key: 'bac_lieu', label: 'Bạc Liêu', marketLocation: 'province' },
  { key: 'ben_tre', label: 'Bến Tre', marketLocation: 'province_zone3' },
  { key: 'binh_dinh', label: 'Bình Định', marketLocation: 'tier2' },
  { key: 'binh_phuoc', label: 'Bình Phước', marketLocation: 'industrial' },
  { key: 'binh_thuan', label: 'Bình Thuận', marketLocation: 'province_zone3' },
  { key: 'ca_mau', label: 'Cà Mau', marketLocation: 'province' },
  { key: 'cao_bang', label: 'Cao Bằng', marketLocation: 'province' },
  { key: 'dak_lak', label: 'Đắk Lắk', marketLocation: 'province' },
  { key: 'dak_nong', label: 'Đắk Nông', marketLocation: 'province' },
  { key: 'dien_bien', label: 'Điện Biên', marketLocation: 'province' },
  { key: 'dong_thap', label: 'Đồng Tháp', marketLocation: 'province_zone3' },
  { key: 'gia_lai', label: 'Gia Lai', marketLocation: 'province' },
  { key: 'ha_giang', label: 'Hà Giang', marketLocation: 'province' },
  { key: 'ha_nam', label: 'Hà Nam', marketLocation: 'industrial' },
  { key: 'ha_tinh', label: 'Hà Tĩnh', marketLocation: 'province' },
  { key: 'hau_giang', label: 'Hậu Giang', marketLocation: 'province_zone3' },
  { key: 'hoa_binh', label: 'Hòa Bình', marketLocation: 'province' },
  { key: 'kien_giang', label: 'Kiên Giang', marketLocation: 'province' },
  { key: 'kon_tum', label: 'Kon Tum', marketLocation: 'province' },
  { key: 'lai_chau', label: 'Lai Châu', marketLocation: 'province' },
  { key: 'lam_dong', label: 'Lâm Đồng', marketLocation: 'tier2' },
  { key: 'lang_son', label: 'Lạng Sơn', marketLocation: 'province' },
  { key: 'lao_cai', label: 'Lào Cai', marketLocation: 'province' },
  { key: 'nam_dinh', label: 'Nam Định', marketLocation: 'province_zone3' },
  { key: 'ninh_binh', label: 'Ninh Bình', marketLocation: 'province_zone3' },
  { key: 'ninh_thuan', label: 'Ninh Thuận', marketLocation: 'province' },
  { key: 'phu_tho', label: 'Phú Thọ', marketLocation: 'province_zone3' },
  { key: 'phu_yen', label: 'Phú Yên', marketLocation: 'province' },
  { key: 'quang_binh', label: 'Quảng Bình', marketLocation: 'province' },
  { key: 'quang_nam', label: 'Quảng Nam', marketLocation: 'province_zone3' },
  { key: 'quang_ngai', label: 'Quảng Ngãi', marketLocation: 'province_zone3' },
  { key: 'quang_tri', label: 'Quảng Trị', marketLocation: 'province' },
  { key: 'soc_trang', label: 'Sóc Trăng', marketLocation: 'province' },
  { key: 'son_la', label: 'Sơn La', marketLocation: 'province' },
  { key: 'tay_ninh', label: 'Tây Ninh', marketLocation: 'industrial' },
  { key: 'thai_binh', label: 'Thái Bình', marketLocation: 'province' },
  { key: 'thai_nguyen', label: 'Thái Nguyên', marketLocation: 'industrial' },
  { key: 'tien_giang', label: 'Tiền Giang', marketLocation: 'province_zone3' },
  { key: 'tra_vinh', label: 'Trà Vinh', marketLocation: 'province' },
  { key: 'tuyen_quang', label: 'Tuyên Quang', marketLocation: 'province' },
  { key: 'vinh_long', label: 'Vĩnh Long', marketLocation: 'province' },
  { key: 'yen_bai', label: 'Yên Bái', marketLocation: 'province' },
] as const satisfies readonly WorkProvince[];

export type WorkProvinceKey = typeof WORK_PROVINCES[number]['key'];

export const DEFAULT_WORK_PROVINCE: WorkProvinceKey = 'hcm';

export function isWorkProvinceKey(value: unknown): value is WorkProvinceKey {
  return typeof value === 'string' && WORK_PROVINCES.some(item => item.key === value);
}

export function getWorkProvince(value: unknown): WorkProvince {
  return WORK_PROVINCES.find(item => item.key === value) ?? WORK_PROVINCES[0];
}

export function normalizeWorkProvince(value: unknown): WorkProvinceKey {
  return getWorkProvince(value).key as WorkProvinceKey;
}

export function getBenchmarkMarketLocation(
  workProvinceValue: unknown,
  fallbackMarketLocation?: unknown
): MarketLocationKey {
  const explicitMarketLocation = normalizeMarketLocation(fallbackMarketLocation);
  if (typeof fallbackMarketLocation === 'string' && explicitMarketLocation !== 'hcm') {
    return explicitMarketLocation;
  }
  if (fallbackMarketLocation === 'hcm') return 'hcm';
  if (isWorkProvinceKey(workProvinceValue)) {
    return getWorkProvince(workProvinceValue).marketLocation;
  }
  return explicitMarketLocation;
}
