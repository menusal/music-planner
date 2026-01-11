-- Supabase Database Schema for Music Planner
-- Run this SQL in your Supabase dashboard SQL editor

-- Create tracks table
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  duration NUMERIC NOT NULL,
  storage_url TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tracks TEXT[] NOT NULL DEFAULT '{}',
  break_time NUMERIC NOT NULL DEFAULT 0,
  start_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_order ON tracks("order" ASC);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON playlists(created_at DESC);

-- Enable Row Level Security (RLS) - adjust policies as needed
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your security needs)
-- For public read/write access:
CREATE POLICY "Allow all operations on tracks" ON tracks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on playlists" ON playlists
  FOR ALL USING (true) WITH CHECK (true);

-- Add order column to existing tracks table (if table already exists)
-- Run this if you're updating an existing database:
-- ALTER TABLE tracks ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
-- CREATE INDEX IF NOT EXISTS idx_tracks_order ON tracks("order" ASC);

-- Note: Make sure to create the 'music-planner' storage bucket in Supabase Storage
-- and set it to public if you want public access to audio files
