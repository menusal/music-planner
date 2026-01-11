-- Supabase Storage Policies for Music Planner
-- Run this SQL in your Supabase dashboard SQL editor

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy to allow public read access to files in music-planner bucket
CREATE POLICY "Allow public read access to music-planner bucket"
ON storage.objects
FOR SELECT
USING (bucket_id = 'music-planner');

-- Policy to allow public insert (upload) to music-planner bucket
CREATE POLICY "Allow public insert to music-planner bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'music-planner');

-- Policy to allow public update to music-planner bucket
CREATE POLICY "Allow public update to music-planner bucket"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'music-planner')
WITH CHECK (bucket_id = 'music-planner');

-- Policy to allow public delete from music-planner bucket
CREATE POLICY "Allow public delete from music-planner bucket"
ON storage.objects
FOR DELETE
USING (bucket_id = 'music-planner');
