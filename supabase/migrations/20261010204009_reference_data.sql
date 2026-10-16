-- Initial taxonomy, not UI constants. Administrators can extend this reference table.
insert into public.categories(name) values
 ('Web Development'),('Data Science'),('Design'),('Business'),('Marketing'),
 ('Mobile Development'),('DevOps'),('AI & ML') on conflict do nothing;
