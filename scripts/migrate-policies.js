const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

const sql = `
-- Drop existing recursion-prone policies if any
drop policy if exists "Allow all profiles select" on public.profiles;

-- Create role-based policies using JWT user_metadata
create policy "Allow all profiles select" on public.profiles 
  for select to authenticated using (true);

create policy "Allow admins to manage profiles" on public.profiles
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );

-- Quizzes policies
drop policy if exists "Allow all quizzes select" on public.quizzes;
create policy "Allow all quizzes select" on public.quizzes 
  for select to authenticated using (true);

create policy "Allow admins to manage quizzes" on public.quizzes
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );

-- Questions policies
drop policy if exists "Allow all questions select" on public.questions;
create policy "Allow all questions select" on public.questions 
  for select to authenticated using (true);

create policy "Allow admins to manage questions" on public.questions
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );

-- Quiz Registrations policies
drop policy if exists "Allow all registrations select" on public.quiz_registrations;
create policy "Allow all registrations select" on public.quiz_registrations 
  for select to authenticated using (true);

create policy "Allow admins to manage registrations" on public.quiz_registrations
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );

-- Quiz Attempts policies
drop policy if exists "Allow all attempts select" on public.quiz_attempts;
create policy "Allow all attempts select" on public.quiz_attempts 
  for select to authenticated using (true);

create policy "Allow admins to manage attempts" on public.quiz_attempts
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );

-- Quiz Answers policies
drop policy if exists "Allow all answers select" on public.quiz_answers;
create policy "Allow all answers select" on public.quiz_answers 
  for select to authenticated using (true);

create policy "Allow admins to manage answers" on public.quiz_answers
  for all to authenticated using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'ADMIN'
  );
`;

async function main() {
  const client = new Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Running RLS policies SQL...');
    await client.query(sql);
    console.log('Policies applied successfully!');
  } catch (err) {
    console.error('Error applying policies:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
