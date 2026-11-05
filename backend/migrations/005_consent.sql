-- Record of explicit consent to Terms of Service & Privacy Policy at sign-up.
alter table sonar.users add column if not exists accepted_terms_at timestamptz;
