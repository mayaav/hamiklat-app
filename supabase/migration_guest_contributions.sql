-- =============================================
-- Migration: Guest Contributions
-- Allow all write actions without requiring login.
-- Run this in your Supabase SQL editor.
-- =============================================

-- 1. Make user_id nullable on all contribution tables

ALTER TABLE public.comments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.photos
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.ratings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.verifications
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add guest_id for light attribution and deduplication

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS guest_name text;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS guest_id text;

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS guest_id text;

ALTER TABLE public.verifications
  ADD COLUMN IF NOT EXISTS guest_id text;

-- 3. Update unique constraints on ratings to support both auth and guest

ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_shelter_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_shelter_user_idx
  ON public.ratings (shelter_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_shelter_guest_idx
  ON public.ratings (shelter_id, guest_id)
  WHERE guest_id IS NOT NULL;

-- 4. Update unique constraints on verifications

ALTER TABLE public.verifications
  DROP CONSTRAINT IF EXISTS verifications_shelter_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS verif_shelter_user_idx
  ON public.verifications (shelter_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verif_shelter_guest_idx
  ON public.verifications (shelter_id, guest_id)
  WHERE guest_id IS NOT NULL;

-- 5. Update RLS policies to allow guest (anon) writes

-- Shelters
DROP POLICY IF EXISTS "Auth users can add shelters" ON public.shelters;
CREATE POLICY "Anyone can add shelters" ON public.shelters
  FOR INSERT WITH CHECK (true);

-- Ratings
DROP POLICY IF EXISTS "Auth users can rate" ON public.ratings;
DROP POLICY IF EXISTS "Auth users can update own rating" ON public.ratings;
CREATE POLICY "Anyone can rate" ON public.ratings
  FOR INSERT WITH CHECK (true);

-- Comments
DROP POLICY IF EXISTS "Auth users can comment" ON public.comments;
CREATE POLICY "Anyone can comment" ON public.comments
  FOR INSERT WITH CHECK (true);

-- Photos
DROP POLICY IF EXISTS "Auth users can upload" ON public.photos;
CREATE POLICY "Anyone can upload" ON public.photos
  FOR INSERT WITH CHECK (true);

-- Verifications
DROP POLICY IF EXISTS "Auth users can verify" ON public.verifications;
DROP POLICY IF EXISTS "Auth users can update own verification" ON public.verifications;
CREATE POLICY "Anyone can verify" ON public.verifications
  FOR INSERT WITH CHECK (true);
