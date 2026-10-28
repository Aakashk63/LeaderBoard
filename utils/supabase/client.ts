import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || (import.meta as any)?.env?.VITE_SUPABASE_URL || "https://iridkxcusdcwqgtytspg.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || (import.meta as any)?.env?.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_E8QXnrStdwmwIAFtt_c2RQ_We3OAfRx";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );
