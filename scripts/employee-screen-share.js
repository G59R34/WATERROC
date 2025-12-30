// Employee Screen Sharing - WebRTC Live Stream
class EmployeeScreenShare {
    constructor() {
        this.stream = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.employeeId = null;
        this.isSharing = false;
        this.channel = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
    }

    async initialize(employeeId) {
        this.employeeId = employeeId;
        
        // Check if screen sharing is enabled
        const sharingEnabled = await this.checkSharingEnabled();
        
        if (sharingEnabled) {
            await this.startSharing();
        }
    }

    async checkSharingEnabled() {
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
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

            // Request screen capture
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 15, max: 30 }
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

            // Start WebRTC connection
            await this.setupWebRTC();

        } catch (error) {
            console.error('Error starting screen share:', error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                console.log('Screen sharing permission denied by user');
            } else if (error.name === 'NotFoundError') {
                console.log('No screen/window/tab available for sharing');
            }
        }
    }

    async setupWebRTC() {
        if (!this.stream || !this.employeeId) return;

        // Create RTCPeerConnection
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.peerConnection = new RTCPeerConnection(configuration);

        // Add stream tracks to peer connection
        this.stream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.stream);
        });

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    employee_id: this.employeeId
                });
            }
        };

        // Create offer
        const offer = await this.peerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false
        });

        await this.peerConnection.setLocalDescription(offer);

        // Send offer via Supabase Realtime
        this.sendSignal({
            type: 'offer',
            offer: offer,
            employee_id: this.employeeId
        });

        // Set up signaling channel
        this.setupSignalingChannel();

        // Also set up MediaRecorder as fallback for browsers that don't support WebRTC well
        this.setupMediaRecorderFallback();
    }

    setupSignalingChannel() {
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            return;
        }

        const channelName = `screen-share-${this.employeeId}`;
        this.channel = supabaseService.client.channel(channelName);

        // Listen for answers and ICE candidates from admin
        this.channel.on('broadcast', { event: 'signal' }, (payload) => {
            this.handleSignal(payload.payload);
        });

        this.channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Screen share signaling channel subscribed');
            }
        });
    }

    async handleSignal(signal) {
        if (!this.peerConnection) return;

        try {
            if (signal.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
            } else if (signal.type === 'ice-candidate' && signal.candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (error) {
            console.error('Error handling signal:', error);
        }
    }

    sendSignal(signal) {
        if (!this.channel) {
            // Fallback: store in database for polling
            this.storeSignalInDB(signal);
            return;
        }

        this.channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: signal
        });
    }

    async storeSignalInDB(signal) {
        // Fallback method: store signals in database for admin to poll
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await supabaseService.client
                    .from('employee_screen_shares')
                    .upsert({
                        employee_id: this.employeeId,
                        signal_data: signal, // Store as JSONB directly
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'employee_id'
                    });
            }
        } catch (error) {
            // Silently handle - signal_data column might not exist yet
            console.debug('Error storing signal (column may not exist):', error.message);
        }
    }

    setupMediaRecorderFallback() {
        // Use canvas-based frame capture as fallback (simpler than MediaRecorder)
        // This sends smaller JPEG frames at higher frequency
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const video = document.createElement('video');
            
            video.srcObject = this.stream;
            video.play();

            video.addEventListener('loadedmetadata', () => {
                canvas.width = Math.min(video.videoWidth, 1280);
                canvas.height = Math.min(video.videoHeight, 720);
                
                // Capture and send frames periodically (higher frequency for smoother updates)
                this.frameInterval = setInterval(async () => {
                    if (video.readyState === video.HAVE_ENOUGH_DATA && this.isSharing) {
                        try {
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            
                            // Convert to base64 JPEG (optimized quality/size balance)
                            const frameData = canvas.toDataURL('image/jpeg', 0.7);
                            
                            // Store as fallback frame - use upsert to always update
                            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                                try {
                                    await supabaseService.client
                                        .from('employee_screen_shares')
                                        .upsert({
                                            employee_id: this.employeeId,
                                            frame_data: frameData,
                                            updated_at: new Date().toISOString()
                                        }, {
                                            onConflict: 'employee_id'
                                        });
                                } catch (dbError) {
                                    // Silently handle DB errors to avoid console spam
                                    if (dbError.code !== '42P01' && dbError.code !== 'PGRST116') {
                                        console.debug('DB update error:', dbError.message);
                                    }
                                }
                            }
                        } catch (error) {
                            console.debug('Error capturing frame:', error);
                        }
                    }
                }, 500); // 1 FPS - updates every second for seamless viewing
            });
        } catch (error) {
            console.debug('Canvas fallback not available:', error);
        }
    }

    stopSharing() {
        this.isSharing = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
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
async function initializeScreenShare() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        return;
    }

    if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
        setTimeout(initializeScreenShare, 500);
        return;
    }

    try {
        let employeeId = null;

        // Method 1: Get from current user
        try {
            await supabaseService.loadCurrentUser();
            const user = await supabaseService.getCurrentUser();
            
            if (user && user.id) {
                const { data: employee, error: empError } = await supabaseService.client
                    .from('employees')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (!empError && employee && employee.id) {
                    employeeId = employee.id;
                }
            }
        } catch (error) {
            console.debug('Method 1 failed, trying alternative:', error);
        }

        // Method 2: Session storage
        if (!employeeId) {
            const storedEmpId = sessionStorage.getItem('employeeId');
            if (storedEmpId) {
                employeeId = parseInt(storedEmpId, 10);
            }
        }

        // Method 3: Global employee object
        if (!employeeId && typeof getCurrentEmployee === 'function') {
            try {
                const currentEmp = await getCurrentEmployee();
                if (currentEmp && currentEmp.employeeId) {
                    employeeId = currentEmp.employeeId;
                }
            } catch (error) {
                console.debug('Method 3 failed:', error);
            }
        }

        if (employeeId) {
            window.employeeScreenShare = new EmployeeScreenShare();
            await window.employeeScreenShare.initialize(employeeId);
            console.log('Screen sharing initialized for employee:', employeeId);
        } else {
            console.debug('Could not determine employee ID for screen sharing');
        }
    } catch (error) {
        console.error('Error initializing screen share:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeScreenShare);
} else {
    initializeScreenShare();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.employeeScreenShare) {
        window.employeeScreenShare.cleanup();
    }
});
