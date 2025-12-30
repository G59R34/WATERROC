// Login Script with Supabase Authentication

// ADDED: Audio playback for successful login
let loginAudio = null;
function getLoginAudio() {
    if (!loginAudio) {
        loginAudio = new Audio('login.wav');
        loginAudio.volume = 0.7; // Set volume to 70%
        loginAudio.preload = 'auto';
    }
    return loginAudio;
}

function playLoginSound() {
    return new Promise((resolve) => {
        try {
            const audio = getLoginAudio();
            audio.currentTime = 0; // Reset to start
            
            // Wait for audio to finish playing before resolving, but with a timeout
            const onEnded = () => {
                audio.removeEventListener('ended', onEnded);
                clearTimeout(timeoutId);
                resolve();
            };
            audio.addEventListener('ended', onEnded);
            
            // FIXED: Add timeout to prevent infinite waiting if audio fails
            const timeoutId = setTimeout(() => {
                audio.removeEventListener('ended', onEnded);
                console.log('Login sound timeout - proceeding with redirect');
                resolve(); // Resolve after max 3 seconds even if audio hasn't finished
            }, 3000); // Max 3 second wait
            
            audio.play().catch(error => {
                console.log('Could not play login sound:', error);
                // If audio can't play, resolve immediately
                clearTimeout(timeoutId);
                audio.removeEventListener('ended', onEnded);
                resolve();
            });
        } catch (error) {
            console.log('Error playing login sound:', error);
            resolve(); // Resolve immediately on error
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        console.error('Login form not found!');
        return;
    }
    
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('fullName');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('role');
    const formTitle = document.getElementById('formTitle');
    const submitBtn = document.getElementById('submitBtn');
    const toggleSignup = document.getElementById('toggleSignup');
    const emailGroup = document.getElementById('emailGroup');
    const fullNameGroup = document.getElementById('fullNameGroup');
    const roleGroup = document.getElementById('roleGroup');
    const mobileEmployeeMode = document.getElementById('mobileEmployeeMode');
    const useFullEmployeeDashboard = document.getElementById('useFullEmployeeDashboard');
    const mobileRoleSwitch = document.getElementById('mobileRoleSwitch');
    const mobileRoleMoreBtn = document.getElementById('mobileRoleMore');
    const mobileRoleHint = document.getElementById('mobileRoleHint');
    
    // Check if required elements exist
    if (!usernameInput || !passwordInput || !roleSelect || !submitBtn) {
        console.error('Required login form elements not found!');
        return;
    }
    
    let isSignupMode = false;

    // ==========================================
    // MOBILE DEFAULTS: employee tasks portal
    // ==========================================
    const isMobileDevice = (() => {
        const byUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const byViewport = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        return Boolean(byUA || byViewport);
    })();

    const urlParams = new URLSearchParams(window.location.search || '');
    const urlRole = (urlParams.get('role') || '').trim().toLowerCase();

    function getEmployeePortalModeFromUI() {
        // mobile_tasks => /emp/index.html (tasks-only)
        // full_employee => /employee.html (full dashboard)
        return useFullEmployeeDashboard && useFullEmployeeDashboard.checked ? 'full_employee' : 'mobile_tasks';
    }

    function setMobileRoleHint(text) {
        if (!mobileRoleHint) return;
        if (!text) {
            mobileRoleHint.textContent = '';
            mobileRoleHint.style.display = 'none';
            return;
        }
        mobileRoleHint.textContent = text;
        mobileRoleHint.style.display = 'block';
    }

    function markActiveRoleButton(role) {
        if (!mobileRoleSwitch) return;
        const buttons = mobileRoleSwitch.querySelectorAll('.role-switch-btn');
        buttons.forEach((btn) => {
            const btnRole = (btn.getAttribute('data-role') || '').trim().toLowerCase();
            if (btnRole === role) btn.classList.add('is-active');
            else btn.classList.remove('is-active');
        });
    }

    function setSelectedRole(role, { fromUI = false } = {}) {
        const nextRole = (role || '').trim().toLowerCase();
        if (!nextRole) return;
        if (roleSelect) roleSelect.value = nextRole;

        // Mobile UX: hide the full role dropdown unless user asks for it,
        // but allow switching to admin quickly.
        if (isMobileDevice) {
            if (nextRole === 'employee') {
                if (roleGroup) roleGroup.style.display = 'none';
                if (mobileEmployeeMode) mobileEmployeeMode.style.display = 'block';
                setMobileRoleHint('Employee login defaults to the fast mobile tasks view.');
            } else {
                if (mobileEmployeeMode) mobileEmployeeMode.style.display = 'none';
                // Keep the dropdown hidden unless "More roles…" was opened;
                // admins can still log in via this quick switch.
                setMobileRoleHint(nextRole === 'admin' ? 'Admin login will open the admin dashboard.' : '');
            }
            markActiveRoleButton(nextRole);
        }

        // Persist last selection for convenience (safe across refresh)
        if (fromUI) {
            try {
                localStorage.setItem('lastLoginRole', nextRole);
            } catch (e) {
                // ignore
            }
        }
    }

    function applyMobileDefaults() {
        if (!isMobileDevice) return;

        // Show quick portal picker on mobile
        if (mobileRoleSwitch) mobileRoleSwitch.style.display = 'grid';
        // Hide the full role dropdown by default (can be opened via "More roles…")
        if (roleGroup) roleGroup.style.display = 'none';

        // Default to employee on mobile, unless URL explicitly requests a role
        // (e.g., ?role=admin) or user previously selected a role.
        let preferred = 'employee';
        try {
            const stored = (localStorage.getItem('lastLoginRole') || '').trim().toLowerCase();
            if (stored) preferred = stored;
        } catch (e) {
            // ignore
        }
        if (urlRole) preferred = urlRole;

        setSelectedRole(preferred);

        // Persist preference across visits (mobile only)
        const saved = localStorage.getItem('empPreferFullDashboard');
        if (useFullEmployeeDashboard && saved !== null) {
            useFullEmployeeDashboard.checked = saved === 'true';
        }

        // Note: employeePortalMode is no longer used - always redirects to employee.html
    }

    function wireMobileModeToggle() {
        if (!isMobileDevice) return;
        if (!useFullEmployeeDashboard) return;

        useFullEmployeeDashboard.addEventListener('change', () => {
            // Save preference for UI, but redirect always goes to employee.html
            localStorage.setItem('empPreferFullDashboard', useFullEmployeeDashboard.checked ? 'true' : 'false');
        });
    }

    applyMobileDefaults();
    wireMobileModeToggle();

    // Mobile role switch wiring
    if (isMobileDevice && mobileRoleSwitch) {
        mobileRoleSwitch.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;

            const roleBtn = target.closest('.role-switch-btn');
            if (roleBtn) {
                const role = (roleBtn.getAttribute('data-role') || '').trim().toLowerCase();
                if (role) {
                    setSelectedRole(role, { fromUI: true });
                    // When switching via quick buttons, keep the "More roles" dropdown closed.
                    if (roleGroup) roleGroup.style.display = 'none';
                    if (mobileRoleMoreBtn) mobileRoleMoreBtn.setAttribute('aria-expanded', 'false');
                }
                return;
            }

            const moreBtn = target.closest('#mobileRoleMore');
            if (moreBtn) {
                const isOpen = roleGroup && roleGroup.style.display !== 'none';
                const nextOpen = !isOpen;
                if (roleGroup) roleGroup.style.display = nextOpen ? 'block' : 'none';
                if (mobileRoleMoreBtn) mobileRoleMoreBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
                return;
            }
        });
    }

    // If user opens "More roles…" and changes the role dropdown, keep mobile UI in sync.
    if (isMobileDevice && roleSelect) {
        roleSelect.addEventListener('change', () => {
            setSelectedRole(roleSelect.value, { fromUI: true });
        });
    }
    
    // Toggle between login and signup
    if (toggleSignup) {
        toggleSignup.addEventListener('click', function(e) {
        e.preventDefault();
        isSignupMode = !isSignupMode;
        
        if (isSignupMode) {
            formTitle.textContent = 'Sign Up';
            submitBtn.textContent = 'Sign Up';
            toggleSignup.textContent = 'Sign In';
            toggleSignup.parentElement.innerHTML = '<p>Already have an account? <a href="#" id="toggleSignup">Sign In</a></p>';
            usernameInput.parentElement.querySelector('label').textContent = 'Username';
            emailGroup.style.display = 'block';
            fullNameGroup.style.display = 'block';
            emailInput.required = true;
            fullNameInput.required = true;
        } else {
            formTitle.textContent = 'Sign In';
            submitBtn.textContent = 'Login';
            toggleSignup.textContent = 'Sign Up';
            toggleSignup.parentElement.innerHTML = '<p>Don\'t have an account? <a href="#" id="toggleSignup">Sign Up</a></p>';
            usernameInput.parentElement.querySelector('label').textContent = 'Username or Email';
            emailGroup.style.display = 'none';
            fullNameGroup.style.display = 'none';
            emailInput.required = false;
            fullNameInput.required = false;
        }
        
        // Re-attach event listener
        const newToggle = document.getElementById('toggleSignup');
        if (newToggle) {
            newToggle.addEventListener('click', arguments.callee);
        }
    });
    }
    
    // Check if already logged in (simple session check - no persistent storage)
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (session && sessionStorage.getItem('userRole')) {
            await supabaseService.loadCurrentUser();
            const user = await supabaseService.getCurrentUser();
            if (user) {
                // Check employment status before allowing access
                const employee = await supabaseService.getCurrentEmployee();
                const { data: profile } = employee
                    ? await supabaseService.client
                        .from('employee_profiles')
                        .select('employment_status')
                        .eq('employee_id', employee.id)
                        .maybeSingle()
                    : { data: null };

                const employmentStatus = profile?.employment_status || 'active';
                
                if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
                    await supabaseService.signOut();
                    sessionStorage.clear();
                    alert('Your account access has been revoked. Please contact an administrator.');
                    return;
                }
                
                if (employmentStatus === 'extended_leave') {
                    await playLoginSound();
                    window.location.href = 'extended-leave.html';
                    return;
                }
                
                const storedRole = sessionStorage.getItem('userRole');
                await redirectToApp(user.is_admin, storedRole);
                return;
            }
        }
    }
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loginProgress = document.getElementById('loginProgress');
        const submitBtn = document.getElementById('submitBtn');
        
        // Show loading indicators immediately (no delay)
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (loginProgress) loginProgress.style.display = 'block';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }
        
        // DISABLED: Fake loading screen was blocking login
        // if (typeof showFormLoadingScreen !== 'undefined') {
        //     showFormLoadingScreen('login');
        // }
        
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const fullName = fullNameInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;

        // Store which employee page to open (all devices).
        // Note: Always redirects to employee.html, preference saved for UI only
        if (role === 'employee') {
            try {
                localStorage.setItem('empPreferFullDashboard', useFullEmployeeDashboard?.checked ? 'true' : 'false');
            } catch (e) {
                // ignore
            }
        }
        
        // LOGIC: Session storage for theme preference and remember me
        const rememberMe = document.getElementById('rememberMe');
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem('rememberLogin', 'true');
        }
        
        try {
            if (isSignupMode) {
                // Handle signup
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    await handleSupabaseSignup(username, email, fullName, password, role);
                } else {
                    throw new Error('Signup requires Supabase to be configured. Please use offline demo mode for testing.');
                }
            } else {
                // Handle login
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    await handleSupabaseLogin(username, password, role);
                } else {
                    handleOfflineLogin(username, password, role);
                }
            }
        } catch (error) {
            // ADDED UI: Show error message
            const errorMsg = document.getElementById('errorMessage');
            if (errorMsg) {
                errorMsg.textContent = error.message || 'Login failed. Please try again.';
                errorMsg.style.display = 'block';
                setTimeout(() => {
                    errorMsg.style.display = 'none';
                }, 5000);
            }
        } finally {
            // Hide loading indicators
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            if (loginProgress) loginProgress.style.display = 'none';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = isSignupMode ? 'Sign Up' : 'Login';
            }
        }
    });

    async function handleSupabaseSignup(username, email, fullName, password, role) {
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Creating account...';
        submitBtn.disabled = true;
        
        try {
            // Sign up with actual email and metadata
            const { data, error } = await supabaseService.signUp(email, password, {
                username: username,
                full_name: fullName || username
            });
            
            if (error) {
                throw new Error(error);
            }
            
            // The handle_new_user() trigger will create the user profile automatically
            alert('Account created successfully! Please sign in.');
            
            // Switch back to login mode
            isSignupMode = false;
            formTitle.textContent = 'Sign In';
            submitBtn.textContent = 'Login';
            emailGroup.style.display = 'none';
            fullNameGroup.style.display = 'none';
            emailInput.required = false;
            fullNameInput.required = false;
            usernameInput.parentElement.querySelector('label').textContent = 'Username or Email';
            document.getElementById('toggleSignup').textContent = 'Sign Up';
            document.getElementById('toggleSignup').parentElement.innerHTML = '<p>Don\'t have an account? <a href="#" id="toggleSignup">Sign Up</a></p>';
            
            // Clear form
            usernameInput.value = '';
            emailInput.value = '';
            fullNameInput.value = '';
            passwordInput.value = '';
            
        } catch (error) {
            console.error('Signup error:', error);
            alert(error.message || 'Failed to create account. Email may already be taken.');
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    async function handleSupabaseLogin(username, password, role) {
        const loginBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;
        
        try {
            // Check if input is an email or username
            let email = username;
            
            if (!username.includes('@')) {
                // Username provided - need to look up email or construct one
                // First try to find user by username to get their email
                const { data: userData, error: userError } = await supabaseService.client
                    .from('users')
                    .select('email')
                    .eq('username', username)
                    .single();
                
                if (userData && userData.email) {
                    email = userData.email;
                } else {
                    // If user doesn't exist yet, construct an email
                    email = `${username}@waterstream.local`;
                }
            }
            
            const { data, error } = await supabaseService.signIn(email, password);
            
            if (error) {
                throw new Error(error);
            }
            
            // Check employment status IMMEDIATELY after sign in, before loading user
            const session = await supabaseService.getSession();
            if (session?.user) {
                // Get the user record first to find the associated employee
                const { data: userData, error: userError } = await supabaseService.client
                    .from('users')
                    .select('id')
                    .eq('auth_id', session.user.id)
                    .single();
                
                console.log('User data:', userData, 'Error:', userError);
                
                if (userData) {
                    // Get the employee record
                    const { data: employeeData, error: empError } = await supabaseService.client
                        .from('employees')
                        .select('id, role')
                        .eq('user_id', userData.id)
                        .single();
                    
                    console.log('Employee data:', employeeData, 'Error:', empError);
                    
                    if (employeeData) {
                        // Check the employee_profiles for employment status
                        const { data: profile, error: profileError } = await supabaseService.client
                            .from('employee_profiles')
                            .select('employment_status')
                            .eq('employee_id', employeeData.id)
                            .maybeSingle();
                        
                        console.log('Profile data:', profile, 'Error:', profileError);
                        
                        const employmentStatus = profile?.employment_status || 'active';
                        
                        console.log('Employment status:', employmentStatus);
                        
                        if (employmentStatus === 'terminated') {
                            await supabaseService.signOut();
                            throw new Error('Your employment has been terminated. Access denied.');
                        }
                        
                        if (employmentStatus === 'administrative_leave') {
                            await supabaseService.signOut();
                            throw new Error('You are currently on administrative leave. Access denied.');
                        }
                        
                        if (employmentStatus === 'extended_leave') {
                            // Allow login but redirect to extended leave page
                            sessionStorage.setItem('employmentStatus', 'extended_leave');
                            sessionStorage.setItem('userRole', role);
                            sessionStorage.setItem('username', username);
                            sessionStorage.setItem('userId', userData.id);
                            // ADDED: Wait for login sound to finish before redirecting
                            await playLoginSound();
                            window.location.href = 'extended-leave.html';
                            return;
                        }
                    }
                }
            }
            
            const user = await supabaseService.getCurrentUser();
            
            if (!user) {
                throw new Error('Failed to load user profile');
            }
            
            // Check if role matches
            const isAdmin = user.is_admin === true;
            const userRole = user.role || 'employee';
            
            if (role === 'admin' && !isAdmin) {
                await supabaseService.signOut();
                throw new Error('You do not have admin privileges. Contact an administrator to grant admin access.');
            }
            
            if (role === 'accountant' && userRole !== 'accountant' && !isAdmin) {
                // Allow admins to access accountant dashboard, but check role for others
                console.log('Checking accountant access...');
                // For now, allow if user explicitly selected accountant role
            }
            
            if (role === 'crew_scheduler' && userRole !== 'crew_scheduler' && !isAdmin) {
                // Allow admins to access crew scheduler dashboard, but check role for others
                console.log('Checking crew scheduler access...');
                if (userRole !== 'crew_scheduler') {
                    await supabaseService.signOut();
                    throw new Error('You do not have crew scheduler privileges. Contact an administrator to grant crew scheduler access.');
                }
            }
            
            if (role === 'employee' && isAdmin) {
                // Allow admins to view employee dashboard if they want
                console.log('Admin viewing employee dashboard');
            }
            
            // Store session info in sessionStorage (clears when browser closes)
            sessionStorage.setItem('userRole', role);
            sessionStorage.setItem('username', user.username);
            sessionStorage.setItem('userId', user.id);
            sessionStorage.setItem('isAdmin', isAdmin);
            
            // Redirect to appropriate page
            await redirectToApp(role === 'admin', role);
            
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message || 'Invalid credentials! Please try again.');
        } finally {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }
    
    async function handleOfflineLogin(username, password, role) {
        // Simple offline authentication (for demo/offline mode)
        if (role === 'admin') {
            // In offline mode, accept any admin credentials for testing
            if (password === 'admin123') {
                sessionStorage.setItem('userRole', 'admin');
                sessionStorage.setItem('username', username);
                sessionStorage.setItem('isAdmin', 'true');
                // ADDED: Wait for login sound to finish before redirecting
                await playLoginSound();
                window.location.href = 'admin.html';
            } else {
                alert('Invalid admin password! Use admin123 for offline mode.');
            }
        } else if (role === 'employee') {
            if (password === 'emp123') {
                sessionStorage.setItem('userRole', 'employee');
                sessionStorage.setItem('username', username);
                sessionStorage.setItem('isAdmin', 'false');
                // ADDED: Wait for login sound to finish before redirecting
                await playLoginSound();
                // Always redirect to full employee dashboard
                window.location.href = 'employee.html';
            } else {
                alert('Invalid credentials! Default password is emp123');
            }
        } else if (role === 'accountant') {
            if (password === 'acc123') {
                sessionStorage.setItem('userRole', 'accountant');
                sessionStorage.setItem('username', username);
                sessionStorage.setItem('isAdmin', 'false');
                // ADDED: Wait for login sound to finish before redirecting
                await playLoginSound();
                window.location.href = 'accountant.html';
            } else {
                alert('Invalid credentials! Default password is acc123');
            }
        }
    }
    
    async function redirectToApp(isAdmin, role = null) {
        // ADDED: Wait for login sound to finish before redirecting
        await playLoginSound();
        if (role === 'accountant') {
            window.location.href = 'accountant.html';
        } else if (role === 'crew_scheduler') {
            window.location.href = 'crew-scheduling.html';
        } else if (isAdmin) {
            window.location.href = 'admin.html';
        } else {
            // Employee routing: always use full employee dashboard
            if (role === 'employee') {
                window.location.href = 'employee.html';
                return;
            }
            window.location.href = 'employee.html';
        }
    }
});

