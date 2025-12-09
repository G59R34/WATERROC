// Supabase Configuration
// ======================
// This is a placeholder config file for testing
// Copy config.template.js to config.js and add your real credentials

// Running in offline mode by default
// Set USE_SUPABASE to true and add your credentials to enable Supabase

const SUPABASE_URL = 'https://vljpzzriayjjbiulkvfu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsanB6enJpYXlqamJpdWxrdmZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNDMzMTUsImV4cCI6MjA4MDgxOTMxNX0.zW90icn-QeowKdTPIgLyjzTh7WWi8x8XByLKN8MaOoM';
const USE_SUPABASE = true;

// Initialize if Supabase is configured
document.addEventListener('DOMContentLoaded', function() {
    if (USE_SUPABASE && SUPABASE_URL && SUPABASE_ANON_KEY) {
        if (typeof supabaseService !== 'undefined') {
            supabaseService.init(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('🌊 Waterstream: Supabase mode enabled');
        }
    } else {
        console.log('💾 Waterstream: LocalStorage mode (offline)');
    }
});
