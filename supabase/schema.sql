-- =============================================
-- Hamiklat — Shelter Map Database Schema
-- Run this in your Supabase SQL editor
-- =============================================

-- Enable PostGIS for spatial queries (optional but recommended)
-- create extension if not exists postgis;

-- =============================================
-- USERS
-- =============================================
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  role          text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  reputation    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- SHELTERS
-- =============================================
create table public.shelters (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  address             text not null,
  city                text not null,
  lat                 double precision not null,
  lng                 double precision not null,
  source              text not null default 'community' check (source in ('official', 'community')),
  status              text not null default 'unverified' check (status in ('active', 'unverified', 'verified', 'closed', 'flagged')),
  shelter_type        text check (shelter_type in ('mamad', 'public_shelter', 'building_shelter', 'other')),
  floor               text,
  capacity            integer,
  is_accessible       boolean not null default false,
  accessibility_notes text,
  hours               text,
  notes               text,
  official_source_id  text,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  verification_count  integer not null default 0,
  report_count        integer not null default 0,
  avg_rating          numeric(3,2),
  photo_count         integer not null default 0
);

-- Indexes for fast queries
create index shelters_city_idx on public.shelters (city);
create index shelters_status_idx on public.shelters (status);
create index shelters_location_idx on public.shelters (lat, lng);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shelters_updated_at
  before update on public.shelters
  for each row execute procedure update_updated_at();

-- =============================================
-- RATINGS
-- =============================================
create table public.ratings (
  id          uuid primary key default gen_random_uuid(),
  shelter_id  uuid not null references public.shelters(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  score       smallint not null check (score between 1 and 5),
  created_at  timestamptz not null default now(),
  unique (shelter_id, user_id)
);

-- Auto-update shelter avg_rating after rating change
create or replace function update_shelter_avg_rating()
returns trigger as $$
begin
  update public.shelters
  set avg_rating = (
    select round(avg(score)::numeric, 2)
    from public.ratings
    where shelter_id = coalesce(new.shelter_id, old.shelter_id)
  )
  where id = coalesce(new.shelter_id, old.shelter_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger ratings_avg_update
  after insert or update or delete on public.ratings
  for each row execute procedure update_shelter_avg_rating();

-- =============================================
-- COMMENTS
-- =============================================
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  shelter_id  uuid not null references public.shelters(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  content     text not null check (length(content) between 1 and 500),
  is_flagged  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index comments_shelter_idx on public.comments (shelter_id, created_at desc);

-- =============================================
-- PHOTOS
-- =============================================
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  shelter_id   uuid not null references public.shelters(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  url          text not null,
  storage_path text not null,
  caption      text,
  is_approved  boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Auto-update photo_count on shelter
create or replace function update_shelter_photo_count()
returns trigger as $$
begin
  update public.shelters
  set photo_count = (
    select count(*) from public.photos
    where shelter_id = coalesce(new.shelter_id, old.shelter_id)
    and is_approved = true
  )
  where id = coalesce(new.shelter_id, old.shelter_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger photos_count_update
  after insert or update or delete on public.photos
  for each row execute procedure update_shelter_photo_count();

-- =============================================
-- REPORTS
-- =============================================
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  shelter_id  uuid not null references public.shelters(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  type        text not null check (type in ('locked', 'inaccessible', 'dirty', 'unsafe', 'closed', 'fake', 'other')),
  description text check (length(description) < 300),
  status      text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- Auto-update report_count and flag shelter when threshold exceeded
create or replace function update_shelter_report_count()
returns trigger as $$
declare
  active_reports integer;
begin
  select count(*) into active_reports
  from public.reports
  where shelter_id = coalesce(new.shelter_id, old.shelter_id)
    and status = 'pending';

  update public.shelters
  set
    report_count = active_reports,
    status = case when active_reports >= 3 then 'flagged' else status end
  where id = coalesce(new.shelter_id, old.shelter_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger reports_count_update
  after insert or update or delete on public.reports
  for each row execute procedure update_shelter_report_count();

-- =============================================
-- VERIFICATIONS
-- =============================================
create table public.verifications (
  id          uuid primary key default gen_random_uuid(),
  shelter_id  uuid not null references public.shelters(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  is_positive boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (shelter_id, user_id)
);

-- Auto-update verification_count and promote to verified if threshold met
create or replace function update_shelter_verification()
returns trigger as $$
declare
  pos_count integer;
begin
  select count(*) into pos_count
  from public.verifications
  where shelter_id = coalesce(new.shelter_id, old.shelter_id)
    and is_positive = true;

  update public.shelters
  set
    verification_count = pos_count,
    status = case
      when pos_count >= 5 and status = 'unverified' then 'verified'
      else status
    end
  where id = coalesce(new.shelter_id, old.shelter_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger verifications_update
  after insert or update or delete on public.verifications
  for each row execute procedure update_shelter_verification();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

alter table public.users enable row level security;
alter table public.shelters enable row level security;
alter table public.ratings enable row level security;
alter table public.comments enable row level security;
alter table public.photos enable row level security;
alter table public.reports enable row level security;
alter table public.verifications enable row level security;

-- Users: read own, update own
create policy "Users can read all profiles" on public.users for select using (true);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Shelters: anyone can read; auth users can insert; creator/mod can update
create policy "Anyone can read shelters" on public.shelters for select using (true);
create policy "Auth users can add shelters" on public.shelters for insert with check (auth.uid() is not null);
create policy "Creator or mod can update" on public.shelters for update using (
  auth.uid() = created_by or
  exists (select 1 from public.users where id = auth.uid() and role in ('moderator', 'admin'))
);

-- Ratings: auth users can insert/update own
create policy "Anyone can read ratings" on public.ratings for select using (true);
create policy "Auth users can rate" on public.ratings for insert with check (auth.uid() = user_id);
create policy "Auth users can update own rating" on public.ratings for update using (auth.uid() = user_id);

-- Comments: read all, insert if auth, delete own
create policy "Anyone can read comments" on public.comments for select using (true);
create policy "Auth users can comment" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comment" on public.comments for delete using (auth.uid() = user_id);

-- Photos: read approved, insert if auth, delete own
create policy "Anyone can read approved photos" on public.photos for select using (is_approved = true);
create policy "Auth users can upload" on public.photos for insert with check (auth.uid() = user_id);
create policy "Users can delete own photo" on public.photos for delete using (auth.uid() = user_id);

-- Reports: anyone can insert; moderators can update
create policy "Auth or anon can report" on public.reports for insert with check (true);
create policy "Mods can read/update reports" on public.reports for select using (
  exists (select 1 from public.users where id = auth.uid() and role in ('moderator', 'admin'))
);
create policy "Mods can update report status" on public.reports for update using (
  exists (select 1 from public.users where id = auth.uid() and role in ('moderator', 'admin'))
);

-- Verifications: read all, insert if auth
create policy "Anyone can read verifications" on public.verifications for select using (true);
create policy "Auth users can verify" on public.verifications for insert with check (auth.uid() = user_id);
create policy "Auth users can update own verification" on public.verifications for update using (auth.uid() = user_id);

-- =============================================
-- STORAGE BUCKET for photos
-- =============================================
-- Run in Supabase dashboard: Storage > New bucket
-- Name: shelter-photos
-- Public: true
-- File size limit: 5MB
-- Allowed MIME types: image/jpeg, image/png, image/webp
