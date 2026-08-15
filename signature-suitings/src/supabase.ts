import { createClient } from "@supabase/supabase-js";

// Load keys from Vite environment or Node process.env (with NEXT_PUBLIC_ prefix support enabled in vite.config)
const envObj = (typeof import.meta !== "undefined" && (import.meta as any).env) ? (import.meta as any).env : (typeof process !== "undefined" ? process.env : {});
const rawSupabaseUrl = envObj.NEXT_PUBLIC_SUPABASE_URL || envObj.VITE_SUPABASE_URL || "";
const supabaseAnonKey = envObj.NEXT_PUBLIC_SUPABASE_ANON_KEY || envObj.VITE_SUPABASE_ANON_KEY || "";

// Normalize the Supabase URL: strip /rest/v1 and any trailing slashes to prevent PGRST125 invalid path errors
const supabaseUrl = rawSupabaseUrl
  ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "")
  : "";

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== "https://your-supabase-project.supabase.co");

// Initialize Supabase Client
export const supabase = createClient(
  supabaseUrl || "https://placeholder-project.supabase.co", 
  supabaseAnonKey || "placeholder-anon-key"
);

// Helper to check if database setup is fully complete and active
export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.from("customers").select("id").limit(1);
    return !error;
  } catch (err) {
    console.warn("Supabase connection check failed:", err);
    return false;
  }
}

/**
 * Supabase Storage helper to upload images to the "images" bucket
 */
export async function uploadImage(file: File): Promise<string | null> {
  if (!isSupabaseConfigured) {
    console.error("Supabase is not configured yet.");
    return null;
  }

  try {
    // Make sure bucket exists or handles error
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
    const filePath = `customer_photos/${fileName}`;

    const { data, error } = await supabase.storage
      .from("images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      console.error("Error uploading image to Supabase Storage:", error);
      return null;
    }

    // Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from("images")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Unexpected error in uploadImage:", err);
    return null;
  }
}
