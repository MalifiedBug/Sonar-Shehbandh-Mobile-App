create table if not exists sonar.shortlists (
  user_id text not null references sonar.users(id) on delete cascade,
  registration_id text not null references sonar.registrations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, registration_id)
);
revoke all on sonar.shortlists from anon, authenticated;
alter table sonar.shortlists enable row level security;
