// Subdomain Redirect Handler
// ==========================
// Automatically redirects emp.waterroc.com to employee portal

(function() {
    // Check if we're on the employee subdomain
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();
    
    if (hostname === 'emp.waterroc.com' || hostname.startsWith('emp.')) {
        // If not already on employee portal pages, redirect to login
        if (!pathname.includes('emp-login') && !pathname.includes('emp-portal')) {
            console.log('🔄 Redirecting to employee portal...');
            window.location.replace('/emp-login.html');
        }
    } else if (hostname === 'www.waterroc.com' || hostname === 'waterroc.com') {
        // On main domain - prevent access to emp pages
        if (pathname.includes('emp-login') || pathname.includes('emp-portal')) {
            // Redirect to main site or show access message
            console.log('⚠️ Employee portal pages should be accessed via emp.waterroc.com');
        }
    }
})();
