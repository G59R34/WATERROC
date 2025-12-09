// Login Script with Supabase Authentication
document.addEventListener('DOMContentLoaded', async function() {
    const loginForm = document.getElementById('loginForm');
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
    
    let isSignupMode = false;
    
    // Toggle between login and signup
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
        document.getElementById('toggleSignup').addEventListener('click', arguments.callee);
    });
    
    // Check if already logged in
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (session && sessionStorage.getItem('userRole')) {
            await supabaseService.loadCurrentUser();
            const user = await supabaseService.getCurrentUser();
            if (user) {
                // Check employment status before allowing access
                const { data: profile } = await supabaseService.client
                    .from('employee_profiles')
                    .select('employment_status')
                    .eq('employee_id', user.id)
                    .single();
                
                const employmentStatus = profile?.employment_status || 'active';
                
                if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
                    // Revoke access and force re-login
                    await supabaseService.signOut();
                    sessionStorage.clear();
                    alert('Your account access has been revoked. Please contact an administrator.');
                    return;
                }
                
                redirectToApp(user.is_admin);
                return;
            }
        }
    }
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const fullName = fullNameInput.value.trim();
        const password = passwordInput.value;
        const role = roleSelect.value;
        
        if (isSignupMode) {
            // Handle signup
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await handleSupabaseSignup(username, email, fullName, password, role);
            } else {
                alert('Signup requires Supabase to be configured. Please use offline demo mode for testing.');
            }
        } else {
            // Handle login
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await handleSupabaseLogin(username, password, role);
            } else {
                handleOfflineLogin(username, password, role);
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
                    }
                }
            }
            
            const user = await supabaseService.getCurrentUser();
            
            if (!user) {
                throw new Error('Failed to load user profile');
            }
            
            // Check if role matches
            const isAdmin = user.is_admin === true;
            
            if (role === 'admin' && !isAdmin) {
                await supabaseService.signOut();
                throw new Error('You do not have admin privileges. Contact an administrator to grant admin access.');
            }
            
            if (role === 'employee' && isAdmin) {
                // Allow admins to view employee dashboard if they want
                console.log('Admin viewing employee dashboard');
            }
            
            // Store session info
            sessionStorage.setItem('userRole', role);
            sessionStorage.setItem('username', user.username);
            sessionStorage.setItem('userId', user.id);
            sessionStorage.setItem('isAdmin', isAdmin);
            
            // Redirect to appropriate page
            redirectToApp(role === 'admin');
            
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message || 'Invalid credentials! Please try again.');
        } finally {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }
    
    function handleOfflineLogin(username, password, role) {
        // Simple offline authentication (for demo/offline mode)
        if (role === 'admin') {
            // In offline mode, accept any admin credentials for testing
            if (password === 'admin123') {
                sessionStorage.setItem('userRole', 'admin');
                sessionStorage.setItem('username', username);
                sessionStorage.setItem('isAdmin', 'true');
                window.location.href = 'admin.html';
            } else {
                alert('Invalid admin password! Use admin123 for offline mode.');
            }
        } else if (role === 'employee') {
            if (password === 'emp123') {
                sessionStorage.setItem('userRole', 'employee');
                sessionStorage.setItem('username', username);
                sessionStorage.setItem('isAdmin', 'false');
                window.location.href = 'employee.html';
            } else {
                alert('Invalid credentials! Default password is emp123');
            }
        }
    }
    
    function redirectToApp(isAdmin) {
        if (isAdmin) {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'employee.html';
        }
    }
});

