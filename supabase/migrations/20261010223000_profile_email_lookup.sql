-- Bound the cost of the administrator's duplicate-account lookup as membership grows.
create index if not exists profiles_email_idx on public.profiles(email);
