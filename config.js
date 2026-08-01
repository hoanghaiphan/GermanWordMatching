/**
 * Shared image library config (Supabase).
 *
 * Setup:
 * 1. Create a free project at https://supabase.com
 * 2. Run supabase/schema.sql in the SQL Editor
 * 3. Copy config.example.js → config.js and fill in your project URL + anon key
 * 4. Deploy config.js with the site (anon key is safe for browser use with RLS)
 *
 * Until keys are filled in, the game still works with live Wikimedia/Openverse search;
 * Save to shared library will explain that the library is not configured.
 */
window.IMAGE_LIBRARY_CONFIG = {
  // Project Settings → API → Project URL
  supabaseUrl: 'https://fcfezpjvmkvtwmqkrbdo.supabase.co',
  // Project Settings → API → anon public key
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZmV6cGp2bWt2dHdtcWtyYmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MjMzOTIsImV4cCI6MjEwMDQ5OTM5Mn0.-b4j1esqduAS9UY_VPbHIAfwWPwxf1aayV4ZL8U6CBA',
  // Table names from schema.sql
  table: 'german_word_images',
  readingsTable: 'german_shared_readings',
  wordSetsTable: 'german_shared_word_sets',
};

/**
 * Optional keys for legal bulk photo sources (used in the picture picker).
 * Leave blank to use only free no-key sources: Wikimedia Commons + Openverse.
 * Get free keys: unsplash.com/developers · pexels.com/api · pixabay.com/api/docs
 */
window.IMAGE_SEARCH_CONFIG = {
  unsplashAccessKey: '',
  pexelsApiKey: '',
  pixabayApiKey: '',
};
