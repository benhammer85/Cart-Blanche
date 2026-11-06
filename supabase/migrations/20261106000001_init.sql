-- Cart Blanche — initial schema
-- Everything belongs to a household. Row Level Security limits every table to
-- rows whose household_id matches the signed-in user's household.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Households & members
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  created_at timestamptz not null default now()
);

-- App users (the two allowlisted logins). One household per user.
create table public.household_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null,
  initials text not null,
  created_at timestamptz not null default now()
);
create index on public.household_members (household_id);

-- People we cook for (used for portion sizing). Names never leave the app.
create table public.household_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('adult', 'kid')),
  birthdate date,
  portion_override numeric(4, 2), -- null = auto from age
  sort_order int not null default 0
);
create index on public.household_people (household_id);

create table public.household_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  planner_defaults jsonb not null default '{}'::jsonb,
  avoid_terms text[] not null default '{}',
  bonus_tags text[] not null default '{}', -- e.g. 'Molly Favorites' get a planner bonus
  updated_at timestamptz not null default now()
);

-- Helper used by every RLS policy. SECURITY DEFINER so it can read
-- household_members without recursive policy evaluation.
create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Stores, sections, categories, rules
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  location text,
  sort_order int not null default 0,
  is_bulk boolean not null default false,
  archived boolean not null default false
);
create index on public.stores (household_id);

create table public.store_sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (store_id, name)
);
create index on public.store_sections (household_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  default_section text not null default 'Other',
  sort_order int not null default 0,
  unique (household_id, name)
);

-- category -> ordered store preference. Lowest priority number wins among
-- the stores selected for the trip.
create table public.category_store_rules (
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  priority int not null default 0,
  primary key (category_id, store_id)
);
create index on public.category_store_rules (household_id);

-- Known ingredients: category, pantry staple flag, "we're out", Costco pack
-- size and the store/section the app learned from a manual reassignment.
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name_norm text not null,
  category_id uuid references public.categories (id) on delete set null,
  is_staple boolean not null default false,
  is_out boolean not null default false,
  pack_size text,
  learned_store_id uuid references public.stores (id) on delete set null,
  learned_section_id uuid references public.store_sections (id) on delete set null,
  unique (household_id, name_norm)
);

create table public.synonyms (
  household_id uuid not null references public.households (id) on delete cascade,
  alias text not null,
  canonical text not null,
  primary key (household_id, alias)
);

-- ---------------------------------------------------------------------------
-- Recipes (favorites)
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  title_norm text not null,
  servings numeric(6, 2) not null default 4,
  prep_min int,
  cook_min int,
  steps jsonb not null default '[]'::jsonb, -- [{text, isSection}]
  notes text,
  source_url text,
  source_name text,
  image_path text,
  tags text[] not null default '{}',
  meal_types text[] not null default '{dinner}',
  main_protein text,
  kid_friendly boolean not null default false,
  is_kid_meal boolean not null default false, -- kids-only favorites (hot dogs, nuggets…)
  origin text not null default 'manual'
    check (origin in ('crouton', 'url', 'manual', 'paste', 'claude', 'ai', 'seed')),
  external_id text,
  times_made int not null default 0,
  last_made_at date,
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.recipes (household_id);
create unique index recipes_external_uq on public.recipes (household_id, external_id) where external_id is not null;
create unique index recipes_source_uq on public.recipes (household_id, source_url) where source_url is not null;
create index recipes_tags_gin on public.recipes using gin (tags);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null default 0,
  raw_text text not null,
  qty numeric(10, 3),
  qty_max numeric(10, 3),
  unit text,
  name text not null,
  name_norm text not null,
  note text,
  parsed_ok boolean not null default true
);
create index on public.recipe_ingredients (recipe_id);
create index on public.recipe_ingredients (household_id);

-- ---------------------------------------------------------------------------
-- Plans & history
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  store_ids uuid[] not null default '{}',
  status text not null default 'final' check (status in ('draft', 'final')),
  created_at timestamptz not null default now()
);
create index on public.meal_plans (household_id, created_at desc);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  position int not null default 0,
  recipe_id uuid references public.recipes (id) on delete set null,
  ai_recipe jsonb, -- AI / Claude meal not (yet) saved as a favorite
  title text not null,
  for_kids boolean not null default false,
  servings numeric(6, 2) not null,
  made_at date
);
create index on public.meal_plan_items (plan_id);
create index on public.meal_plan_items (household_id);

-- ---------------------------------------------------------------------------
-- Shared shopping list
-- ---------------------------------------------------------------------------
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  plan_id uuid references public.meal_plans (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_active_list_per_household on public.shopping_lists (household_id) where is_active;

create table public.shopping_list_items (
  id uuid primary key, -- generated on the phone so offline adds have stable ids
  household_id uuid not null references public.households (id) on delete cascade,
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  name text not null,
  name_norm text,
  qty numeric(10, 3),
  unit text,
  display_qty text,
  store_id uuid references public.stores (id) on delete set null,
  section_id uuid references public.store_sections (id) on delete set null,
  checked boolean not null default false,
  checked_by text, -- initials
  added_by text, -- initials, or 'Alexa'
  is_manual boolean not null default true,
  note text,
  source_meals jsonb not null default '[]'::jsonb, -- [{title, recipeId}]
  deleted_at timestamptz, -- soft delete so offline phones converge
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.shopping_list_items (list_id);
create index on public.shopping_list_items (household_id);

-- Last-write-wins per item: a write carrying an older client timestamp than
-- what is stored is silently ignored (the stored row is kept). This makes
-- replaying an offline queue after reconnect safe.
create or replace function public.lww_guard()
returns trigger
language plpgsql
as $$
begin
  if new.client_updated_at < old.client_updated_at then
    return old;
  end if;
  return new;
end;
$$;

create trigger shopping_list_items_lww
before update on public.shopping_list_items
for each row execute function public.lww_guard();

-- Realtime needs full rows on update/delete for RLS-filtered change events.
alter table public.shopping_list_items replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_list_items;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- AI usage counter
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  household_id uuid not null references public.households (id) on delete cascade,
  day date not null,
  requests int not null default 0,
  primary key (household_id, day)
);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Mark a planned meal as made: stamps the plan item and bumps the recipe's
-- times_made / last_made_at, which feed the planner's scoring.
create or replace function public.mark_meal_made(p_item_id uuid, p_made boolean default true)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe uuid;
  v_was date;
begin
  select recipe_id, made_at into v_recipe, v_was
  from meal_plan_items where id = p_item_id and household_id = my_household_id();
  if not found then
    raise exception 'not found';
  end if;

  if p_made and v_was is null then
    update meal_plan_items set made_at = current_date where id = p_item_id;
    if v_recipe is not null then
      update recipes
        set times_made = times_made + 1,
            last_made_at = greatest(coalesce(last_made_at, current_date), current_date)
        where id = v_recipe;
    end if;
  elsif not p_made and v_was is not null then
    update meal_plan_items set made_at = null where id = p_item_id;
    if v_recipe is not null then
      update recipes set times_made = greatest(times_made - 1, 0) where id = v_recipe;
    end if;
  end if;
end;
$$;

create or replace function public.bump_ai_usage()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v int;
begin
  insert into ai_usage (household_id, day, requests)
  values (my_household_id(), current_date, 1)
  on conflict (household_id, day) do update set requests = ai_usage.requests + 1
  returning requests into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "own household" on public.households
  for all to authenticated
  using (id = public.my_household_id())
  with check (id = public.my_household_id());

create policy "see members of own household" on public.household_members
  for select to authenticated
  using (household_id = public.my_household_id());
create policy "edit own member row" on public.household_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = public.my_household_id());

-- Every other table: full access to rows of your own household.
do $$
declare
  t text;
begin
  foreach t in array array[
    'household_people', 'household_settings', 'stores', 'store_sections',
    'categories', 'category_store_rules', 'ingredients', 'synonyms',
    'recipes', 'recipe_ingredients', 'meal_plans', 'meal_plan_items',
    'shopping_lists', 'shopping_list_items', 'ai_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "household access" on public.%I for all to authenticated
         using (household_id = public.my_household_id())
         with check (household_id = public.my_household_id())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for recipe images (public read by unguessable path; writes
-- limited to the household's own folder: <household_id>/<file>)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('recipe-images', 'recipe-images', true)
    on conflict (id) do nothing;

    execute $p$
      create policy "household image writes" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'recipe-images'
                    and (storage.foldername(name))[1] = public.my_household_id()::text)
    $p$;
    execute $p$
      create policy "household image updates" on storage.objects
        for update to authenticated
        using (bucket_id = 'recipe-images'
               and (storage.foldername(name))[1] = public.my_household_id()::text)
    $p$;
    execute $p$
      create policy "household image deletes" on storage.objects
        for delete to authenticated
        using (bucket_id = 'recipe-images'
               and (storage.foldername(name))[1] = public.my_household_id()::text)
    $p$;
  end if;
end $$;
