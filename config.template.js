// Supabase Configuration
// ======================
// Copy this file to config.js and add your Supabase credentials

// ⚠️ IMPORTANT: Do NOT commit config.js to version control!
// Add config.js to your .gitignore file

// Get these values from your Supabase Dashboard:
// https://app.supabase.com/project/YOUR_PROJECT_ID/settings/api

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL_HERE';
// Example: 'https://abcdefghijklmnop.supabase.co'

const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';
// Example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// Optional: Enable or disable Supabase integration
const USE_SUPABASE = true;  // Set to false to use localStorage only

// Initialize Supabase when config is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (USE_SUPABASE && SUPABASE_URL && SUPABASE_ANON_KEY && 
        SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL_HERE') {
        supabaseService.init(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('🌊 Waterstream: Supabase mode enabled');
    } else {
        console.log('💾 Waterstream: LocalStorage mode (offline)');
    }
});
