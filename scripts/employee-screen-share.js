// Employee Screen Sharing - Automatically shares screen to admin monitor
class EmployeeScreenShare {
    constructor() {
        this.stream = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.employeeId = null;
        this.isSharing = false;
        this.frameInterval = null;
    }

    async initialize(employeeId) {
        this.employeeId = employeeId;
        
        // Check if screen sharing is enabled (can be controlled by admin)
        const sharingEnabled = await this.checkSharingEnabled();
        
        if (sharingEnabled) {
            await this.startSharing();
        }
    }

    async checkSharingEnabled() {
        // Check if admin has enabled screen sharing for this employee
        // For now, we'll enable it by default, but this can be controlled via database
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                // Could check a setting in the database here
                return true; // Default to enabled
            }
        } catch (error) {
            console.error('Error checking sharing enabled:', error);
        }
        return true;
    }

    async startSharing() {
        try {
            // Check if screen sharing is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                console.log('Screen sharing not supported in this browser');
                return;
            }

            // Request screen capture (will prompt user for permission)
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 5, max: 10 } // Lower frame rate to reduce bandwidth
                },
                audio: false
            });

            this.isSharing = true;
            console.log('Screen sharing started');

            // Handle stream end (user stops sharing)
            this.stream.getVideoTracks()[0].addEventListener('ended', () => {
                console.log('Screen sharing ended by user');
                this.stopSharing();
            });

            // Start sending frames via Supabase
            await this.setupRealtimeSharing();

        } catch (error) {
            console.error('Error starting screen share:', error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                console.log('Screen sharing permission denied by user');
            } else if (error.name === 'NotFoundError') {
                console.log('No screen/window/tab available for sharing');
            }
        }
    }

    async setupRealtimeSharing() {
        if (!this.stream || !this.employeeId) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const video = document.createElement('video');
        
        video.srcObject = this.stream;
        video.play();

        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        });

        // Wait for video to be ready
        video.addEventListener('loadedmetadata', () => {
            canvas.width = Math.min(video.videoWidth, 1280);
            canvas.height = Math.min(video.videoHeight, 720);
            
            // Capture and send frames periodically
            this.frameInterval = setInterval(async () => {
                if (video.readyState === video.HAVE_ENOUGH_DATA && this.isSharing) {
                    try {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        
                        // Convert to base64 (lower quality for bandwidth)
                        const frameData = canvas.toDataURL('image/jpeg', 0.4);
                        
                        // Send via Supabase
                        await this.sendFrame(frameData);
                    } catch (error) {
                        console.error('Error capturing frame:', error);
                    }
                }
            }, 200); // 5 FPS to reduce bandwidth
        });

        // Also set up Supabase channel for signaling
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const channel = supabaseService.client.channel(`screen-share-${this.employeeId}`);
            
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Screen share channel subscribed');
                }
            });
        }
    }

    async sendFrame(frameData) {
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                // Store frame in a table that admin can read
                const { error } = await supabaseService.client
                    .from('employee_screen_shares')
                    .upsert({
                        employee_id: this.employeeId,
                        frame_data: frameData,
                        timestamp: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'employee_id'
                    });

                if (error) {
                    console.error('Error sending frame:', error);
                }
            }
        } catch (error) {
            console.error('Error in sendFrame:', error);
        }
    }

    stopSharing() {
        this.isSharing = false;

        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Clean up Supabase data
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady() && this.employeeId) {
            supabaseService.client
                .from('employee_screen_shares')
                .delete()
                .eq('employee_id', this.employeeId);
        }

        console.log('Screen sharing stopped');
    }

    cleanup() {
        this.stopSharing();
    }
}

// Initialize screen sharing when employee page loads
document.addEventListener('DOMContentLoaded', async function() {
    // Only initialize on employee pages
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') return;

    // Wait for Supabase and employee data
    if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
        setTimeout(arguments.callee, 100);
        return;
    }

    try {
        // Get current employee ID
        await supabaseService.loadCurrentUser();
        const user = await supabaseService.getCurrentUser();
        
        if (user && user.id) {
            // Get employee record
            const { data: employee } = await supabaseService.client
                .from('employees')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (employee && employee.id) {
                // Initialize screen sharing
                window.employeeScreenShare = new EmployeeScreenShare();
                await window.employeeScreenShare.initialize(employee.id);
            }
        }
    } catch (error) {
        console.error('Error initializing screen share:', error);
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.employeeScreenShare) {
        window.employeeScreenShare.cleanup();
    }
});

