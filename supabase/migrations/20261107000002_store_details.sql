-- Cart Blanche — store details, "only at" items, bulk & freezer stock
-- Safe to run more than once.

alter table public.stores add column if not exists notes text;

alter table public.ingredients add column if not exists only_at boolean not null default false;

-- What's left from bulk packs (e.g. the rest of a 6 lb Costco pack, frozen).
create table if not exists public.bulk_stock (
  household_id uuid not null references public.households (id) on delete cascade,
  name_norm text not null,
  qty numeric(10, 3) not null,
  unit text,
  note text,
  updated_at timestamptz not null default now(),
  primary key (household_id, name_norm)
);

alter table public.bulk_stock enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bulk_stock' and policyname = 'household access') then
    create policy "household access" on public.bulk_stock for all to authenticated
      using (household_id = public.my_household_id())
      with check (household_id = public.my_household_id());
  end if;
end $$;
