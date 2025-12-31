// Employee-only login for emp.waterroc.com
document.addEventListener('DOMContentLoaded', async function () {
    'use strict';

    const form = document.getElementById('empLoginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMe = document.getElementById('rememberMe');
    const submitBtn = document.getElementById('submitBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const errorMessage = document.getElementById('errorMessage');

    function showError(message) {
        if (!errorMessage) return;
        errorMessage.textContent = message || 'Login failed. Please try again.';
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 6000);
    }

    function setLoading(isLoading) {
        if (loadingOverlay) loadingOverlay.style.display = isLoading ? 'flex' : 'none';
        if (submitBtn) {
            submitBtn.disabled = isLoading;
            submitBtn.textContent = isLoading ? 'Logging in...' : 'Login';
        }
    }

    async function resolveEmail(identifier) {
        const value = (identifier || '').trim();
        if (!value) return '';

        // Email entered directly
        if (value.includes('@')) return value;

        // Username: look up email from users table
        try {
            const { data, error } = await supabaseService.client
                .from('users')
                .select('email')
                .eq('username', value)
                .maybeSingle();

            if (!error && data?.email) return data.email;
        } catch (e) {
            // ignore and fallback
        }

        // Fallback used elsewhere in repo (keeps auth flow consistent)
        return `${value}@waterstream.local`;
    }

    async function enforceEmployeeAccess() {
        // Must have valid session and a linked active employee profile
        const session = await supabaseService.getSession();
        if (!session?.user) return { ok: false, reason: 'no_session' };

        // Map auth user -> app users table
        const { data: userRow, error: userErr } = await supabaseService.client
            .from('users')
            .select('id')
            .eq('auth_id', session.user.id)
            .single();

        if (userErr || !userRow?.id) return { ok: false, reason: 'no_user_row' };

        // Map user -> employee row
        const { data: employeeRow, error: empErr } = await supabaseService.client
            .from('employees')
            .select('id')
            .eq('user_id', userRow.id)
            .single();

        if (empErr || !employeeRow?.id) return { ok: false, reason: 'no_employee_row' };

        // Employment status gate
        const { data: profileRow } = await supabaseService.client
            .from('employee_profiles')
            .select('employment_status')
            .eq('employee_id', employeeRow.id)
            .maybeSingle();

        const status = profileRow?.employment_status || 'active';
        sessionStorage.setItem('employmentStatus', status);

        if (status === 'terminated') return { ok: false, reason: 'terminated' };
        if (status === 'administrative_leave') return { ok: false, reason: 'administrative_leave' };
        if (status === 'extended_leave') return { ok: false, reason: 'extended_leave' };

        return { ok: true };
    }

    // If already logged in, go straight to tasks
    try {
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const session = await supabaseService.getSession();
            if (session?.user) {
                sessionStorage.setItem('userRole', 'employee');
                window.location.href = '/emp/';
                return;
            }
        }
    } catch (e) {
        // ignore
    }

    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (rememberMe && rememberMe.checked) {
            localStorage.setItem('rememberLogin', 'true');
        }

        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            showError('Supabase is not configured. Please contact an administrator.');
            return;
        }

        const identifier = usernameInput?.value || '';
        const password = passwordInput?.value || '';

        try {
            setLoading(true);

            const email = await resolveEmail(identifier);
            const { error } = await supabaseService.signIn(email, password);
            if (error) throw new Error(error);

            // Link browser instance to user (if in Electron)
            try {
                const session = await supabaseService.getSession();
                if (session?.user?.id && typeof require !== 'undefined') {
                    const { ipcRenderer } = require('electron');
                    if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
                        console.log('Linking browser instance to user:', session.user.id);
                        await ipcRenderer.invoke('supabase-link-instance-to-user', session.user.id);
                        console.log('✅ Browser instance linked to user');
                    }
                }
            } catch (e) {
                console.log('Could not link browser instance (not in Electron or error):', e);
            }

            const gate = await enforceEmployeeAccess();
            if (!gate.ok) {
                await supabaseService.signOut();
                sessionStorage.clear();
                if (gate.reason === 'extended_leave') {
                    window.location.href = '/extended-leave.html';
                    return;
                }
                if (gate.reason === 'terminated') throw new Error('Access denied. Your employment has been terminated.');
                if (gate.reason === 'administrative_leave') throw new Error('Access denied. You are on administrative leave.');
                throw new Error('Access denied. Your account is not linked to an active employee profile.');
            }

            // Mark as employee for client-side gating used in existing pages
            sessionStorage.setItem('userRole', 'employee');

            // Optional: store username for convenience
            sessionStorage.setItem('username', identifier.trim());

            window.location.href = '/emp/';
        } catch (err) {
            console.error('Employee portal login error:', err);
            showError(err?.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    });
});

