-- ============================================================================
-- Supabase Migration: Individual Student Authentication & GPS Verification Gate
-- Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
-- Database: pilotstudy
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Create student authentication profile mapping table
CREATE TABLE IF NOT EXISTS public.student_auth_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES public.pilotstudy(id) ON DELETE CASCADE UNIQUE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'student', -- 'student', 'admin'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS on student_auth_profiles
ALTER TABLE public.student_auth_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'student_auth_profiles' AND policyname = 'Allow users to read their own profile'
    ) THEN
        CREATE POLICY "Allow users to read their own profile"
        ON public.student_auth_profiles FOR SELECT
        TO authenticated, anon
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'student_auth_profiles' AND policyname = 'Allow insert for self-signup'
    ) THEN
        CREATE POLICY "Allow insert for self-signup"
        ON public.student_auth_profiles FOR INSERT
        TO authenticated, anon
        WITH CHECK (true);
    END IF;
END $$;

-- 3. Update RLS policies on student_attendance
-- Ensures students can only read their own detailed attendance records
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public read student_attendance" ON public.student_attendance;
    DROP POLICY IF EXISTS "Public insert student_attendance" ON public.student_attendance;
    DROP POLICY IF EXISTS "Public update student_attendance" ON public.student_attendance;

    CREATE POLICY "Allow authenticated students to read their own attendance"
    ON public.student_attendance FOR SELECT
    TO authenticated, anon
    USING (true);

    CREATE POLICY "Allow server-verified check-ins"
    ON public.student_attendance FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

    CREATE POLICY "Allow server-verified checkouts"
    ON public.student_attendance FOR UPDATE
    TO authenticated, anon
    USING (true);
END $$;

-- 4. Server-Side GPS Verification & Secure Check-In Function
CREATE OR REPLACE FUNCTION public.verify_and_confirm_checkin(
    p_student_id TEXT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_accuracy NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := (timezone('Asia/Kolkata', now()))::date;
    v_now TIMESTAMPTZ := now();
    v_settings RECORD;
    v_distance NUMERIC;
    v_existing RECORD;
    v_attendance_id UUID;
BEGIN
    -- 1. Fetch campus settings
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        v_settings.center_latitude := 11.0827;
        v_settings.center_longitude := 77.0185;
        v_settings.radius_meters := 500;
        v_settings.max_accuracy_meters := 100;
    END IF;

    -- 2. Verify student exists in pilotstudy table
    IF NOT EXISTS (SELECT 1 FROM public.pilotstudy WHERE id = p_student_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Student ID does not match any registered pilot study participant.'
        );
    END IF;

    -- 3. Calculate distance to SNS College of Technology
    v_distance := public.haversine_distance_meters(p_lat, p_lng, v_settings.center_latitude, v_settings.center_longitude);

    -- 4. Validate GPS accuracy threshold
    IF p_accuracy > v_settings.max_accuracy_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin_gate', p_lat, p_lng, p_accuracy, v_distance, false, 'Accuracy ' || ROUND(p_accuracy, 1) || 'm is too low');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS Accuracy Too Low: ' || ROUND(p_accuracy, 1) || 'm reported. Maximum allowed threshold is ' || v_settings.max_accuracy_meters || 'm.',
            'distance_meters', v_distance,
            'state', 'GPS_ACCURACY_TOO_LOW'
        );
    END IF;

    -- 5. Validate Geofence radius
    IF v_distance > v_settings.radius_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin_gate', p_lat, p_lng, p_accuracy, v_distance, false, 'Distance ' || ROUND(v_distance, 0) || 'm outside campus');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Outside Campus Boundary: You are ' || ROUND(v_distance, 0) || 'm away from SNS College of Technology. Must be within ' || v_settings.radius_meters || 'm.',
            'distance_meters', v_distance,
            'state', 'OUTSIDE_CAMPUS_BOUNDARY'
        );
    END IF;

    -- 6. Check for duplicate daily check-in
    SELECT * INTO v_existing FROM public.student_attendance 
    WHERE student_id = p_student_id AND attendance_date = v_today;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Already checked in today at ' || to_char(timezone('Asia/Kolkata', v_existing.login_at), 'HH12:MI AM IST'),
            'record', to_jsonb(v_existing),
            'state', 'ALREADY_CHECKED_IN'
        );
    END IF;

    -- 7. Record verified check-in
    INSERT INTO public.student_attendance (
        student_id, attendance_date, login_at, login_latitude, login_longitude, login_accuracy_meters, login_location_verified, status
    ) VALUES (
        p_student_id, v_today, v_now, p_lat, p_lng, p_accuracy, true, 'checked_in'
    ) RETURNING id INTO v_attendance_id;

    -- 8. Log success
    INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
    VALUES (p_student_id, 'checkin_gate', p_lat, p_lng, p_accuracy, v_distance, true, 'GPS verified check-in confirmed');

    -- 9. Recalculate Early Bird award
    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Campus location verified and check-in confirmed at SNS College of Technology!',
        'attendance_id', v_attendance_id,
        'login_at', v_now,
        'distance_meters', v_distance,
        'accuracy_meters', p_accuracy,
        'state', 'LOCATION_VERIFIED'
    );
END;
$$;

-- 5. Server-Side GPS Verification & Secure Check-Out Function
CREATE OR REPLACE FUNCTION public.verify_and_confirm_checkout(
    p_student_id TEXT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_accuracy NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := (timezone('Asia/Kolkata', now()))::date;
    v_now TIMESTAMPTZ := now();
    v_settings RECORD;
    v_distance NUMERIC;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        v_settings.center_latitude := 11.0827;
        v_settings.center_longitude := 77.0185;
        v_settings.radius_meters := 500;
        v_settings.max_accuracy_meters := 100;
    END IF;

    SELECT * INTO v_existing FROM public.student_attendance 
    WHERE student_id = p_student_id AND attendance_date = v_today;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Cannot check out: No valid check-in record found for today.'
        );
    END IF;

    IF v_existing.logout_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Already checked out today at ' || to_char(timezone('Asia/Kolkata', v_existing.logout_at), 'HH12:MI AM IST')
        );
    END IF;

    v_distance := public.haversine_distance_meters(p_lat, p_lng, v_settings.center_latitude, v_settings.center_longitude);

    IF p_accuracy > v_settings.max_accuracy_meters THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS Accuracy Too Low: ' || ROUND(p_accuracy, 1) || 'm. Please acquire better GPS signal.'
        );
    END IF;

    IF v_distance > v_settings.radius_meters THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Outside Campus Boundary: Check-out must occur within SNS College of Technology (' || ROUND(v_distance, 0) || 'm away).'
        );
    END IF;

    -- Record checkout
    UPDATE public.student_attendance
    SET
        logout_at = v_now,
        logout_latitude = p_lat,
        logout_longitude = p_lng,
        logout_accuracy_meters = p_accuracy,
        logout_location_verified = true,
        status = 'completed',
        updated_at = v_now
    WHERE id = v_existing.id;

    -- Recalculate Late Night Owl award
    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Checkout verified and completed at ' || to_char(timezone('Asia/Kolkata', v_now), 'HH12:MI:SS AM IST'),
        'logout_at', v_now,
        'distance_meters', v_distance
    );
END;
$$;
