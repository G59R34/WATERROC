// Real-time Employee Status Monitor
// Monitors employee status changes and boots users with inactive status

class EmployeeStatusMonitor {
    constructor() {
        this.supabaseService = window.supabaseService;
        this.subscription = null;
        this.currentEmployeeId = null;
        this.currentUserId = null;
        this.isActive = false;
        this.statusCheckInterval = null;
        
        // Womp womp sounds for different statuses
        this.statusMessages = {
            'terminated': '🚪 WOMP WOMP! Your employment has been terminated. You have been logged out.',
            'administrative_leave': '⚠️ WOMP WOMP! You have been placed on administrative leave. You have been logged out.',
            'extended_leave': '🏖️ WOMP WOMP! You have been placed on extended leave. Redirecting to extended leave page...',
            'suspended': '🚫 WOMP WOMP! Your account has been suspended. You have been logged out.',
            'inactive': '😴 WOMP WOMP! Your account has been deactivated. You have been logged out.',
            'default': '🔒 WOMP WOMP! Your access has been revoked. You have been logged out.'
        };
        
        // Initialize when DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    
    async initialize() {
        console.log('🔍 Initializing Employee Status Monitor...');
        console.log('📍 Current page:', window.location.pathname);
        
        // Don't run on login page
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
            console.log('⏭️ Skipping monitoring on login page');
            return;
        }
        
        // Wait for supabase to be ready
        if (!this.supabaseService || !this.supabaseService.isReady()) {
            console.log('⏳ Waiting for Supabase to initialize...');
            setTimeout(() => this.initialize(), 1000);
            return;
        }
        
        console.log('✅ Supabase is ready, loading user information...');
        
        // Get current user information
        await this.loadCurrentUser();
        
        if (this.currentUserId && this.currentEmployeeId) {
            console.log('👤 User loaded successfully, starting monitoring...');
            
            // Ensure employee has a profile - create one if missing
            await this.ensureEmployeeProfile();
            
            // Start monitoring immediately
            await this.startMonitoring();
            
            // Force an immediate status check
            setTimeout(() => {
                console.log('🔄 Performing initial status check...');
                this.checkCurrentStatus();
            }, 2000);
            
        } else {
            console.log('⚠️ No user/employee ID found, retrying in 3 seconds...');
            // Retry in case user info isn't loaded yet
            setTimeout(() => this.initialize(), 3000);
        }
    }
    
    async loadCurrentUser() {
        try {
            const session = await this.supabaseService.getSession();
            if (!session?.user) {
                console.log('❌ No active session found');
                return;
            }
            
            // Get user data
            const { data: userData, error: userError } = await this.supabaseService.client
                .from('users')
                .select('id')
                .eq('auth_id', session.user.id)
                .single();
            
            if (userError || !userData) {
                console.error('❌ Failed to load user data:', userError);
                return;
            }
            
            this.currentUserId = userData.id;
            
            // Get employee data
            const { data: employeeData, error: empError } = await this.supabaseService.client
                .from('employees')
                .select('id')
                .eq('user_id', userData.id)
                .single();
            
            if (empError || !employeeData) {
                console.error('❌ Failed to load employee data:', empError);
                return;
            }
            
            this.currentEmployeeId = employeeData.id;
            console.log('✅ User loaded:', { userId: this.currentUserId, employeeId: this.currentEmployeeId });
            
        } catch (error) {
            console.error('❌ Error loading current user:', error);
        }
    }
    
    async ensureEmployeeProfile() {
        if (!this.currentEmployeeId) return;
        
        try {
            console.log('🔧 Ensuring employee profile exists for ID:', this.currentEmployeeId);
            
            // Check if profile exists
            const { data: existingProfile } = await this.supabaseService.client
                .from('employee_profiles')
                .select('id, employment_status')
                .eq('employee_id', this.currentEmployeeId)
                .maybeSingle();
            
            if (existingProfile) {
                console.log('✅ Employee profile exists with status:', existingProfile.employment_status);
                return;
            }
            
            // Create profile if it doesn't exist
            console.log('📝 Creating new employee profile...');
            const { error } = await this.supabaseService.client
                .from('employee_profiles')
                .insert({
                    employee_id: this.currentEmployeeId,
                    employment_status: 'active',
                    created_at: new Date().toISOString()
                });
            
            if (error) {
                console.error('❌ Failed to create employee profile:', error);
            } else {
                console.log('✅ Employee profile created successfully');
            }
            
        } catch (error) {
            console.error('❌ Error ensuring employee profile:', error);
        }
    }
    
    async startMonitoring() {
        if (this.isActive) {
            console.log('⚠️ Status monitoring already active');
            return;
        }
        
        this.isActive = true;
        console.log('🚀 Starting real-time employee status monitoring for employee ID:', this.currentEmployeeId);
        
        try {
            // Set up real-time subscription to employee_profiles table
            // Listen to ALL employee_profiles changes, not just for current user
            this.subscription = this.supabaseService.client
                .channel('employee_status_monitor_' + Date.now()) // Unique channel name
                .on('postgres_changes', {
                    event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'employee_profiles'
                }, (payload) => {
                    console.log('📢 Employee profile change detected:', payload);
                    // Only handle changes for current employee
                    if (payload.new?.employee_id === this.currentEmployeeId || 
                        payload.old?.employee_id === this.currentEmployeeId) {
                        console.log('🎯 Change affects current employee, handling...');
                        this.handleStatusChange(payload.new, payload.old);
                    }
                })
                .subscribe((status, err) => {
                    console.log('📡 Subscription status:', status, err);
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ Real-time monitoring active for employee:', this.currentEmployeeId);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('❌ Real-time monitoring failed to start:', err);
                        this.fallbackToPolling();
                    } else if (status === 'TIMED_OUT') {
                        console.error('❌ Real-time monitoring timed out');
                        this.fallbackToPolling();
                    } else if (status === 'CLOSED') {
                        console.log('📪 Real-time monitoring channel closed');
                    }
                });
            
            // Also set up periodic status check as backup
            this.startStatusPolling();
            
            // Initial status check
            await this.checkCurrentStatus();
            
        } catch (error) {
            console.error('❌ Failed to start real-time monitoring:', error);
            this.fallbackToPolling();
        }
    }
    
    async handleStatusChange(newProfile, oldProfile) {
        const newStatus = newProfile?.employment_status;
        const oldStatus = oldProfile?.employment_status;

        console.log(`📋 Status change detected: ${oldStatus} → ${newStatus}`);

        // If status didn't actually change, ignore
        if (newStatus === oldStatus) {
            console.log('ℹ️ Status unchanged, ignoring');
            return;
        }

        // If status changed to an inactive state, boot the user
        if (this.isInactiveStatus(newStatus)) {
            console.log('🚨 INACTIVE STATUS DETECTED - INITIATING LOGOUT');
            await this.bootUser(newStatus);
            return;
        }

        // If status changed to extended_leave, show womp womp and redirect
        if (newStatus === 'extended_leave') {
            console.log('🏖️ EXTENDED LEAVE STATUS DETECTED - SHOWING WOMP WOMP');
            await this.handleExtendedLeave();
            return;
        }

        // For other status changes (e.g., extended_leave -> active, or admin updates), refresh the page
        try {
            console.log('🔁 Non-inactive status change detected, refreshing page to apply new profile state');
            // Update local session state so page can act on new status immediately
            if (newStatus) sessionStorage.setItem('employmentStatus', newStatus);
            // Give any UI updates a moment, then reload
            setTimeout(() => {
                try { window.location.reload(); } catch (e) { console.warn('Could not reload page:', e); }
            }, 500);
        } catch (err) {
            console.error('❌ Error while handling non-inactive status change:', err);
        }
    }
    
    isInactiveStatus(status) {
        const inactiveStatuses = [
            'terminated',
            'administrative_leave', 
            'suspended',
            'inactive'
        ];
        return inactiveStatuses.includes(status);
    }

    async handleExtendedLeave() {
        console.log('🏖️ EXTENDED LEAVE DETECTED - SHOWING WOMP WOMP');
        
        // Stop monitoring to prevent multiple triggers
        this.stopMonitoring();
        
        // Show womp womp message for extended leave
        this.displayWompWompMessage('extended_leave');
        
        // Redirect to extended leave page after showing message
        setTimeout(() => {
            window.location.href = 'extended-leave.html';
        }, 3000); // 3 second delay to show the womp womp message
    }

    async bootUser(status) {
        console.log('👢 BOOTING USER - Status:', status);
        
        // Stop monitoring immediately to prevent multiple triggers
        this.stopMonitoring();
        
        // Create dramatic "womp womp" effect
        this.displayWompWompMessage(status);
        
        // Wait a moment for user to see the message
        setTimeout(async () => {
            try {
                // Clear all session data
                await this.clearSessionData();
                
                // Sign out from Supabase
                if (this.supabaseService && this.supabaseService.isReady()) {
                    await this.supabaseService.signOut();
                }
                
                // Redirect to login page
                window.location.href = 'index.html';
                
            } catch (error) {
                console.error('❌ Error during logout:', error);
                // Force redirect anyway
                window.location.href = 'index.html';
            }
        }, 3000); // 3 second delay to show the womp womp message
    }
    
    displayWompWompMessage(status) {
        // Remove any existing womp womp overlay
        const existing = document.querySelector('.womp-womp-overlay');
        if (existing) {
            existing.remove();
        }
        
        // Create dramatic overlay
        const overlay = document.createElement('div');
        overlay.className = 'womp-womp-overlay';
        overlay.innerHTML = `
            <div class="womp-womp-content">
                <div class="womp-womp-emoji">😱</div>
                <div class="womp-womp-text">${this.statusMessages[status] || this.statusMessages.default}</div>
                <div class="womp-womp-countdown">Redirecting in <span id="wompCountdown">3</span>...</div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .womp-womp-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(220, 38, 38, 0.95);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 999999;
                animation: wompFadeIn 0.5s ease-in;
            }
            
            .womp-womp-content {
                background: white;
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                max-width: 500px;
                margin: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                animation: wompBounce 0.6s ease-out;
            }
            
            .womp-womp-emoji {
                font-size: 80px;
                margin-bottom: 20px;
                animation: wompShake 0.5s ease-in-out infinite alternate;
            }
            
            .womp-womp-text {
                font-size: 24px;
                font-weight: bold;
                color: #dc2626;
                margin-bottom: 20px;
                line-height: 1.4;
            }
            
            .womp-womp-countdown {
                font-size: 18px;
                color: #666;
                font-weight: 500;
            }
            
            @keyframes wompFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes wompBounce {
                0% { transform: scale(0.3); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            @keyframes wompShake {
                0% { transform: rotate(-5deg); }
                100% { transform: rotate(5deg); }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(overlay);
        
        // Start countdown
        let countdown = 3;
        const countdownElement = document.getElementById('wompCountdown');
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            if (countdown <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);
        
        // Play womp womp sound if available
        try {
            this.playWompWompSound();
        } catch (error) {
            console.log('🔇 Could not play womp womp sound:', error);
        }
    }
    
    playWompWompSound() {
        // Create a simple womp womp sound using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create womp womp sequence
            const wompSequence = [
                { freq: 150, duration: 0.3 },
                { freq: 100, duration: 0.3 },
                { freq: 150, duration: 0.3 },
                { freq: 100, duration: 0.3 }
            ];
            
            let startTime = audioContext.currentTime;
            
            wompSequence.forEach((womp, index) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.type = 'sawtooth';
                oscillator.frequency.value = womp.freq;
                
                gainNode.gain.setValueAtTime(0.3, startTime + (index * 0.4));
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + (index * 0.4) + womp.duration);
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start(startTime + (index * 0.4));
                oscillator.stop(startTime + (index * 0.4) + womp.duration);
            });
            
        } catch (error) {
            console.log('🔇 Web Audio API not available:', error);
        }
    }
    
    async clearSessionData() {
        // Clear all session storage
        sessionStorage.clear();
        localStorage.removeItem('supabase.auth.token');
        
        // Clear any other app-specific storage
        const keysToRemove = [
            'userRole', 'username', 'userId', 'isAdmin', 'employmentStatus'
        ];
        
        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
    }
    
    startStatusPolling() {
        // More frequent polling every 5 seconds for immediate detection
        this.statusCheckInterval = setInterval(() => {
            this.checkCurrentStatus();
        }, 5000);
        console.log('⏰ Status polling started - checking every 5 seconds');
    }
    
    async checkCurrentStatus() {
        if (!this.currentEmployeeId) {
            console.log('❌ No employee ID for status check');
            return;
        }
        
        try {
            console.log('🔍 Checking employment status for employee:', this.currentEmployeeId);
            
            const { data: profile, error } = await this.supabaseService.client
                .from('employee_profiles')
                .select('employment_status, status_changed_at')
                .eq('employee_id', this.currentEmployeeId)
                .maybeSingle(); // Use maybeSingle to handle case where profile doesn't exist
            
            if (error) {
                console.error('❌ Error checking status:', error);
                return;
            }
            
            const status = profile?.employment_status || 'active';
            console.log('📊 Current employment status:', status, 'Changed at:', profile?.status_changed_at);
            
            if (this.isInactiveStatus(status)) {
                console.log('🚨 INACTIVE STATUS FOUND DURING POLLING - INITIATING LOGOUT');
                await this.bootUser(status);
            }
            
        } catch (error) {
            console.error('❌ Error during status check:', error);
        }
    }
    
    fallbackToPolling() {
        console.log('⚠️ Falling back to polling-based status monitoring');
        this.startStatusPolling();
    }
    
    stopMonitoring() {
        if (this.subscription) {
            this.supabaseService.client.removeChannel(this.subscription);
            this.subscription = null;
        }
        
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        
        this.isActive = false;
        console.log('⏹️ Status monitoring stopped');
    }
    
    // Call this when user logs out normally to prevent unnecessary monitoring
    cleanup() {
        this.stopMonitoring();
        this.currentEmployeeId = null;
        this.currentUserId = null;
    }
}

// Create global instance
window.employeeStatusMonitor = new EmployeeStatusMonitor();

// Add global test functions for debugging
window.testEmployeeStatusMonitor = {
    checkStatus: () => {
        if (window.employeeStatusMonitor) {
            console.log('🧪 Manual status check triggered');
            window.employeeStatusMonitor.checkCurrentStatus();
        }
    },
    
    forceLogout: (status = 'terminated') => {
        if (window.employeeStatusMonitor) {
            console.log('🧪 Manual logout triggered with status:', status);
            window.employeeStatusMonitor.bootUser(status);
        }
    },
    
    getInfo: () => {
        if (window.employeeStatusMonitor) {
            return {
                isActive: window.employeeStatusMonitor.isActive,
                currentEmployeeId: window.employeeStatusMonitor.currentEmployeeId,
                currentUserId: window.employeeStatusMonitor.currentUserId,
                hasSubscription: !!window.employeeStatusMonitor.subscription
            };
        }
        return null;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmployeeStatusMonitor;
}