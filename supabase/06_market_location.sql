alter table public.purchases
  add column if not exists market_location text;

create index if not exists idx_purchases_market_location
  on public.purchases (market_location);

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'purchases'
  and column_name in ('market_location', 'current_salary', 'experience')
order by column_name;
