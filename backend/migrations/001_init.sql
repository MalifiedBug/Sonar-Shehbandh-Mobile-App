-- Sonar Shehbandh app schema. Lives in its own schema so it never collides with
-- existing tables in "public". Idempotent: safe to run on every start.
create schema if not exists sonar;

create table if not exists sonar.users (
  id text primary key,
  username text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists sonar.registrations (
  id text primary key,
  type text not null check (type in ('member', 'matrimony', 'business', 'social_worker')),
  title text not null,
  sub_caste text not null default '',
  data jsonb not null default '{}'::jsonb,
  photos jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  owner_id text not null references sonar.users(id) on delete cascade,
  owner_name text not null default '',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  expires_at timestamptz,
  reject_reason text
);
create index if not exists registrations_type_status_idx on sonar.registrations(type, status);
create index if not exists registrations_owner_idx on sonar.registrations(owner_id, created_at desc);
create index if not exists registrations_photo_paths_idx on sonar.registrations using gin(photo_paths);

create table if not exists sonar.files (
  id text primary key,
  storage_path text not null unique,
  owner_id text not null,
  content_type text not null,
  original_filename text,
  size integer not null,
  created_at timestamptz not null default now()
);

create table if not exists sonar.pincodes (
  pin text primary key,
  taluka text not null default '',
  district text not null default '',
  state text not null default '',
  areas jsonb not null default '[]'::jsonb
);

create table if not exists sonar.posts (
  id text primary key,
  kind text not null check (kind in ('news', 'event', 'notice')),
  title text not null,
  body text not null,
  level text,
  location text,
  event_date text,
  created_at timestamptz not null default now()
);
create index if not exists posts_kind_idx on sonar.posts(kind, created_at desc);

create table if not exists sonar.settings (
  key text primary key,
  value jsonb not null
);

create table if not exists sonar.complaints (
  id text primary key,
  kind text not null check (kind in ('complaint', 'suggestion')),
  subject text not null,
  message text not null,
  owner_id text not null references sonar.users(id) on delete cascade,
  owner_name text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists sonar.notifications (
  id text primary key,
  user_id text not null references sonar.users(id) on delete cascade,
  title text not null,
  message text not null,
  action_url text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on sonar.notifications(user_id, created_at desc);

-- Only the app server (direct database connection) may read or write these tables.
-- Phone/browser Supabase keys get no access; RLS is on as defence in depth.
revoke all on schema sonar from anon, authenticated;
revoke all on all tables in schema sonar from anon, authenticated;
alter table sonar.users enable row level security;
alter table sonar.registrations enable row level security;
alter table sonar.files enable row level security;
alter table sonar.pincodes enable row level security;
alter table sonar.posts enable row level security;
alter table sonar.settings enable row level security;
alter table sonar.complaints enable row level security;
alter table sonar.notifications enable row level security;
