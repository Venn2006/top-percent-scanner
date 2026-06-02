import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * CLIENT-SIDE Supabase client.
 * Dùng anon key — an toàn để expose ra browser.
 * Chỉ có quyền theo RLS policy đã cấu hình trên Supabase.
 * Import file này trong Client Components nếu cần query public data.
 */
export const supabaseClient = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
