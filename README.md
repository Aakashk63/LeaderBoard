# Student Leaderboard & System Design Lab • Pilot Study Program

A high-performance, real-time desktop and mobile web dashboard for the **SNS College of Technology** Student Pilot Study Program.

Built with **Vite, Vanilla JavaScript, CSS Design System, and Supabase Real-Time Database & Auth**.

---

## 🌟 Key Features

### 1. Dedicated Standalone Sign-In Page
- **Clean Gateway Screen**: Unauthenticated visitors cannot view private scoring details or the student attendance dashboard before authentication.
- **Identity Confirmation**: Requires matching **Full Name** against the official cohort record (`public.pilotstudy`).
- **Role-Based Authentication**:
  - **Student Sign-In**: Requires full name confirmation, email, password, and mandatory campus GPS verification.
  - **Mentor / Administrator**: Unlocks the **Admin Console** and score editing capabilities for evaluating students across the 9 non-attendance categories.

### 2. Mandatory Real Hardware GPS Verification Gate (Polygon Geofencing)
- Real-time hardware geolocation check before student sign-in is unlocked.
- **Configurable Polygon Geofencing**: Deterministic Point-in-Polygon (Ray Casting) algorithm covering the entire verified campus premises of **SNS College of Technology, Coimbatore, Tamil Nadu, India** ([Google Maps Campus Location](https://maps.app.goo.gl/2GuhwjVg8nN8zWeRA)):
  - **Verified Campus Perimeter**: 9-vertex closed polygon enclosing SNSCT Main Academic Blocks, **SNS iHub (Innovation & Incubation Hub)**, College of Allied Health Sciences, College of Physiotherapy, Mechanical blocks, Sports complex, and North hostel blocks.
  - **Coordinate Reference System**: `EPSG:4326 (WGS84)`
  - **Permitted GPS Accuracy Threshold**: `< 100 meters`
  - **Nearest Boundary Projection**: Students outside the perimeter are provided precise distance to the nearest campus boundary rather than arbitrary distance from a single center point.
  - **Admin Boundary Management Console**: Authorized administrators can inspect, validate, edit, and test arbitrary GPS coordinates against the boundary polygon with live feedback.
  - **Timezone**: `Asia/Kolkata`
- 11 explicit verification states: `idle`, `requesting_permission`, `fetching_location`, `validating_location`, `verified`, `location_disabled`, `permission_denied`, `gps_timeout`, `inaccurate_location`, `outside_campus`, `verification_failed`.
- Strict real hardware GPS enforcement: No mock GPS, simulated coordinates, or desktop bypasses allowed in attendance.
- Dedicated **Dummy Student Account for Testing**:
  - Email: `dummy@gmail.com`
  - Password: `12345678`
  - Display Name: `Dummy Student`
  - Subject to identical strict real GPS geofence checks (no special bypass), identifiable as a test account, and excluded from official student awards.

### 3. Authoritative Daily Attendance Scoring
- **Early Bird (+10 pts)**: Awarded automatically to the first valid GPS-verified check-in of the day in `Asia/Kolkata` timezone.
- **Late Night Owl (+10 pts)**: Awarded to the latest eligible student checkout strictly after **6:00 PM IST (18:00)** with fresh GPS verification.
- **Dedicated Check Out & Logout**: Secure checkout requiring fresh physical presence on campus.

### 4. Mentor-Only Evaluation Scoring
- **Protected Categories**: The 9 core categories remain editable exclusively by authorized mentors:
  1. LeetCode Champion
  2. Best Empathizer
  3. Hands-on Planner (Workbench)
  4. Visual Treater (Frontend)
  5. Journalizer (DT Playbook)
  6. Assessment Cracker
  7. OKR Finalizer
  8. All-Round Performer
  9. Best Team Lead
- **Student View**: Students can view their breakdown and ranks, but editing controls and database writes are locked to authorized staff.

### 5. Interactive System Design Lab
- **Caching Simulation**: Redis-like in-memory caching visualizer showing cache hits, misses, and DB offloading.
- **Load Balancing Simulation**: Visualizes traffic distribution algorithms (Round Robin, Least Connections, Random) across multiple backend server replicas.

### 6. Full Mobile Responsiveness
- Optimized for desktops, laptops, tablets, and smartphones (320px – 768px+).
- Dynamic 3D top-three podium with smooth responsive scaling.
- Touch-friendly controls, horizontal scrollable tab pills, and compact table wrappers.

---

## 🗄️ Supabase Database Setup

All migration scripts are located in the `supabase/migrations/` directory:

1. `20261027_create_pilotstudy_table.sql`: Pilot study table and student seed data.
2. `20261028_gps_attendance_and_scoring.sql`: Attendance tracking, campus geofence, and daily awards tables.
3. `20261028_student_auth_profiles.sql`: Auth user profile mappings, RLS security policies, and server-side verification functions.

### Quick Database Deployment
Run the consolidated SQL script in your **Supabase Dashboard -> SQL Editor**:
- Creates `pilotstudy`, `student_attendance`, `daily_attendance_awards`, `campus_geofence_settings`, `student_auth_profiles`, and audit tables.
- Enables Row Level Security (RLS) policies.

---

## 🚀 Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Run Polygon Geofence Test Suite (All 9 Scenarios)
npm test

# 4. Build for production
npm run build

# 5. Preview production build
npm run preview
```

---

## ☁️ Deploy to Vercel

This repository includes a `vercel.json` configuration configured for single-page application routing.

1. Import this repository in [Vercel](https://vercel.com).
2. Set Environment Variables in Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Click **Deploy**.
