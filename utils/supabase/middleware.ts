import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iridkxcusdcwqgtytspg.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_E8QXnrStdwmwIAFtt_c2RQ_We3OAfRx";

export const createClient = (request: any) => {
  let supabaseResponse = {
    headers: new Headers(),
    cookies: request.cookies
  };

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll?.() || []
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set?.(name, value))
        },
      },
    },
  );

  return supabaseResponse;
};
