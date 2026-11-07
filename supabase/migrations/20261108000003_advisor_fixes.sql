-- Security and speed fixes the Supabase advisors flagged. Safe to run more than once.

-- Only signed-in people need to look up their household.
revoke execute on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated;

-- Pin the search path on the list's last-write-wins trigger.
alter function public.lww_guard() set search_path = '';

-- Look the signed-in user up once per query, not once per row.
drop policy if exists "see members of own household" on public.household_members;
create policy "see members of own household" on public.household_members
  for select to authenticated
  using (household_id = (select public.my_household_id()));

drop policy if exists "edit own member row" on public.household_members;
create policy "edit own member row" on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and household_id = (select public.my_household_id()));
