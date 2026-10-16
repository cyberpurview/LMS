-- Update the existing identity without rewriting previously applied migrations.
alter table public.platform_settings
  alter column platform_name set default 'CyberPurview';

update public.platform_settings
set platform_name = 'CyberPurview'
where singleton and platform_name = 'LearnFlow';
