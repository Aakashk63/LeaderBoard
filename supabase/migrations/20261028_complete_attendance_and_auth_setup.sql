-- ============================================================================
-- CONSOLIDATED SUPABASE MIGRATION: ATTENDANCE, GPS VERIFICATION & AUTH PROFILES
-- Project: Student Leaderboard • Pilot Study Program
-- Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
-- Location: 11.0827° N, 77.0185° E (500m geofence radius)
-- ============================================================================
-- HOW TO RUN:
-- Open your Supabase Dashboard: https://supabase.com/dashboard/project/iridkxcusdcwqgtytspg
-- Navigate to SQL Editor -> New Query -> Paste this entire file -> Click Run
-- ============================================================================

-- 1. Ensure Columns Exist on Pilotstudy Table
ALTER TABLE IF EXISTS public.pilotstudy 
ADD COLUMN IF NOT EXISTS base_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cumulative_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS attendance_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS early_bird_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS night_owl_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN DEFAULT false;

-- 2. Campus Geofence Settings Table (SNS College of Technology: 11.10043° N, 77.02661° E)
CREATE TABLE IF NOT EXISTS public.campus_geofence_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    campus_name TEXT NOT NULL DEFAULT 'SNS College of Technology, Coimbatore',
    center_latitude NUMERIC NOT NULL DEFAULT 11.10043,
    center_longitude NUMERIC NOT NULL DEFAULT 77.02661,
    radius_meters NUMERIC NOT NULL DEFAULT 500,
    max_accuracy_meters NUMERIC NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed / Update Campus Geofence
INSERT INTO public.campus_geofence_settings (id, campus_name, center_latitude, center_longitude, radius_meters, max_accuracy_meters)
VALUES ('default', 'SNS College of Technology, Coimbatore', 11.10043, 77.02661, 500, 100)
ON CONFLICT (id) DO UPDATE SET
    campus_name = EXCLUDED.campus_name,
    center_latitude = EXCLUDED.center_latitude,
    center_longitude = EXCLUDED.center_longitude,
    radius_meters = EXCLUDED.radius_meters,
    max_accuracy_meters = EXCLUDED.max_accuracy_meters,
    updated_at = now();

-- 3. Student Attendance Table (One record per student per college-local date)
CREATE TABLE IF NOT EXISTS public.student_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL REFERENCES public.pilotstudy(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    login_at TIMESTAMPTZ,
    login_latitude NUMERIC,
    login_longitude NUMERIC,
    login_accuracy_meters NUMERIC,
    login_location_verified BOOLEAN DEFAULT false,
    logout_at TIMESTAMPTZ,
    logout_latitude NUMERIC,
    logout_longitude NUMERIC,
    logout_accuracy_meters NUMERIC,
    logout_location_verified BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'checked_in', -- 'checked_in', 'completed', 'rejected'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_attendance_date UNIQUE (student_id, attendance_date)
);

-- 4. Daily Attendance Awards Table (Historical Preservation)
CREATE TABLE IF NOT EXISTS public.daily_attendance_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_date DATE NOT NULL,
    category TEXT NOT NULL, -- 'early_bird', 'night_owl'
    winning_student_id TEXT REFERENCES public.pilotstudy(id) ON DELETE SET NULL,
    awarded_points NUMERIC DEFAULT 10 NOT NULL,
    winning_timestamp TIMESTAMPTZ,
    calculated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    scoring_reason TEXT,
    status TEXT DEFAULT 'awarded', -- 'awarded', 'no_winner', 'pending', 'finalized'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_daily_category_award UNIQUE (attendance_date, category)
);

-- 5. Student Authentication Profiles (Links auth.users to pilotstudy cohort)
CREATE TABLE IF NOT EXISTS public.student_auth_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES public.pilotstudy(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'student', -- 'student', 'mentor', 'admin'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.campus_geofence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attendance_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_auth_profiles ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DO $$
BEGIN
    -- Campus settings: anyone can read geofence parameters
    DROP POLICY IF EXISTS "Public read campus_geofence_settings" ON public.campus_geofence_settings;
    CREATE POLICY "Public read campus_geofence_settings"
    ON public.campus_geofence_settings FOR SELECT
    TO authenticated, anon
    USING (true);

    -- Attendance: public read, authenticated insert and update
    DROP POLICY IF EXISTS "Public read student_attendance" ON public.student_attendance;
    CREATE POLICY "Public read student_attendance"
    ON public.student_attendance FOR SELECT
    TO authenticated, anon
    USING (true);

    DROP POLICY IF EXISTS "Allow student attendance checkin" ON public.student_attendance;
    CREATE POLICY "Allow student attendance checkin"
    ON public.student_attendance FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow student attendance checkout" ON public.student_attendance;
    CREATE POLICY "Allow student attendance checkout"
    ON public.student_attendance FOR UPDATE
    TO authenticated, anon
    USING (true);

    -- Awards: public read, authorized write
    DROP POLICY IF EXISTS "Public read daily_attendance_awards" ON public.daily_attendance_awards;
    CREATE POLICY "Public read daily_attendance_awards"
    ON public.daily_attendance_awards FOR SELECT
    TO authenticated, anon
    USING (true);

    DROP POLICY IF EXISTS "Allow awards update" ON public.daily_attendance_awards;
    CREATE POLICY "Allow awards update"
    ON public.daily_attendance_awards FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

    -- Profiles: public read and insert for registration
    DROP POLICY IF EXISTS "Allow users to read profiles" ON public.student_auth_profiles;
    CREATE POLICY "Allow users to read profiles"
    ON public.student_auth_profiles FOR SELECT
    TO authenticated, anon
    USING (true);

    DROP POLICY IF EXISTS "Allow profile registration" ON public.student_auth_profiles;
    CREATE POLICY "Allow profile registration"
    ON public.student_auth_profiles FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);
END $$;

-- 8. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_student_attendance_lookup 
ON public.student_attendance (attendance_date, student_id);

CREATE INDEX IF NOT EXISTS idx_daily_awards_lookup 
ON public.daily_attendance_awards (attendance_date, category);

-- 9. Real-Time Publications
-- Enable Realtime broadcasting so all clients see live podium and attendance updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_attendance_awards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pilotstudy;

-- 10. Provision Dummy Student Record in pilotstudy
INSERT INTO public.pilotstudy (id, student_name, total_points, max_points, percentage, category_scores, is_test_account)
VALUES ('std-dummy', 'Dummy Student', 0, 115, 0, '{}'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
    student_name = EXCLUDED.student_name,
    is_test_account = true;

-- 11. Provision Dummy Student in auth.users (dummy@gmail.com / 12345678)
DO $$
DECLARE
    dummy_uid UUID;
BEGIN
    SELECT id INTO dummy_uid FROM auth.users WHERE email = 'dummy@gmail.com';
    IF dummy_uid IS NULL THEN
        dummy_uid := gen_random_uuid();
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud
        ) VALUES (
            dummy_uid,
            '00000000-0000-0000-0000-000000000000',
            'dummy@gmail.com',
            crypt('12345678', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"student_id":"std-dummy","student_name":"Dummy Student","role":"student","is_test_account":true}',
            now(),
            now(),
            'authenticated',
            'authenticated'
        );
    END IF;

    INSERT INTO public.student_auth_profiles (id, student_id, email, role)
    VALUES (dummy_uid, 'std-dummy', 'dummy@gmail.com', 'student')
    ON CONFLICT (student_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Notice: Direct auth.users insert skipped in restricted environment.';
END $$;
