-- Categories remain database-managed; administrators can extend this list.
insert into public.categories (name) values
  ('Cybersecurity'),
  ('IT Audit & SOX'),
  ('Risk & Governance'),
  ('Cloud & DevSecOps')
on conflict (name) do nothing;

-- Retire unused starter categories without deleting custom categories or courses.
delete from public.categories c
where c.name in ('AI & ML', 'Business', 'Data Science', 'Design', 'DevOps',
                 'Marketing', 'Mobile Development', 'Web Development')
  and not exists (select 1 from public.courses co where co.category = c.name);
