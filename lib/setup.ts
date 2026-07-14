export function hasConfiguredSupabasePublicEnv(params: {
  url: string;
  anonKey: string;
}) {
  return !(
    params.url === "https://example.supabase.co" ||
    params.anonKey === "placeholder-anon-key"
  );
}
