/**
 * Shared image library + optional photo-search API keys.
 *
 * Setup:
 * 1. Create a free project at https://supabase.com
 * 2. Run supabase/schema.sql in the SQL Editor
 * 3. Copy this file to config.js and fill in your project URL + anon key
 * 4. (Optional) Add free API keys so the image picker can search Unsplash / Pexels / Pixabay
 * 5. Deploy config.js with the site
 *
 * The anon key is designed to be public when RLS policies are set correctly.
 * Photo API keys in the browser are visible to users — use free tiers / restrict by domain
 * where the provider allows it. Wikimedia + Openverse work with no keys.
 */
window.IMAGE_LIBRARY_CONFIG = {
  // Project Settings → API → Project URL
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  // Project Settings → API → anon public key
  supabaseAnonKey: 'YOUR_ANON_KEY',
  // Table name from schema.sql
  table: 'german_word_images',
};

/**
 * Optional keys for legal bulk photo sources (used in the picture picker).
 * Leave blank to use only free no-key sources: Wikimedia Commons + Openverse.
 *
 * - Unsplash: https://unsplash.com/developers  (Access Key)
 * - Pexels:   https://www.pexels.com/api/      (API Key)
 * - Pixabay:  https://pixabay.com/api/docs/    (API Key)
 */
window.IMAGE_SEARCH_CONFIG = {
  unsplashAccessKey: '',
  pexelsApiKey: '',
  pixabayApiKey: '',
};
