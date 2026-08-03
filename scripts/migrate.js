const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Helper to parse .env file
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found!');
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
    if (match) {
      env[match[1]] = match[2];
    }
  });
  return env;
}

const env = loadEnv();
const directUrl = env.DIRECT_URL;

if (!directUrl) {
  console.error('DIRECT_URL is not set in .env');
  process.exit(1);
}

const sql = `
-- Enable uuid-ossp extension
create extension if not exists "uuid-ossp";

-- 1. Create Profiles table (links to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text not null,
  role text not null check (role in ('ADMIN', 'STUDENT')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Quizzes table
create table if not exists public.quizzes (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  duration integer not null, -- in seconds
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Questions table
create table if not exists public.questions (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D'))
);

-- 4. Create Quiz Registrations table
create table if not exists public.quiz_registrations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, quiz_id)
);

-- 5. Create Quiz Attempts table
create table if not exists public.quiz_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  quiz_id uuid references public.quizzes(id) on delete cascade not null,
  score integer, -- null until submitted
  total_questions integer not null,
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  submitted_at timestamp with time zone
);

-- 6. Create Quiz Answers table
create table if not exists public.quiz_answers (
  id uuid default gen_random_uuid() primary key,
  attempt_id uuid references public.quiz_attempts(id) on delete cascade not null,
  question_id uuid references public.questions(id) on delete cascade not null,
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean,
  unique (attempt_id, question_id)
);

-- Enable RLS (Disable for easier prototyping or create policy)
alter table public.profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.quiz_registrations enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

-- Setup basic policies
drop policy if exists "Allow all profiles select" on public.profiles;
create policy "Allow all profiles select" on public.profiles for select to authenticated using (true);

drop policy if exists "Allow all quizzes select" on public.quizzes;
create policy "Allow all quizzes select" on public.quizzes for select to authenticated using (true);

drop policy if exists "Allow all questions select" on public.questions;
create policy "Allow all questions select" on public.questions for select to authenticated using (true);

drop policy if exists "Allow all registrations select" on public.quiz_registrations;
create policy "Allow all registrations select" on public.quiz_registrations for select to authenticated using (true);

drop policy if exists "Allow all attempts select" on public.quiz_attempts;
create policy "Allow all attempts select" on public.quiz_attempts for select to authenticated using (true);

drop policy if exists "Allow all answers select" on public.quiz_answers;
create policy "Allow all answers select" on public.quiz_answers for select to authenticated using (true);

-- Create or replace trigger to automatically sync auth.users to public.profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'STUDENT')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Setup the trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`;

async function main() {
  const client = new Client({
    connectionString: directUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to Supabase Postgres...');
    await client.connect();
    console.log('Successfully connected!');

    console.log('Running migration SQL...');
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
