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
-- Create function to auto-confirm users by setting confirmation timestamps
create or replace function public.auto_confirm_user()
returns trigger as $$
begin
  new.email_confirmed_at = now();
  new.confirmed_at = now();
  new.last_sign_in_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Bind the trigger BEFORE insert on auth.users
drop trigger if exists on_auth_user_created_confirm on auth.users;
create trigger on_auth_user_created_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_user();
`;

async function main() {
  const client = new Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Running auto-confirm trigger SQL...');
    await client.query(sql);
    console.log('Auto-confirm trigger created successfully!');
  } catch (err) {
    console.error('Error applying trigger:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
