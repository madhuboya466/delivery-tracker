/* ==========================================================================
   config.js — Supabase credentials setup
   ========================================================================== */

const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

// Use dbClient to avoid colliding with the global window.supabase SDK object
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
