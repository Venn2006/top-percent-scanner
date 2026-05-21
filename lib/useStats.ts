"use client";

import { useState, useEffect, useRef } from 'react';

export interface StatsData {
  paidCount:  number;
  dailyViews: number;
}

// Fallback khi chưa fetch xong hoặc lỗi
const FALLBACK: StatsData = { paidCount: 309, dailyViews: 1850 };

// Module-level cache — chia sẻ giữa tất cả component dùng hook này
// Tránh gọi API nhiều lần trong cùng 1 session
let cachedStats: StatsData | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 giây

export function useStats(): StatsData {
  const [stats, setStats] = useState<StatsData>(cachedStats ?? FALLBACK);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Dùng cache nếu còn mới
    if (cachedStats && Date.now() - cacheTime < CACHE_TTL) {
      setStats(cachedStats);
      return;
    }
    // Tránh double-fetch trong StrictMode
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch('/api/stats')
      .then(r => r.json())
      .then((data: StatsData) => {
        if (typeof data.paidCount === 'number' && typeof data.dailyViews === 'number') {
          cachedStats = data;
          cacheTime   = Date.now();
          setStats(data);
        }
      })
      .catch(() => { /* giữ fallback */ });
  }, []);

  return stats;
}
