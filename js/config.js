/* ==========================================================================
   config.js — Supabase credentials setup
   ========================================================================== */

const SUPABASE_URL = 'https://qyqrcseivqcmrummyrto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5cXJjc2VpdnFjbXJ1bW15cnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Njk1MDUsImV4cCI6MjEwMDQ0NTUwNX0.6JKUDvQcUux4M8ulp5L5Cc8zBkWBnpTv9xKN1YTF8ho';

// Use dbClient to avoid colliding with the global window.supabase SDK object
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);