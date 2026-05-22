alter table public.purchases
  add column if not exists current_salary integer;

create index if not exists idx_purchases_current_salary
  on public.purchases (current_salary);

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'purchases'
  and column_name in ('experience', 'current_salary')
order by column_name;
