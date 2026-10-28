-- ============================================================================
-- Supabase Migration: GPS-Verified Daily Attendance & Scoring System
-- Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
-- Database: pilotstudy
-- Run this in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Ensure columns exist on pilotstudy table
ALTER TABLE public.pilotstudy 
ADD COLUMN IF NOT EXISTS base_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS cumulative_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS attendance_points NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS early_bird_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS night_owl_count INTEGER DEFAULT 0;

-- 2. Campus Geofence Settings Table
CREATE TABLE IF NOT EXISTS public.campus_geofence_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    campus_name TEXT NOT NULL DEFAULT 'SNS College of Technology, Coimbatore',
    center_latitude NUMERIC NOT NULL DEFAULT 11.0827,
    center_longitude NUMERIC NOT NULL DEFAULT 77.0185,
    radius_meters NUMERIC NOT NULL DEFAULT 500,
    max_accuracy_meters NUMERIC NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default campus geofence
INSERT INTO public.campus_geofence_settings (id, campus_name, center_latitude, center_longitude, radius_meters, max_accuracy_meters)
VALUES ('default', 'SNS College of Technology, Coimbatore', 11.0827, 77.0185, 500, 100)
ON CONFLICT (id) DO UPDATE SET
    campus_name = EXCLUDED.campus_name,
    center_latitude = EXCLUDED.center_latitude,
    center_longitude = EXCLUDED.center_longitude,
    radius_meters = EXCLUDED.radius_meters,
    max_accuracy_meters = EXCLUDED.max_accuracy_meters,
    updated_at = now();

-- 3. Student Attendance Table
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

-- 5. Attendance & Security Audit Logs Table
CREATE TABLE IF NOT EXISTS public.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT,
    event_type TEXT NOT NULL, -- 'checkin', 'checkout', 'admin_override'
    latitude NUMERIC,
    longitude NUMERIC,
    accuracy_meters NUMERIC,
    distance_meters NUMERIC,
    is_valid BOOLEAN DEFAULT false,
    rejection_reason TEXT,
    client_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.campus_geofence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_attendance_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow reading for leaderboard and students
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_geofence_settings' AND policyname = 'Public read geofence') THEN
        CREATE POLICY "Public read geofence" ON public.campus_geofence_settings FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_geofence_settings' AND policyname = 'Admin update geofence') THEN
        CREATE POLICY "Admin update geofence" ON public.campus_geofence_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_attendance' AND policyname = 'Public read student_attendance') THEN
        CREATE POLICY "Public read student_attendance" ON public.student_attendance FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_attendance' AND policyname = 'Public insert student_attendance') THEN
        CREATE POLICY "Public insert student_attendance" ON public.student_attendance FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'student_attendance' AND policyname = 'Public update student_attendance') THEN
        CREATE POLICY "Public update student_attendance" ON public.student_attendance FOR UPDATE TO anon, authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_attendance_awards' AND policyname = 'Public read awards') THEN
        CREATE POLICY "Public read awards" ON public.daily_attendance_awards FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_attendance_awards' AND policyname = 'Public manage awards') THEN
        CREATE POLICY "Public manage awards" ON public.daily_attendance_awards FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance_logs' AND policyname = 'Public read logs') THEN
        CREATE POLICY "Public read logs" ON public.attendance_logs FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance_logs' AND policyname = 'Public insert logs') THEN
        CREATE POLICY "Public insert logs" ON public.attendance_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
END $$;

-- 7. Realtime Publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_attendance') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.student_attendance;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_attendance_awards') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_attendance_awards;
        END IF;
    END IF;
END $$;

-- 8. Haversine Distance Calculation Function (in meters)
CREATE OR REPLACE FUNCTION public.haversine_distance_meters(
    lat1 NUMERIC,
    lon1 NUMERIC,
    lat2 NUMERIC,
    lon2 NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    r NUMERIC := 6371000; -- Earth radius in meters
    phi1 NUMERIC := radians(lat1);
    phi2 NUMERIC := radians(lat2);
    delta_phi NUMERIC := radians(lat2 - lat1);
    delta_lambda NUMERIC := radians(lon2 - lon1);
    a NUMERIC;
    c NUMERIC;
BEGIN
    a := sin(delta_phi / 2.0) * sin(delta_phi / 2.0) +
         cos(phi1) * cos(phi2) *
         sin(delta_lambda / 2.0) * sin(delta_lambda / 2.0);
    c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
    RETURN ROUND(r * c, 2);
END;
$$;

-- 9. Check-in Stored Procedure with Geofence Validation
CREATE OR REPLACE FUNCTION public.record_student_checkin(
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
    v_is_verified BOOLEAN := false;
    v_existing RECORD;
    v_attendance_id UUID;
    v_response JSONB;
BEGIN
    -- 1. Fetch campus settings
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        v_settings.center_latitude := 11.0827;
        v_settings.center_longitude := 77.0185;
        v_settings.radius_meters := 500;
        v_settings.max_accuracy_meters := 100;
    END IF;

    -- 2. Calculate Distance to SNS College
    v_distance := public.haversine_distance_meters(p_lat, p_lng, v_settings.center_latitude, v_settings.center_longitude);

    -- 3. Validate GPS parameters
    IF p_accuracy > v_settings.max_accuracy_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, v_distance, false, 'Accuracy ' || p_accuracy || 'm exceeds threshold ' || v_settings.max_accuracy_meters || 'm');
        
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS accuracy too low (' || ROUND(p_accuracy, 1) || 'm). Max allowed is ' || v_settings.max_accuracy_meters || 'm. Please enable High Accuracy GPS.',
            'distance_meters', v_distance
        );
    END IF;

    IF v_distance > v_settings.radius_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, v_distance, false, 'Distance ' || v_distance || 'm is outside campus boundary (' || v_settings.radius_meters || 'm)');
        
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Location rejected: You are ' || ROUND(v_distance, 0) || 'm away from SNS College of Technology. Maximum geofence radius is ' || v_settings.radius_meters || 'm.',
            'distance_meters', v_distance
        );
    END IF;

    v_is_verified := true;

    -- 4. Check for duplicate daily check-in
    SELECT * INTO v_existing FROM public.student_attendance 
    WHERE student_id = p_student_id AND attendance_date = v_today;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Student already checked in today at ' || to_char(timezone('Asia/Kolkata', v_existing.login_at), 'HH12:MI AM'),
            'record', to_jsonb(v_existing)
        );
    END IF;

    -- 5. Record Check-in with server-generated timestamp
    INSERT INTO public.student_attendance (
        student_id, attendance_date, login_at, login_latitude, login_longitude, login_accuracy_meters, login_location_verified, status
    ) VALUES (
        p_student_id, v_today, v_now, p_lat, p_lng, p_accuracy, v_is_verified, 'checked_in'
    ) RETURNING id INTO v_attendance_id;

    -- 6. Log success
    INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
    VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, v_distance, true, 'Valid campus check-in');

    -- 7. Trigger Early Bird award recalculation for today
    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'GPS Check-in successful at SNS College of Technology campus!',
        'attendance_id', v_attendance_id,
        'login_at', v_now,
        'distance_meters', v_distance,
        'accuracy_meters', p_accuracy
    );
END;
$$;

-- 10. Check-out Stored Procedure with Geofence Validation
CREATE OR REPLACE FUNCTION public.record_student_checkout(
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
    v_is_verified BOOLEAN := false;
    v_existing RECORD;
BEGIN
    -- 1. Fetch campus settings
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        v_settings.center_latitude := 11.0827;
        v_settings.center_longitude := 77.0185;
        v_settings.radius_meters := 500;
        v_settings.max_accuracy_meters := 100;
    END IF;

    -- 2. Verify prior check-in today
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
            'reason', 'Student already checked out today at ' || to_char(timezone('Asia/Kolkata', v_existing.logout_at), 'HH12:MI AM')
        );
    END IF;

    -- 3. Calculate distance from fresh coordinates
    v_distance := public.haversine_distance_meters(p_lat, p_lng, v_settings.center_latitude, v_settings.center_longitude);

    IF p_accuracy > v_settings.max_accuracy_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, v_distance, false, 'Accuracy ' || p_accuracy || 'm exceeds threshold');
        
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS accuracy too low (' || ROUND(p_accuracy, 1) || 'm). Please improve GPS signal before check-out.'
        );
    END IF;

    IF v_distance > v_settings.radius_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, v_distance, false, 'Distance ' || v_distance || 'm is outside campus boundary');
        
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Location rejected: Check-out must be completed within SNS College of Technology boundary. Current distance: ' || ROUND(v_distance, 0) || 'm.'
        );
    END IF;

    v_is_verified := true;

    -- 4. Update attendance record with checkout
    UPDATE public.student_attendance
    SET
        logout_at = v_now,
        logout_latitude = p_lat,
        logout_longitude = p_lng,
        logout_accuracy_meters = p_accuracy,
        logout_location_verified = v_is_verified,
        status = 'completed',
        updated_at = v_now
    WHERE id = v_existing.id;

    -- 5. Log success
    INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
    VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, v_distance, true, 'Valid campus checkout');

    -- 6. Trigger Late Night Owl award recalculation
    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'GPS Check-out successful at SNS College of Technology campus!',
        'logout_at', v_now,
        'distance_meters', v_distance
    );
END;
$$;

-- 11. Recalculate Daily Attendance Awards (Early Bird & Late Night Owl)
CREATE OR REPLACE FUNCTION public.recalculate_daily_attendance_awards(p_attendance_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_early_bird RECORD;
    v_night_owl RECORD;
BEGIN
    -- A. Early Bird (Earliest valid GPS-verified check-in of the day)
    SELECT student_id, login_at
    INTO v_early_bird
    FROM public.student_attendance
    WHERE attendance_date = p_attendance_date
      AND login_location_verified = true
      AND login_at IS NOT NULL
    ORDER BY login_at ASC, student_id ASC
    LIMIT 1;

    IF FOUND THEN
        INSERT INTO public.daily_attendance_awards (
            attendance_date, category, winning_student_id, awarded_points, winning_timestamp, calculated_at, scoring_reason, status
        ) VALUES (
            p_attendance_date,
            'early_bird',
            v_early_bird.student_id,
            10,
            v_early_bird.login_at,
            now(),
            'Earliest verified campus check-in at ' || to_char(timezone('Asia/Kolkata', v_early_bird.login_at), 'HH12:MI:SS AM IST'),
            'awarded'
        ) ON CONFLICT (attendance_date, category) DO UPDATE SET
            winning_student_id = EXCLUDED.winning_student_id,
            awarded_points = EXCLUDED.awarded_points,
            winning_timestamp = EXCLUDED.winning_timestamp,
            calculated_at = now(),
            scoring_reason = EXCLUDED.scoring_reason,
            status = 'awarded';
    ELSE
        -- No eligible check-in yet
        INSERT INTO public.daily_attendance_awards (
            attendance_date, category, winning_student_id, awarded_points, winning_timestamp, calculated_at, scoring_reason, status
        ) VALUES (
            p_attendance_date, 'early_bird', NULL, 0, NULL, now(), 'No verified check-ins recorded yet for this date', 'no_winner'
        ) ON CONFLICT (attendance_date, category) DO UPDATE SET
            winning_student_id = NULL,
            awarded_points = 0,
            status = 'no_winner';
    END IF;

    -- B. Late Night Owl (Latest valid checkout strictly after 18:00 IST)
    SELECT student_id, logout_at
    INTO v_night_owl
    FROM public.student_attendance
    WHERE attendance_date = p_attendance_date
      AND login_location_verified = true
      AND logout_location_verified = true
      AND logout_at IS NOT NULL
      AND EXTRACT(HOUR FROM timezone('Asia/Kolkata', logout_at)) >= 18
    ORDER BY logout_at DESC, login_at ASC, student_id ASC
    LIMIT 1;

    IF FOUND THEN
        INSERT INTO public.daily_attendance_awards (
            attendance_date, category, winning_student_id, awarded_points, winning_timestamp, calculated_at, scoring_reason, status
        ) VALUES (
            p_attendance_date,
            'night_owl',
            v_night_owl.student_id,
            10,
            v_night_owl.logout_at,
            now(),
            'Latest verified campus checkout after 6:00 PM at ' || to_char(timezone('Asia/Kolkata', v_night_owl.logout_at), 'HH12:MI:SS AM IST'),
            'awarded'
        ) ON CONFLICT (attendance_date, category) DO UPDATE SET
            winning_student_id = EXCLUDED.winning_student_id,
            awarded_points = EXCLUDED.awarded_points,
            winning_timestamp = EXCLUDED.winning_timestamp,
            calculated_at = now(),
            scoring_reason = EXCLUDED.scoring_reason,
            status = 'awarded';
    ELSE
        INSERT INTO public.daily_attendance_awards (
            attendance_date, category, winning_student_id, awarded_points, winning_timestamp, calculated_at, scoring_reason, status
        ) VALUES (
            p_attendance_date, 'night_owl', NULL, 0, NULL, now(), 'No eligible checkouts recorded strictly after 6:00 PM IST', 'no_winner'
        ) ON CONFLICT (attendance_date, category) DO UPDATE SET
            winning_student_id = NULL,
            awarded_points = 0,
            status = 'no_winner';
    END IF;

    -- C. Sync cumulative scores across all 20 students
    PERFORM public.recalculate_all_cumulative_scores();
END;
$$;

-- 12. Recalculate Base & Cumulative Scores for all students
CREATE OR REPLACE FUNCTION public.recalculate_all_cumulative_scores()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE := (timezone('Asia/Kolkata', now()))::date;
    s RECORD;
    v_one_time_sum NUMERIC;
    v_early_count INTEGER;
    v_night_count INTEGER;
    v_att_points NUMERIC;
    v_cum_total NUMERIC;
    v_base_total NUMERIC;
    v_today_early_won BOOLEAN;
    v_today_night_won BOOLEAN;
BEGIN
    FOR s IN SELECT * FROM public.pilotstudy LOOP
        -- Sum of 9 one-time categories (excluding early_bird and night_owl from JSON)
        SELECT COALESCE(SUM((val)::numeric), 0)
        INTO v_one_time_sum
        FROM jsonb_each_text(s.category_scores) AS t(key, val)
        WHERE key NOT IN ('early_bird', 'night_owl');

        -- Count of awarded Early Birds across all history
        SELECT COUNT(*) INTO v_early_count
        FROM public.daily_attendance_awards
        WHERE category = 'early_bird' AND winning_student_id = s.id AND status = 'awarded';

        -- Count of awarded Late Night Owls across all history
        SELECT COUNT(*) INTO v_night_count
        FROM public.daily_attendance_awards
        WHERE category = 'night_owl' AND winning_student_id = s.id AND status = 'awarded';

        v_att_points := (v_early_count * 10) + (v_night_count * 10);
        v_cum_total := v_one_time_sum + v_att_points;

        -- Check today's wins for base score (single scoring period max 115)
        SELECT EXISTS (
            SELECT 1 FROM public.daily_attendance_awards
            WHERE attendance_date = v_today AND category = 'early_bird' AND winning_student_id = s.id AND status = 'awarded'
        ) INTO v_today_early_won;

        SELECT EXISTS (
            SELECT 1 FROM public.daily_attendance_awards
            WHERE attendance_date = v_today AND category = 'night_owl' AND winning_student_id = s.id AND status = 'awarded'
        ) INTO v_today_night_won;

        v_base_total := v_one_time_sum + (CASE WHEN v_today_early_won THEN 10 ELSE 0 END) + (CASE WHEN v_today_night_won THEN 10 ELSE 0 END);
        IF v_base_total > 115 THEN
            v_base_total := 115;
        END IF;

        UPDATE public.pilotstudy
        SET
            base_points = v_base_total,
            cumulative_points = v_cum_total,
            attendance_points = v_att_points,
            early_bird_count = v_early_count,
            night_owl_count = v_night_count,
            total_points = v_cum_total, -- Cumulative score used for overall pilot rankings!
            percentage = ROUND((v_base_total / 115.0) * 100.0, 1),
            updated_at = now()
        WHERE id = s.id;
    END LOOP;

    -- Recalculate cohort ranks based on cumulative total points
    WITH ranked AS (
        SELECT id, RANK() OVER (ORDER BY cumulative_points DESC, student_name ASC) as new_rank
        FROM public.pilotstudy
    )
    UPDATE public.pilotstudy p
    SET rank = r.new_rank
    FROM ranked r
    WHERE p.id = r.id;
END;
$$;
