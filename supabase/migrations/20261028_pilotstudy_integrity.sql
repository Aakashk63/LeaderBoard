-- ============================================================================
-- Supabase Migration: Data Integrity & Realtime Configuration for "pilotstudy"
-- Database: pilotstudy
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Ensure table exists with correct schema
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

-- 2. Add validation check constraints if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pilotstudy_total_points_range'
    ) THEN
        ALTER TABLE public.pilotstudy 
        ADD CONSTRAINT pilotstudy_total_points_range 
        CHECK (total_points >= 0 AND total_points <= 115);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pilotstudy_percentage_range'
    ) THEN
        ALTER TABLE public.pilotstudy 
        ADD CONSTRAINT pilotstudy_percentage_range 
        CHECK (percentage >= 0 AND percentage <= 100);
    END IF;
END $$;

-- 3. Row Level Security Policies (Read & Update Protection)
ALTER TABLE public.pilotstudy ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pilotstudy' AND policyname = 'Allow public read access to pilotstudy'
    ) THEN
        CREATE POLICY "Allow public read access to pilotstudy"
        ON public.pilotstudy FOR SELECT
        TO anon, authenticated
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'pilotstudy' AND policyname = 'Allow authorized update to pilotstudy'
    ) THEN
        CREATE POLICY "Allow authorized update to pilotstudy"
        ON public.pilotstudy FOR UPDATE
        TO anon, authenticated
        USING (true)
        WITH CHECK (total_points >= 0 AND total_points <= 115);
    END IF;
END $$;

-- 4. Enable Supabase Realtime Publication for pilotstudy
-- This ensures postgres_changes events broadcast across all connected clients
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pilotstudy'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.pilotstudy;
        END IF;
    END IF;
END $$;

-- 5. Stored Procedure: Atomic Category Score Update & Cohort Ranking
CREATE OR REPLACE FUNCTION public.update_pilotstudy_score(
    p_student_id TEXT,
    p_category_scores JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total NUMERIC := 0;
    v_pct NUMERIC := 0;
    v_updated JSONB;
BEGIN
    -- Validate student existence
    IF NOT EXISTS (SELECT 1 FROM public.pilotstudy WHERE id = p_student_id) THEN
        RAISE EXCEPTION 'Student with ID % not found.', p_student_id;
    END IF;

    -- Calculate total from all category keys
    SELECT COALESCE(SUM((val)::numeric), 0)
    INTO v_total
    FROM jsonb_each_text(p_category_scores) AS t(key, val);

    IF v_total < 0 OR v_total > 115 THEN
        RAISE EXCEPTION 'Calculated total score % is outside allowable range [0, 115]', v_total;
    END IF;

    v_pct := ROUND((v_total / 115.0) * 100.0, 1);

    -- Update target student
    UPDATE public.pilotstudy
    SET
        category_scores = p_category_scores,
        total_points = v_total,
        max_points = 115,
        percentage = v_pct,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_student_id;

    -- Recalculate Standard Competition Ranking (1224) across the cohort
    WITH ranked AS (
        SELECT id, RANK() OVER (ORDER BY total_points DESC, student_name ASC) as new_rank
        FROM public.pilotstudy
    )
    UPDATE public.pilotstudy p
    SET rank = r.new_rank
    FROM ranked r
    WHERE p.id = r.id;

    -- Return updated student record
    SELECT to_jsonb(p) INTO v_updated
    FROM public.pilotstudy p
    WHERE p.id = p_student_id;

    RETURN v_updated;
END;
$$;
