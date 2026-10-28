-- ============================================================================
-- Supabase Migration: Create "pilotstudy" table and seed students with points
-- Database: pilotstudy
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.pilotstudy (
    id TEXT PRIMARY KEY,
    student_name TEXT NOT NULL,
    total_points NUMERIC DEFAULT 0,
    max_points NUMERIC DEFAULT 115,
    percentage NUMERIC DEFAULT 0,
    rank INTEGER DEFAULT 1,
    category_scores JSONB DEFAULT '{}'::jsonb,
    remarks TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.pilotstudy ENABLE ROW LEVEL SECURITY;

-- 3. Create policies for public read/write for the leaderboard
CREATE POLICY "Allow public read access to pilotstudy"
ON public.pilotstudy FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public insert to pilotstudy"
ON public.pilotstudy FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update to pilotstudy"
ON public.pilotstudy FOR UPDATE
TO anon, authenticated
USING (true);

-- 4. Seed with all 20 students
INSERT INTO public.pilotstudy (id, student_name, total_points, rank, percentage)
VALUES
    ('std-1', 'R.Reshma', 94, 2, 81.7),
    ('std-2', 'Nihal Ahmed I', 82, 4, 71.3),
    ('std-3', 'Sanjay S', 74, 6, 64.3),
    ('std-4', 'SAMYUKTHA P V', 102, 1, 88.7),
    ('std-5', 'Naveen Sushant G', 78, 5, 67.8),
    ('std-6', 'Mithiun.V', 67, 8, 58.3),
    ('std-7', 'ASHWANTH.E.M', 88, 3, 76.5),
    ('std-8', 'Hasan Mohammed', 63, 9, 54.8),
    ('std-9', 'MOHAMMAD ELIYAAZ', 71, 7, 61.7),
    ('std-10', 'Dharun T R', 58, 10, 50.4),
    ('std-11', 'Geetan D', 46, 13, 40.0),
    ('std-12', 'Dhiyanesh Senthil.S', 54, 11, 47.0),
    ('std-13', 'Breno', 38, 15, 33.0),
    ('std-14', 'Santhosh', 42, 14, 36.5),
    ('std-15', 'Kabilash', 35, 16, 30.4),
    ('std-16', 'Banusri', 30, 17, 26.1),
    ('std-17', 'Dharsiga', 26, 18, 22.6),
    ('std-18', 'Aishwarya', 22, 19, 19.1),
    ('std-19', 'Ashok Britto.P', 18, 20, 15.7),
    ('std-20', 'S.KEERTHANA', 50, 12, 43.5)
ON CONFLICT (id) DO UPDATE SET
    total_points = EXCLUDED.total_points,
    rank = EXCLUDED.rank,
    percentage = EXCLUDED.percentage,
    updated_at = now();
