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

/**
 * SERVER-SIDE Supabase client.
 * Dùng service_role key — TUYỆT ĐỐI không import trong Client Components.
 * Bypass RLS hoàn toàn, chỉ dùng trong app/api/** routes.
 *
 * Kiểm tra an toàn: nếu SERVICE_ROLE_KEY không tồn tại ở runtime
 * (ví dụ bị gọi nhầm từ client bundle), throw ngay để dễ debug.
 */
function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'This client must only be used in server-side API routes.'
    );
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      // Tắt auto-refresh token và persist session — không cần thiết ở server
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseServer = createServerClient();
