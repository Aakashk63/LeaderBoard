-- ============================================================================
-- Supabase Migration: Polygon GPS-Verified Daily Attendance & Scoring System
-- Campus: SNS College of Technology, Coimbatore, Tamil Nadu, India
-- Geofence: Verified Polygon Boundary (WGS84 EPSG:4326) Enclosing SNSCT & SNS iHub
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

-- 2. Campus Geofence Settings Table with Polygon Perimeter
CREATE TABLE IF NOT EXISTS public.campus_geofence_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    campus_name TEXT NOT NULL DEFAULT 'SNS College of Technology, Coimbatore',
    center_latitude NUMERIC NOT NULL DEFAULT 11.10043,
    center_longitude NUMERIC NOT NULL DEFAULT 77.02661,
    radius_meters NUMERIC NOT NULL DEFAULT 500,
    max_accuracy_meters NUMERIC NOT NULL DEFAULT 100,
    boundary_polygon JSONB NOT NULL DEFAULT '[[77.02562, 11.10438], [77.02860, 11.10459], [77.02869, 11.10202], [77.02890, 11.10160], [77.02870, 11.09878], [77.02580, 11.09877], [77.02567, 11.10044], [77.02562, 11.10240], [77.02562, 11.10438]]'::jsonb,
    crs TEXT DEFAULT 'EPSG:4326',
    config_version TEXT DEFAULT '2.1.0',
    approved_by TEXT DEFAULT 'Campus Administrator (Aakash)',
    zones JSONB DEFAULT '[{"id":"zone-main","name":"SNSCT Main Academic Block","latitude":11.10043,"longitude":77.02661},{"id":"zone-ihub","name":"SNS iHub (Innovation & Incubation Hub)","latitude":11.10125,"longitude":77.02685},{"id":"zone-health","name":"SNS Allied Health & Physiotherapy","latitude":11.10065,"longitude":77.02805},{"id":"zone-sports","name":"North Sports Complex & Hostels","latitude":11.10380,"longitude":77.02720},{"id":"zone-south","name":"South Campus Plaza & Gate","latitude":11.09910,"longitude":77.02630}]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.campus_geofence_settings
ADD COLUMN IF NOT EXISTS boundary_polygon JSONB DEFAULT '[[77.02562, 11.10438], [77.02860, 11.10459], [77.02869, 11.10202], [77.02890, 11.10160], [77.02870, 11.09878], [77.02580, 11.09877], [77.02567, 11.10044], [77.02562, 11.10240], [77.02562, 11.10438]]'::jsonb,
ADD COLUMN IF NOT EXISTS crs TEXT DEFAULT 'EPSG:4326',
ADD COLUMN IF NOT EXISTS config_version TEXT DEFAULT '2.1.0',
ADD COLUMN IF NOT EXISTS approved_by TEXT DEFAULT 'Campus Administrator (Aakash)',
ADD COLUMN IF NOT EXISTS zones JSONB DEFAULT '[{"id":"zone-main","name":"SNSCT Main Academic Block","latitude":11.10043,"longitude":77.02661},{"id":"zone-ihub","name":"SNS iHub (Innovation & Incubation Hub)","latitude":11.10125,"longitude":77.02685},{"id":"zone-health","name":"SNS Allied Health & Physiotherapy","latitude":11.10065,"longitude":77.02805},{"id":"zone-sports","name":"North Sports Complex & Hostels","latitude":11.10380,"longitude":77.02720},{"id":"zone-south","name":"South Campus Plaza & Gate","latitude":11.09910,"longitude":77.02630}]'::jsonb;

-- Seed default campus geofence
INSERT INTO public.campus_geofence_settings (
    id, campus_name, center_latitude, center_longitude, radius_meters, max_accuracy_meters,
    boundary_polygon, crs, config_version, approved_by, zones, updated_at
) VALUES (
    'default',
    'SNS College of Technology, Coimbatore',
    11.10043,
    77.02661,
    500,
    100,
    '[[77.02562, 11.10438], [77.02860, 11.10459], [77.02869, 11.10202], [77.02890, 11.10160], [77.02870, 11.09878], [77.02580, 11.09877], [77.02567, 11.10044], [77.02562, 11.10240], [77.02562, 11.10438]]'::jsonb,
    'EPSG:4326',
    '2.1.0',
    'Campus Administrator (Aakash)',
    '[{"id":"zone-main","name":"SNSCT Main Academic Block","latitude":11.10043,"longitude":77.02661},{"id":"zone-ihub","name":"SNS iHub (Innovation & Incubation Hub)","latitude":11.10125,"longitude":77.02685},{"id":"zone-health","name":"SNS Allied Health & Physiotherapy","latitude":11.10065,"longitude":77.02805},{"id":"zone-sports","name":"North Sports Complex & Hostels","latitude":11.10380,"longitude":77.02720},{"id":"zone-south","name":"South Campus Plaza & Gate","latitude":11.09910,"longitude":77.02630}]'::jsonb,
    now()
)
ON CONFLICT (id) DO UPDATE SET
    campus_name = EXCLUDED.campus_name,
    center_latitude = EXCLUDED.center_latitude,
    center_longitude = EXCLUDED.center_longitude,
    radius_meters = EXCLUDED.radius_meters,
    max_accuracy_meters = EXCLUDED.max_accuracy_meters,
    boundary_polygon = EXCLUDED.boundary_polygon,
    crs = EXCLUDED.crs,
    config_version = EXCLUDED.config_version,
    approved_by = EXCLUDED.approved_by,
    zones = EXCLUDED.zones,
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

-- RLS Policies
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

-- 9. Point-in-Polygon (Ray Casting) Algorithm Function
CREATE OR REPLACE FUNCTION public.is_point_in_polygon(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_polygon JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_n INTEGER;
    v_inside BOOLEAN := false;
    v_i INTEGER;
    v_j INTEGER;
    v_xi NUMERIC;
    v_yi NUMERIC;
    v_xj NUMERIC;
    v_yj NUMERIC;
    v_intersect BOOLEAN;
BEGIN
    IF p_polygon IS NULL OR jsonb_array_length(p_polygon) < 3 THEN
        RETURN false;
    END IF;

    v_n := jsonb_array_length(p_polygon);
    v_j := v_n - 1;

    FOR v_i IN 0..v_n - 1 LOOP
        v_xi := (p_polygon->v_i->>0)::numeric;
        v_yi := (p_polygon->v_i->>1)::numeric;
        v_xj := (p_polygon->v_j->>0)::numeric;
        v_yj := (p_polygon->v_j->>1)::numeric;

        v_intersect := ((v_yi > p_lat) <> (v_yj > p_lat)) AND
                       (p_lng < (v_xj - v_xi) * (p_lat - v_yi) / NULLIF(v_yj - v_yi, 0) + v_xi);

        IF v_intersect THEN
            v_inside := NOT v_inside;
        END IF;

        v_j := v_i;
    END LOOP;

    RETURN v_inside;
END;
$$;

-- 10. Minimum Distance to Polygon Perimeter Function (in meters)
CREATE OR REPLACE FUNCTION public.min_distance_to_polygon_meters(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_polygon JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_n INTEGER;
    v_i INTEGER;
    v_min_dist NUMERIC := 999999;
    v_dist NUMERIC;
    v_lat_a NUMERIC;
    v_lng_a NUMERIC;
    v_lat_b NUMERIC;
    v_lng_b NUMERIC;
    
    v_cos_lat NUMERIC;
    v_m_lat NUMERIC := 111132.95;
    v_m_lng NUMERIC;
    v_px NUMERIC;
    v_py NUMERIC;
    v_bx NUMERIC;
    v_by NUMERIC;
    v_dot NUMERIC;
    v_len_sq NUMERIC;
    v_param NUMERIC;
    v_near_x NUMERIC;
    v_near_y NUMERIC;
    v_dx NUMERIC;
    v_dy NUMERIC;
BEGIN
    IF public.is_point_in_polygon(p_lat, p_lng, p_polygon) THEN
        RETURN 0;
    END IF;

    v_n := jsonb_array_length(p_polygon);
    FOR v_i IN 0..v_n - 2 LOOP
        v_lng_a := (p_polygon->v_i->>0)::numeric;
        v_lat_a := (p_polygon->v_i->>1)::numeric;
        v_lng_b := (p_polygon->(v_i + 1)->>0)::numeric;
        v_lat_b := (p_polygon->(v_i + 1)->>1)::numeric;

        v_cos_lat := cos(radians(v_lat_a));
        v_m_lng := 111412.84 * v_cos_lat;

        v_px := (p_lng - v_lng_a) * v_m_lng;
        v_py := (p_lat - v_lat_a) * v_m_lat;
        v_bx := (v_lng_b - v_lng_a) * v_m_lng;
        v_by := (v_lat_b - v_lat_a) * v_m_lat;

        v_dot := v_px * v_bx + v_py * v_by;
        v_len_sq := v_bx * v_bx + v_by * v_by;

        IF v_len_sq = 0 THEN
            v_param := 0;
        ELSE
            v_param := v_dot / v_len_sq;
        END IF;

        IF v_param < 0 THEN
            v_near_x := 0;
            v_near_y := 0;
        ELSIF v_param > 1 THEN
            v_near_x := v_bx;
            v_near_y := v_by;
        ELSE
            v_near_x := v_param * v_bx;
            v_near_y := v_param * v_by;
        END IF;

        v_dx := v_px - v_near_x;
        v_dy := v_py - v_near_y;
        v_dist := sqrt(v_dx * v_dx + v_dy * v_dy);

        IF v_dist < v_min_dist THEN
            v_min_dist := v_dist;
        END IF;
    END LOOP;

    RETURN ROUND(v_min_dist, 1);
END;
$$;

-- 11. Server-Side Location Verification RPC
CREATE OR REPLACE FUNCTION public.verify_campus_location(
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_accuracy NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings RECORD;
    v_inside BOOLEAN;
    v_distance NUMERIC;
    v_acc_pass BOOLEAN;
BEGIN
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Campus settings not configured');
    END IF;

    v_inside := public.is_point_in_polygon(p_lat, p_lng, v_settings.boundary_polygon);
    v_acc_pass := (p_accuracy <= v_settings.max_accuracy_meters);

    IF v_inside THEN
        v_distance := 0;
    ELSE
        v_distance := public.min_distance_to_polygon_meters(p_lat, p_lng, v_settings.boundary_polygon);
    END IF;

    IF NOT v_acc_pass THEN
        RETURN jsonb_build_object(
            'success', false,
            'inside', v_inside,
            'accuracy_pass', false,
            'distance_to_boundary_meters', v_distance,
            'campus_name', v_settings.campus_name,
            'message', 'GPS accuracy too low (' || ROUND(p_accuracy, 1) || 'm). Max allowed is ' || v_settings.max_accuracy_meters || 'm. Please enable High Accuracy GPS.'
        );
    END IF;

    IF NOT v_inside THEN
        RETURN jsonb_build_object(
            'success', false,
            'inside', false,
            'accuracy_pass', true,
            'distance_to_boundary_meters', v_distance,
            'campus_name', v_settings.campus_name,
            'message', 'Outside Campus Boundary: You are ' || ROUND(v_distance, 0) || 'm from approved campus premises (including SNS iHub).'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'inside', true,
        'accuracy_pass', true,
        'distance_to_boundary_meters', 0,
        'campus_name', v_settings.campus_name,
        'message', 'Location Verified inside ' || v_settings.campus_name || ' (including SNS iHub).'
    );
END;
$$;

-- 12. Check-in Stored Procedure with Polygon Geofence Validation
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
    v_is_inside BOOLEAN;
    v_existing RECORD;
    v_attendance_id UUID;
BEGIN
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        SELECT 'SNS College of Technology, Coimbatore' as campus_name,
               11.10043 as center_latitude,
               77.02661 as center_longitude,
               500 as radius_meters,
               100 as max_accuracy_meters,
               '[[77.02562, 11.10438], [77.02860, 11.10459], [77.02869, 11.10202], [77.02890, 11.10160], [77.02870, 11.09878], [77.02580, 11.09877], [77.02567, 11.10044], [77.02562, 11.10240], [77.02562, 11.10438]]'::jsonb as boundary_polygon
        INTO v_settings;
    END IF;

    -- Validate GPS accuracy
    IF p_accuracy > v_settings.max_accuracy_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, 0, false, 'Accuracy ' || p_accuracy || 'm exceeds threshold ' || v_settings.max_accuracy_meters || 'm');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS accuracy too low (' || ROUND(p_accuracy, 1) || 'm). Max allowed is ' || v_settings.max_accuracy_meters || 'm. Please enable High Accuracy GPS.'
        );
    END IF;

    -- Validate Polygon boundary (including SNS iHub)
    v_is_inside := public.is_point_in_polygon(p_lat, p_lng, v_settings.boundary_polygon);
    IF NOT v_is_inside THEN
        v_distance := public.min_distance_to_polygon_meters(p_lat, p_lng, v_settings.boundary_polygon);
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, v_distance, false, 'Distance ' || v_distance || 'm is outside campus polygon boundary');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Location rejected: You are ' || ROUND(v_distance, 0) || 'm away from SNS College of Technology boundary (including SNS iHub).',
            'distance_meters', v_distance
        );
    END IF;

    -- Check for duplicate daily check-in
    SELECT * INTO v_existing FROM public.student_attendance 
    WHERE student_id = p_student_id AND attendance_date = v_today;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Student already checked in today at ' || to_char(timezone('Asia/Kolkata', v_existing.login_at), 'HH12:MI AM'),
            'record', to_jsonb(v_existing)
        );
    END IF;

    -- Record Check-in with server-generated timestamp
    INSERT INTO public.student_attendance (
        student_id, attendance_date, login_at, login_latitude, login_longitude, login_accuracy_meters, login_location_verified, status
    ) VALUES (
        p_student_id, v_today, v_now, p_lat, p_lng, p_accuracy, true, 'checked_in'
    ) RETURNING id INTO v_attendance_id;

    -- Log success
    INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
    VALUES (p_student_id, 'checkin', p_lat, p_lng, p_accuracy, 0, true, 'Valid campus check-in (inside polygon)');

    -- Trigger Early Bird award recalculation for today
    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'GPS Check-in successful at SNS College of Technology campus!',
        'attendance_id', v_attendance_id,
        'login_at', v_now,
        'distance_meters', 0,
        'accuracy_meters', p_accuracy
    );
END;
$$;

-- 13. Check-out Stored Procedure with Polygon Geofence Validation
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
    v_is_inside BOOLEAN;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_settings FROM public.campus_geofence_settings WHERE id = 'default' LIMIT 1;
    IF NOT FOUND THEN
        SELECT 'SNS College of Technology, Coimbatore' as campus_name,
               11.10043 as center_latitude,
               77.02661 as center_longitude,
               500 as radius_meters,
               100 as max_accuracy_meters,
               '[[77.02562, 11.10438], [77.02860, 11.10459], [77.02869, 11.10202], [77.02890, 11.10160], [77.02870, 11.09878], [77.02580, 11.09877], [77.02567, 11.10044], [77.02562, 11.10240], [77.02562, 11.10438]]'::jsonb as boundary_polygon
        INTO v_settings;
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
            'reason', 'Student already checked out today at ' || to_char(timezone('Asia/Kolkata', v_existing.logout_at), 'HH12:MI AM')
        );
    END IF;

    IF p_accuracy > v_settings.max_accuracy_meters THEN
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, 0, false, 'Accuracy ' || p_accuracy || 'm exceeds threshold');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'GPS accuracy too low (' || ROUND(p_accuracy, 1) || 'm). Please improve GPS signal before check-out.'
        );
    END IF;

    v_is_inside := public.is_point_in_polygon(p_lat, p_lng, v_settings.boundary_polygon);
    IF NOT v_is_inside THEN
        v_distance := public.min_distance_to_polygon_meters(p_lat, p_lng, v_settings.boundary_polygon);
        INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
        VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, v_distance, false, 'Distance ' || v_distance || 'm is outside campus boundary');

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'Location rejected: Check-out must be completed within SNS College of Technology boundary (including SNS iHub, ' || ROUND(v_distance, 0) || 'm away).'
        );
    END IF;

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

    INSERT INTO public.attendance_logs (student_id, event_type, latitude, longitude, accuracy_meters, distance_meters, is_valid, rejection_reason)
    VALUES (p_student_id, 'checkout', p_lat, p_lng, p_accuracy, 0, true, 'Valid campus checkout');

    PERFORM public.recalculate_daily_attendance_awards(v_today);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'GPS Check-out successful at SNS College of Technology campus!',
        'logout_at', v_now,
        'distance_meters', 0
    );
END;
$$;

-- 14. Recalculate Daily Attendance Awards (Early Bird & Late Night Owl)
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
    SELECT a.student_id, a.login_at
    INTO v_early_bird
    FROM public.student_attendance a
    JOIN public.pilotstudy p ON a.student_id = p.id
    WHERE a.attendance_date = p_attendance_date
      AND a.login_location_verified = true
      AND a.login_at IS NOT NULL
      AND a.student_id <> 'std-dummy'
      AND (p.is_test_account IS NULL OR p.is_test_account = false)
    ORDER BY a.login_at ASC, a.student_id ASC
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
    SELECT a.student_id, a.logout_at
    INTO v_night_owl
    FROM public.student_attendance a
    JOIN public.pilotstudy p ON a.student_id = p.id
    WHERE a.attendance_date = p_attendance_date
      AND a.login_location_verified = true
      AND a.logout_location_verified = true
      AND a.logout_at IS NOT NULL
      AND EXTRACT(HOUR FROM timezone('Asia/Kolkata', a.logout_at)) >= 18
      AND a.student_id <> 'std-dummy'
      AND (p.is_test_account IS NULL OR p.is_test_account = false)
    ORDER BY a.logout_at DESC, a.login_at ASC, a.student_id ASC
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

    PERFORM public.recalculate_all_cumulative_scores();
END;
$$;

-- 15. Recalculate Base & Cumulative Scores for all students
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
        SELECT COALESCE(SUM((val)::numeric), 0)
        INTO v_one_time_sum
        FROM jsonb_each_text(s.category_scores) AS t(key, val)
        WHERE key NOT IN ('early_bird', 'night_owl');

        SELECT COUNT(*) INTO v_early_count
        FROM public.daily_attendance_awards
        WHERE category = 'early_bird' AND winning_student_id = s.id AND status = 'awarded';

        SELECT COUNT(*) INTO v_night_count
        FROM public.daily_attendance_awards
        WHERE category = 'night_owl' AND winning_student_id = s.id AND status = 'awarded';

        v_att_points := (v_early_count * 10) + (v_night_count * 10);
        v_cum_total := v_one_time_sum + v_att_points;

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
            total_points = v_cum_total,
            percentage = ROUND((v_base_total / 115.0) * 100.0, 1),
            updated_at = now()
        WHERE id = s.id;
    END LOOP;

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
