// VOIP Call Manager using WebRTC
// Handles peer-to-peer audio/video calls between employees

class VOIPCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCallId = null;
        this.currentCallLogId = null;
        this.currentReceiverId = null;
        this.isCallActive = false;
        this.isIncomingCall = false;
        this.callStartTime = null;
        this.signalUnsubscribe = null;
        this.incomingCallUnsubscribe = null;
        this.incomingCallPollInterval = null;
        this.supabaseService = window.supabaseService;
        this.onCallStateChange = null;
        this.onIncomingCall = null;
        this.onCallEnded = null;
        
        // WebRTC configuration (using free STUN servers)
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    /**
     * Initialize the call manager
     */
    async initialize() {
        if (!this.supabaseService || !this.supabaseService.isReady()) {
            console.error('Supabase service not available');
            // Retry after a delay
            setTimeout(() => this.initialize(), 2000);
            return false;
        }

        // Subscribe to incoming calls
        const employee = await this.supabaseService.getCurrentEmployee();
        if (employee) {
            console.log('📞 Initializing VOIP for employee:', employee.id, employee.name);
            this.subscribeToIncomingCalls(employee.id);
            // Also start polling as a fallback
            this.startIncomingCallPolling(employee.id);
        } else {
            // Don't retry indefinitely - user might be admin without employee record
            console.log('ℹ️ No employee record found (user may be admin). VOIP features disabled.');
            // VOIP requires an employee record, so we'll skip initialization
        }

        return true;
    }

    /**
     * Poll for incoming calls as a fallback (in case real-time doesn't work)
     */
    startIncomingCallPolling(employeeId) {
        // Clear any existing polling
        if (this.incomingCallPollInterval) {
            clearInterval(this.incomingCallPollInterval);
        }

        // Poll every 2 seconds for incoming calls
        this.incomingCallPollInterval = setInterval(async () => {
            try {
                if (!this.supabaseService || !this.supabaseService.isReady()) return;
                if (this.isCallActive || this.isIncomingCall) return; // Don't poll if already in a call

                // Check for recent call requests (last 10 seconds)
                const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
                
                const { data: signals, error } = await this.supabaseService.client
                    .from('call_signaling')
                    .select('*')
                    .eq('receiver_id', employeeId)
                    .eq('signal_type', 'call-request')
                    .gte('created_at', tenSecondsAgo)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (error) {
                    console.error('Error polling for incoming calls:', error);
                    return;
                }

                if (signals && signals.length > 0) {
                    const signal = signals[0];
                    // Check if we've already handled this call
                    if (!this.isIncomingCall && !this.isCallActive) {
                        console.log('📞 Polling detected incoming call:', signal);
                        this.isIncomingCall = true;
                        if (this.onIncomingCall) {
                            this.onIncomingCall(signal);
                        }
                    }
                }
            } catch (error) {
                console.error('Error in incoming call polling:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    /**
     * Subscribe to incoming call requests
     */
    subscribeToIncomingCalls(employeeId) {
        if (this.incomingCallUnsubscribe) {
            this.incomingCallUnsubscribe();
        }

        console.log('📡 Subscribing to incoming calls for employee:', employeeId);

        this.incomingCallUnsubscribe = this.supabaseService.subscribeToIncomingCalls(
            employeeId,
            async (signal) => {
                console.log('📞 Incoming call signal received:', signal);
                console.log('   Signal type:', signal.signal_type);
                console.log('   Receiver ID:', signal.receiver_id);
                console.log('   Caller ID:', signal.caller_id);
                
                // Mark as incoming call
                this.isIncomingCall = true;
                
                if (this.onIncomingCall) {
                    this.onIncomingCall(signal);
                } else {
                    console.warn('⚠️ onIncomingCall callback not set');
                }
            }
        );

        console.log('✅ Incoming call subscription active');
    }

    /**
     * Initiate a call to another employee
     * @param {number} receiverId - Employee ID to call
     * @param {string} receiverName - Name of the receiver
     * @param {string} callType - 'audio' or 'video'
     * @returns {Promise<boolean>} Success status
     */
    async initiateCall(receiverId, receiverName, callType = 'audio') {
        if (this.isCallActive) {
            console.warn('Call already in progress');
            return false;
        }

        try {
            const employee = await this.supabaseService.getCurrentEmployee();
            if (!employee) {
                console.error('Could not get current employee');
                return false;
            }

            // Generate unique call ID
            this.currentCallId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this.currentReceiverId = receiverId;

            // Get user media (audio/video)
            const constraints = {
                audio: true,
                video: callType === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Got local media stream');
            
            // Log local stream tracks
            const localAudioTracks = this.localStream.getAudioTracks();
            const localVideoTracks = this.localStream.getVideoTracks();
            console.log('🎤 Local audio tracks:', localAudioTracks.length);
            console.log('📹 Local video tracks:', localVideoTracks.length);
            localAudioTracks.forEach((track, index) => {
                console.log(`   Audio track ${index}:`, {
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                    label: track.label
                });
            });

            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);

            // Add local stream tracks to peer connection
            this.localStream.getTracks().forEach(track => {
                console.log(`📤 Adding ${track.kind} track to peer connection:`, track.label);
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.supabaseService.sendCallSignal(
                        this.currentCallId,
                        receiverId,
                        'ice-candidate',
                        event.candidate
                    );
                }
            };

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('✅ Received remote stream');
                console.log('   Event streams:', event.streams.length);
                console.log('   Event track:', event.track.kind, event.track.enabled);
                
                this.remoteStream = event.streams[0];
                
                // Ensure audio tracks are enabled
                if (this.remoteStream) {
                    const audioTracks = this.remoteStream.getAudioTracks();
                    audioTracks.forEach(track => {
                        track.enabled = true;
                        console.log('🎤 Enabled remote audio track:', track.label);
                    });
                    
                    const videoTracks = this.remoteStream.getVideoTracks();
                    videoTracks.forEach(track => {
                        track.enabled = true;
                        console.log('📹 Enabled remote video track:', track.label);
                    });
                }
                
                if (this.onCallStateChange) {
                    this.onCallStateChange('connected', this.remoteStream);
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('Connection state:', this.peerConnection.connectionState);
                if (this.peerConnection.connectionState === 'failed' || 
                    this.peerConnection.connectionState === 'disconnected') {
                    this.endCall('failed');
                }
            };

            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Create call log
            const callLog = await this.supabaseService.createCallLog(
                employee.id,
                receiverId,
                employee.name,
                receiverName,
                callType
            );

            if (callLog) {
                this.currentCallLogId = callLog.id;
            }

            // Send call request signal
            const signalSent = await this.supabaseService.sendCallSignal(
                this.currentCallId,
                receiverId,
                'call-request',
                {
                    callId: this.currentCallId,
                    callerId: employee.id,
                    callerName: employee.name,
                    callType: callType,
                    offer: offer
                }
            );

            if (!signalSent) {
                console.error('❌ Failed to send call request signal');
                this.cleanup();
                return false;
            }

            console.log('✅ Call request signal sent to employee:', receiverId);

            // Subscribe to signaling for this call
            this.subscribeToCallSignaling(this.currentCallId);

            this.isCallActive = true;
            this.callStartTime = Date.now();

            if (this.onCallStateChange) {
                this.onCallStateChange('ringing', null);
            }

            console.log('📞 Call initiated:', this.currentCallId);
            return true;

        } catch (error) {
            console.error('Error initiating call:', error);
            this.cleanup();
            return false;
        }
    }

    /**
     * Answer an incoming call
     * @param {Object} callRequest - The incoming call request signal
     * @returns {Promise<boolean>} Success status
     */
    async answerCall(callRequest) {
        if (this.isCallActive) {
            console.warn('Call already in progress');
            return false;
        }

        try {
            const signalData = callRequest.signal_data;
            this.currentCallId = signalData.callId;
            this.currentReceiverId = signalData.callerId;

            // Get user media
            const constraints = {
                audio: true,
                video: signalData.callType === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Got local media stream for answer');
            
            // Log local stream tracks
            const localAudioTracks = this.localStream.getAudioTracks();
            const localVideoTracks = this.localStream.getVideoTracks();
            console.log('🎤 Local audio tracks:', localAudioTracks.length);
            console.log('📹 Local video tracks:', localVideoTracks.length);
            localAudioTracks.forEach((track, index) => {
                console.log(`   Audio track ${index}:`, {
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState,
                    label: track.label
                });
            });

            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.rtcConfig);

            // Add local stream tracks
            this.localStream.getTracks().forEach(track => {
                console.log(`📤 Adding ${track.kind} track to peer connection:`, track.label);
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.supabaseService.sendCallSignal(
                        this.currentCallId,
                        signalData.callerId,
                        'ice-candidate',
                        event.candidate
                    );
                }
            };

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('✅ Received remote stream');
                console.log('   Event streams:', event.streams.length);
                console.log('   Event track:', event.track.kind, event.track.enabled);
                
                this.remoteStream = event.streams[0];
                
                // Ensure audio tracks are enabled
                if (this.remoteStream) {
                    const audioTracks = this.remoteStream.getAudioTracks();
                    audioTracks.forEach(track => {
                        track.enabled = true;
                        console.log('🎤 Enabled remote audio track:', track.label);
                    });
                    
                    const videoTracks = this.remoteStream.getVideoTracks();
                    videoTracks.forEach(track => {
                        track.enabled = true;
                        console.log('📹 Enabled remote video track:', track.label);
                    });
                }
                
                if (this.onCallStateChange) {
                    this.onCallStateChange('connected', this.remoteStream);
                }
            };

            // Set remote description from offer
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(signalData.offer)
            );

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer signal
            await this.supabaseService.sendCallSignal(
                this.currentCallId,
                signalData.callerId,
                'call-accept',
                { answer: answer }
            );

            // Update call log
            if (this.currentCallLogId) {
                await this.supabaseService.updateCallLog(this.currentCallLogId, 'answered');
            }

            // Subscribe to signaling
            this.subscribeToCallSignaling(this.currentCallId);

            this.isCallActive = true;
            this.isIncomingCall = false;
            this.callStartTime = Date.now();

            if (this.onCallStateChange) {
                this.onCallStateChange('answered', null);
            }

            console.log('✅ Call answered:', this.currentCallId);
            return true;

        } catch (error) {
            console.error('Error answering call:', error);
            this.cleanup();
            return false;
        }
    }

    /**
     * Reject an incoming call
     * @param {Object} callRequest - The incoming call request
     */
    async rejectCall(callRequest) {
        const signalData = callRequest.signal_data;
        await this.supabaseService.sendCallSignal(
            signalData.callId,
            signalData.callerId,
            'call-reject',
            {}
        );

        if (this.currentCallLogId) {
            await this.supabaseService.updateCallLog(this.currentCallLogId, 'rejected');
        }

        this.isIncomingCall = false;
        this.cleanup();
    }

    /**
     * End the current call
     * @param {string} reason - Reason for ending (optional)
     */
    async endCall(reason = 'ended') {
        if (!this.isCallActive && !this.isIncomingCall) {
            return;
        }

        try {
            // Calculate call duration
            let durationSeconds = null;
            if (this.callStartTime) {
                durationSeconds = Math.floor((Date.now() - this.callStartTime) / 1000);
            }

            // Update call log
            if (this.currentCallLogId) {
                await this.supabaseService.updateCallLog(
                    this.currentCallLogId,
                    reason === 'failed' ? 'failed' : 'ended',
                    durationSeconds
                );
            }

            // Send end signal if we have a call ID
            if (this.currentCallId && this.currentReceiverId) {
                await this.supabaseService.sendCallSignal(
                    this.currentCallId,
                    this.currentReceiverId,
                    'call-end',
                    { reason: reason }
                );
            }

            // Cleanup
            this.cleanup();

            if (this.onCallEnded) {
                this.onCallEnded(reason, durationSeconds);
            }

            console.log('📞 Call ended:', reason);

        } catch (error) {
            console.error('Error ending call:', error);
            this.cleanup();
        }
    }

    /**
     * Subscribe to call signaling
     */
    subscribeToCallSignaling(callId) {
        if (this.signalUnsubscribe) {
            this.signalUnsubscribe();
        }

        this.signalUnsubscribe = this.supabaseService.subscribeToCallSignaling(
            callId,
            async (signal) => {
                await this.handleSignal(signal);
            }
        );
    }

    /**
     * Handle incoming signaling data
     */
    async handleSignal(signal) {
        try {
            switch (signal.signal_type) {
                case 'call-accept':
                    // Remote peer accepted the call
                    await this.peerConnection.setRemoteDescription(
                        new RTCSessionDescription(signal.signal_data.answer)
                    );
                    if (this.currentCallLogId) {
                        await this.supabaseService.updateCallLog(this.currentCallLogId, 'answered');
                    }
                    if (this.onCallStateChange) {
                        this.onCallStateChange('answered', null);
                    }
                    break;

                case 'call-reject':
                    // Remote peer rejected the call
                    if (this.currentCallLogId) {
                        await this.supabaseService.updateCallLog(this.currentCallLogId, 'rejected');
                    }
                    this.endCall('rejected');
                    break;

                case 'call-end':
                    // Remote peer ended the call
                    this.endCall('ended');
                    break;

                case 'ice-candidate':
                    // Add ICE candidate
                    if (this.peerConnection && signal.signal_data) {
                        await this.peerConnection.addIceCandidate(
                            new RTCIceCandidate(signal.signal_data)
                        );
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling signal:', error);
        }
    }

    /**
     * Cleanup call resources
     */
    cleanup() {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Unsubscribe from signaling
        if (this.signalUnsubscribe) {
            this.signalUnsubscribe();
            this.signalUnsubscribe = null;
        }

        // Stop polling
        if (this.incomingCallPollInterval) {
            clearInterval(this.incomingCallPollInterval);
            this.incomingCallPollInterval = null;
        }

        // Cleanup signaling data
        if (this.currentCallId) {
            this.supabaseService.deleteCallSignaling(this.currentCallId);
        }

        this.isCallActive = false;
        this.isIncomingCall = false;
        this.currentCallId = null;
        this.currentCallLogId = null;
        this.currentReceiverId = null;
        this.callStartTime = null;
        this.remoteStream = null;

        if (this.onCallStateChange) {
            this.onCallStateChange('ended', null);
        }
    }

    /**
     * Toggle mute/unmute
     */
    toggleMute() {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            return !audioTracks[0]?.enabled;
        }
        return false;
    }

    /**
     * Toggle video on/off
     */
    toggleVideo() {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = !track.enabled;
            });
            return !videoTracks[0]?.enabled;
        }
        return false;
    }
}

// Create global instance
window.voipCallManager = new VOIPCallManager();

