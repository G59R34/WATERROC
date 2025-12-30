// Session Utilities for Persistent Login
// =====================================
// This file provides utilities for managing persistent user sessions
// that survive browser restarts

/**
 * Clear all persistent session data
 */
function clearPersistentSession() {
    // Clear localStorage session data
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('employmentStatus');
    
    // Also clear sessionStorage for backward compatibility
    sessionStorage.clear();
    
    console.log('✅ Persistent session cleared');
}

/**
 * Get user role from persistent storage (checks localStorage first, then sessionStorage)
 */
function getStoredUserRole() {
    return localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
}

/**
 * Get username from persistent storage
 */
function getStoredUsername() {
    return localStorage.getItem('username') || sessionStorage.getItem('username');
}

/**
 * Get user ID from persistent storage
 */
function getStoredUserId() {
    return localStorage.getItem('userId') || sessionStorage.getItem('userId');
}

/**
 * Check if user is admin from persistent storage
 */
function getStoredIsAdmin() {
    const stored = localStorage.getItem('isAdmin') || sessionStorage.getItem('isAdmin');
    return stored === 'true' || stored === true;
}

/**
 * Restore session data from localStorage to sessionStorage for backward compatibility
 */
function restoreSessionToSessionStorage() {
    const role = localStorage.getItem('userRole');
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    const isAdmin = localStorage.getItem('isAdmin');
    const employmentStatus = localStorage.getItem('employmentStatus');
    
    if (role) sessionStorage.setItem('userRole', role);
    if (username) sessionStorage.setItem('username', username);
    if (userId) sessionStorage.setItem('userId', userId);
    if (isAdmin) sessionStorage.setItem('isAdmin', isAdmin);
    if (employmentStatus) sessionStorage.setItem('employmentStatus', employmentStatus);
}

/**
 * Check if user has a valid persistent session
 * @returns {boolean} True if session exists
 */
function hasPersistentSession() {
    const role = getStoredUserRole();
    return !!role;
}

/**
 * Handle logout - clears all session data and signs out from Supabase
 */
async function handleLogout() {
    try {
        // Sign out from Supabase
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            console.log('Signing out from Supabase...');
            await supabaseService.signOut();
        }
    } catch (error) {
        console.error('Error during Supabase logout:', error);
    }
    
    // Clear all persistent session data
    clearPersistentSession();
    
    // Redirect to login
    window.location.href = 'index.html';
}

/**
 * Check authentication and redirect if not authenticated
 * This should be called at the start of protected pages
 * @param {string} requiredRole - Required role to access the page (optional)
 * @returns {boolean} True if authenticated, false otherwise
 */
async function checkAuthentication(requiredRole = null) {
    // First check localStorage for persistent session
    const storedRole = getStoredUserRole();
    
    if (!storedRole) {
        // No session found, redirect to login
        window.location.href = 'index.html';
        return false;
    }
    
    // Restore session to sessionStorage for backward compatibility
    restoreSessionToSessionStorage();
    
    // Check Supabase session if available
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            // Supabase session expired, but we have localStorage data
            // Try to restore by checking if we can load the user
            try {
                await supabaseService.loadCurrentUser();
                const user = await supabaseService.getCurrentUser();
                if (!user) {
                    // Can't restore session, clear and redirect
                    clearPersistentSession();
                    window.location.href = 'index.html';
                    return false;
                }
            } catch (error) {
                console.error('Error restoring session:', error);
                clearPersistentSession();
                window.location.href = 'index.html';
                return false;
            }
        }
    }
    
    // Check role requirement if specified
    if (requiredRole && storedRole !== requiredRole) {
        // Role mismatch, redirect to appropriate page or login
        window.location.href = 'index.html';
        return false;
    }
    
    return true;
}

