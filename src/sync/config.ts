/**
 * Sync configuration, injected at build time via Vite env variables:
 *   VITE_SUPABASE_URL              https://<project>.supabase.co
 *   VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_…  (safe to ship; RLS protects the data)
 *
 * Plans, prices and checkout links come from the database (public.plans).
 *
 * Without URL + key the whole account/sync feature stays hidden and the app
 * works exactly as before (offline-first, no server dependency).
 */
export const syncConfig = {
    url: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '',
    publishableKey: (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '',
};

export const isSyncConfigured = (): boolean => Boolean(syncConfig.url && syncConfig.publishableKey);
