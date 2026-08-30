import { createClient } from "@supabase/supabase-js";

// Anon-key client only — used purely for the public score_history Realtime
// mirror (docs/HANDOFFphase5.md). No SIWE/JWT dependency here by design:
// the frontend never authenticates with Supabase directly, it just reads
// data that's already public on-chain via CreditVault.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing — score_history Realtime updates will not work."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
