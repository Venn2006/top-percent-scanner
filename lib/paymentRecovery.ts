import type { SupabaseClient } from '@supabase/supabase-js';

type PaymentProduct = 'premium' | 'roadmap';

type RecoverNoMatchPaymentOptions = {
  supabase: SupabaseClient;
  vspiId: string;
  expectedAmount: number;
  product: PaymentProduct;
  table: 'purchases' | 'roadmaps';
  message: string;
  windowMinutes?: number;
};

export function normalizePaymentCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function recoverNoMatchPayment({
  supabase,
  vspiId,
  expectedAmount,
  product,
  table,
  message,
  windowMinutes = 120,
}: RecoverNoMatchPaymentOptions): Promise<boolean> {
  const safeVspiId = normalizePaymentCode(vspiId);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('payment_events')
    .select('created_at, amount, payment_ref, content')
    .eq('status', 'no_match')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    if (!/payment_events|schema cache|relation/i.test(error.message)) {
      console.warn('[paymentRecovery] Could not read payment events:', error.message);
    }
    return false;
  }

  const matched = events?.find(event => {
    const content = normalizePaymentCode(String(event.content || ''));
    const amount = Number(event.amount || 0);
    return content.includes(safeVspiId) && (!amount || amount >= expectedAmount);
  });

  if (!matched) return false;

  let { error: updateError } = await supabase
    .from(table)
    .update({
      status: 'paid',
      paid_at: matched.created_at || new Date().toISOString(),
      payment_ref: matched.payment_ref || null,
    })
    .eq('vspi_id', vspiId);

  if (updateError && /payment_ref|schema cache|column/i.test(updateError.message)) {
    const fallback = await supabase
      .from(table)
      .update({
        status: 'paid',
        paid_at: matched.created_at || new Date().toISOString(),
      })
      .eq('vspi_id', vspiId);
    updateError = fallback.error;
  }

  if (updateError) {
    console.warn('[paymentRecovery] Matched no_match event but could not mark paid:', updateError.message);
    return false;
  }

  await supabase
    .from('payment_events')
    .insert({
      status: 'matched',
      product,
      vspi_id: vspiId,
      amount: matched.amount ?? null,
      payment_ref: matched.payment_ref ?? null,
      content: matched.content ? String(matched.content).slice(0, 500) : null,
      message,
    })
    .then(({ error: eventError }) => {
      if (eventError && !/payment_events|schema cache|relation/i.test(eventError.message)) {
        console.warn('[paymentRecovery] Could not record recovered payment event:', eventError.message);
      }
    });

  return true;
}
