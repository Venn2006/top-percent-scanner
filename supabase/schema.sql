create table if not exists purchases (
  id uuid default gen_random_uuid() primary key,
  vspi_id text not null unique,
  email text,
  phone text,
  job_title text,
  percent integer,
  amount integer default 49000,
  status text default 'pending', -- pending | paid | delivered
  payment_ref text,
  created_at timestamptz default now(),
  paid_at timestamptz
);
