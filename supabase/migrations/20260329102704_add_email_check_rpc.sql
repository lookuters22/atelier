create or replace function public.check_user_exists(lookup_email text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  return exists (select 1 from public.photographers where email = lookup_email);
end;
$$;
