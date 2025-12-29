// Employee subdomain login (emp.waterroc.com)
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const form = document.getElementById('empLoginForm');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const submitBtn = document.getElementById('submitBtn');
    const rememberMeEl = document.getElementById('rememberMe');
    const errorEl = document.getElementById('errorMessage');

    function showError(message) {
        if (!errorEl) return;
        errorEl.textContent = message || 'Login failed. Please try again.';
        errorEl.style.display = 'block';
    }

    function clearError() {
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    function setLoading(isLoading, text = 'Logging in...') {
        if (!submitBtn) return;
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? text : 'Login';
    }

    async function waitForSupabaseReady() {
        const maxAttempts = 60;
        for (let i = 0; i < maxAttempts; i++) {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) return true;
            // config.js initializes on DOMContentLoaded; allow time for that to run
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }

    async function resolveEmail(usernameOrEmail) {
        const input = (usernameOrEmail || '').trim();
        if (!input) return null;
        if (input.includes('@')) return input;

        // Attempt lookup from users table
        try {
            const { data, error } = await supabaseService.client
                .from('users')
                .select('email')
                .eq('username', input)
                .maybeSingle();

            if (!error && data?.email) return data.email;
        } catch (e) {
            // ignore and fallback
        }

        // Fallback used elsewhere in the app (legacy/demo style)
        return `${input}@waterstream.local`;
    }

    async function enforceEmployeeOnlyAccess() {
        // Require linked employee record
        const user = await supabaseService.getCurrentUser();
        if (!user) {
            throw new Error('Unable to load user profile. Please try again.');
        }

        if (user.is_admin === true) {
            await supabaseService.signOut();
            throw new Error('Employee portal is for employees only. Admins must use the main portal.');
        }

        const employee = await supabaseService.getCurrentEmployee();
        if (!employee) {
            await supabaseService.signOut();
            throw new Error('Your account is not linked to an employee record. Please contact an administrator.');
        }

        // Check employment status
        const { data: profile, error: profileError } = await supabaseService.client
            .from('employee_profiles')
            .select('employment_status')
            .eq('employee_id', employee.id)
            .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
            console.warn('Error reading employee profile status:', profileError);
        }

        const employmentStatus = profile?.employment_status || 'active';

        if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
            await supabaseService.signOut();
            throw new Error('Your access has been revoked. Please contact an administrator.');
        }

        if (employmentStatus === 'extended_leave') {
            sessionStorage.setItem('employmentStatus', 'extended_leave');
            sessionStorage.setItem('userRole', 'employee');
            window.location.href = '/extended-leave.html';
            return null;
        }

        // Store minimal session hints (per-origin)
        sessionStorage.setItem('userRole', 'employee');
        sessionStorage.setItem('employmentStatus', employmentStatus);
        sessionStorage.setItem('userId', user.id);
        sessionStorage.setItem('username', user.username || '');

        if (rememberMeEl?.checked) {
            localStorage.setItem('rememberLogin', 'true');
        }

        return { user, employee };
    }

    async function redirectIfAlreadyLoggedIn() {
        const ready = await waitForSupabaseReady();
        if (!ready) return;

        const session = await supabaseService.getSession();
        if (!session) return;

        try {
            await supabaseService.loadCurrentUser();
            const ok = await enforceEmployeeOnlyAccess();
            if (ok) {
                window.location.href = './index.html';
            }
        } catch (e) {
            // If the session is invalid for this portal, leave them on login
            console.warn('Existing session not usable for employee portal:', e);
        }
    }

    redirectIfAlreadyLoggedIn();

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();
        setLoading(true);

        const ready = await waitForSupabaseReady();
        if (!ready) {
            setLoading(false);
            showError('Connection error: Supabase did not initialize. Please refresh and try again.');
            return;
        }

        const usernameOrEmail = (usernameEl?.value || '').trim();
        const password = passwordEl?.value || '';

        try {
            const email = await resolveEmail(usernameOrEmail);
            if (!email) throw new Error('Please enter your username or email.');
            if (!password) throw new Error('Please enter your password.');

            const { error } = await supabaseService.signIn(email, password);
            if (error) throw new Error(error);

            await supabaseService.loadCurrentUser();
            const ok = await enforceEmployeeOnlyAccess();
            if (!ok) return; // redirected (extended leave)

            window.location.href = './index.html';
        } catch (err) {
            showError(err?.message || String(err));
        } finally {
            setLoading(false);
        }
    });
});

