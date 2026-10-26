create table if not exists sonar.payments (
  order_id text primary key,
  user_id text not null references sonar.users(id) on delete cascade,
  plan text not null,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status text not null default 'ACTIVE',
  payment_session_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_user_idx on sonar.payments(user_id, created_at desc);

create table if not exists sonar.subscriptions (
  user_id text primary key references sonar.users(id) on delete cascade,
  plan text not null,
  expires_at timestamptz not null,
  last_order_id text,
  updated_at timestamptz not null default now()
);

revoke all on sonar.payments, sonar.subscriptions from anon, authenticated;
alter table sonar.payments enable row level security;
alter table sonar.subscriptions enable row level security;
