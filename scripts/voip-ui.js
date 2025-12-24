// VOIP UI Manager
// Handles all UI interactions for VOIP calls

class VOIPUI {
    constructor() {
        this.callManager = window.voipCallManager;
        this.incomingCallModal = null;
        this.activeCallModal = null;
        this.currentCallDuration = null;
        this.durationInterval = null;
    }

    /**
     * Initialize VOIP UI
     */
    async initialize() {
        if (!this.callManager) {
            console.error('VOIP Call Manager not available');
            return;
        }

        // Set up call manager callbacks
        this.callManager.onIncomingCall = (signal) => this.handleIncomingCall(signal);
        this.callManager.onCallStateChange = (state, stream) => this.handleCallStateChange(state, stream);
        this.callManager.onCallEnded = (reason, duration) => this.handleCallEnded(reason, duration);

        // Initialize call manager
        await this.callManager.initialize();

        console.log('✅ VOIP UI initialized');
    }

    /**
     * Show call button for an employee
     * @param {HTMLElement} container - Container to add button to
     * @param {Object} employee - Employee object
     */
    addCallButton(container, employee) {
        const buttonGroup = document.createElement('div');
        buttonGroup.style.display = 'inline-flex';
        buttonGroup.style.gap = '8px';

        // Audio call button
        const audioBtn = document.createElement('button');
        audioBtn.className = 'voip-call-button';
        audioBtn.innerHTML = '📞 Call';
        audioBtn.title = `Call ${employee.name}`;
        audioBtn.addEventListener('click', () => this.initiateCall(employee.id, employee.name, 'audio'));

        // Video call button
        const videoBtn = document.createElement('button');
        videoBtn.className = 'voip-call-button video-call';
        videoBtn.innerHTML = '📹 Video';
        videoBtn.title = `Video call ${employee.name}`;
        videoBtn.addEventListener('click', () => this.initiateCall(employee.id, employee.name, 'video'));

        buttonGroup.appendChild(audioBtn);
        buttonGroup.appendChild(videoBtn);
        container.appendChild(buttonGroup);
    }

    /**
     * Initiate a call
     */
    async initiateCall(receiverId, receiverName, callType) {
        if (!this.callManager) {
            alert('Call system not available');
            return;
        }

        const success = await this.callManager.initiateCall(receiverId, receiverName, callType);
        if (success) {
            this.showActiveCallModal(receiverName, callType);
        } else {
            alert('Failed to initiate call. Please check your microphone permissions.');
        }
    }

    /**
     * Handle incoming call
     */
    handleIncomingCall(signal) {
        const signalData = signal.signal_data;
        this.showIncomingCallModal(signalData);
    }

    /**
     * Show incoming call modal
     */
    showIncomingCallModal(callData) {
        // Remove any existing modals
        this.removeIncomingCallModal();
        this.removeActiveCallModal();

        const modal = document.createElement('div');
        modal.className = 'incoming-call-modal';
        modal.innerHTML = `
            <div class="incoming-call-content">
                <div class="incoming-call-avatar">
                    ${this.getInitials(callData.callerName)}
                </div>
                <div class="incoming-call-name">${this.escapeHtml(callData.callerName)}</div>
                <div class="incoming-call-status">
                    ${callData.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming call'}
                </div>
                <div class="incoming-call-actions">
                    <button class="call-action-button accept" data-action="accept">
                        ✓
                    </button>
                    <button class="call-action-button reject" data-action="reject">
                        ✗
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('[data-action="accept"]').addEventListener('click', async () => {
            await this.callManager.answerCall({ signal_data: callData });
            this.removeIncomingCallModal();
        });

        modal.querySelector('[data-action="reject"]').addEventListener('click', async () => {
            await this.callManager.rejectCall({ signal_data: callData });
            this.removeIncomingCallModal();
        });

        document.body.appendChild(modal);
        this.incomingCallModal = modal;

        // Play ringtone (optional - can be added)
        this.playRingtone();
    }

    /**
     * Remove incoming call modal
     */
    removeIncomingCallModal() {
        if (this.incomingCallModal) {
            this.incomingCallModal.remove();
            this.incomingCallModal = null;
        }
        this.stopRingtone();
    }

    /**
     * Handle call state change
     */
    handleCallStateChange(state, stream) {
        if (state === 'connected' && stream) {
            this.updateActiveCallVideo(stream);
        } else if (state === 'answered') {
            // Call was answered, update UI
        } else if (state === 'ended') {
            this.removeActiveCallModal();
        }
    }

    /**
     * Show active call modal
     */
    showActiveCallModal(receiverName, callType) {
        this.removeIncomingCallModal();
        this.removeActiveCallModal();

        const isAudioOnly = callType === 'audio';
        const modal = document.createElement('div');
        modal.className = `active-call-modal ${isAudioOnly ? 'audio-only' : ''}`;
        modal.innerHTML = `
            <div class="active-call-video-container">
                <div class="call-video" id="localVideo">
                    <video id="localVideoElement" autoplay muted playsinline></video>
                    <div class="call-video-label">You</div>
                </div>
                <div class="call-video" id="remoteVideo">
                    <div class="call-video-label">${this.escapeHtml(receiverName)}</div>
                    <video id="remoteVideoElement" autoplay playsinline></video>
                </div>
            </div>
            <div class="active-call-info">
                <div class="active-call-name">${this.escapeHtml(receiverName)}</div>
                <div class="active-call-duration" id="callDuration">00:00</div>
            </div>
            <div class="active-call-controls">
                <button class="call-control-button mute" id="muteButton" title="Mute/Unmute">
                    🎤
                </button>
                <button class="call-control-button video-toggle" id="videoToggleButton" title="Toggle Video">
                    📹
                </button>
                <button class="call-control-button end-call" id="endCallButton" title="End Call">
                    ✗
                </button>
            </div>
        `;

        // Add event listeners
        modal.querySelector('#muteButton').addEventListener('click', () => {
            const isMuted = this.callManager.toggleMute();
            const btn = modal.querySelector('#muteButton');
            btn.classList.toggle('active', isMuted);
        });

        modal.querySelector('#videoToggleButton').addEventListener('click', () => {
            const isVideoOff = this.callManager.toggleVideo();
            const btn = modal.querySelector('#videoToggleButton');
            btn.classList.toggle('active', isVideoOff);
        });

        modal.querySelector('#endCallButton').addEventListener('click', () => {
            this.callManager.endCall('ended');
        });

        // Set up local video
        if (this.callManager.localStream) {
            const localVideo = modal.querySelector('#localVideoElement');
            if (localVideo) {
                localVideo.srcObject = this.callManager.localStream;
            }
        }

        document.body.appendChild(modal);
        this.activeCallModal = modal;

        // Start duration timer
        this.startCallDuration();
    }

    /**
     * Update remote video stream
     */
    updateActiveCallVideo(stream) {
        if (this.activeCallModal) {
            const remoteVideo = this.activeCallModal.querySelector('#remoteVideoElement');
            if (remoteVideo) {
                remoteVideo.srcObject = stream;
            }
        }
    }

    /**
     * Remove active call modal
     */
    removeActiveCallModal() {
        if (this.activeCallModal) {
            this.activeCallModal.remove();
            this.activeCallModal = null;
        }
        this.stopCallDuration();
    }

    /**
     * Handle call ended
     */
    handleCallEnded(reason, duration) {
        this.removeActiveCallModal();
        this.removeIncomingCallModal();
        
        // Show notification
        if (typeof notificationSystem !== 'undefined') {
            const message = reason === 'rejected' 
                ? 'Call was rejected' 
                : reason === 'missed'
                ? 'Call was missed'
                : `Call ended. Duration: ${this.formatDuration(duration)}`;
            
            notificationSystem.addNotification('Call Ended', message, 'info');
        }
    }

    /**
     * Start call duration timer
     */
    startCallDuration() {
        this.currentCallDuration = 0;
        const durationElement = this.activeCallModal?.querySelector('#callDuration');
        
        this.durationInterval = setInterval(() => {
            this.currentCallDuration++;
            if (durationElement) {
                durationElement.textContent = this.formatDuration(this.currentCallDuration);
            }
        }, 1000);
    }

    /**
     * Stop call duration timer
     */
    stopCallDuration() {
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
            this.durationInterval = null;
        }
        this.currentCallDuration = null;
    }

    /**
     * Format duration in seconds to MM:SS
     */
    formatDuration(seconds) {
        if (!seconds) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    /**
     * Get initials from name
     */
    getInitials(name) {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Play ringtone (simple beep pattern)
     */
    playRingtone() {
        // Simple ringtone using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
            
            // Repeat every 2 seconds
            this.ringtoneInterval = setInterval(() => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.value = 800;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, audioContext.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                osc.start();
                osc.stop(audioContext.currentTime + 0.3);
            }, 2000);
        } catch (error) {
            console.warn('Could not play ringtone:', error);
        }
    }

    /**
     * Stop ringtone
     */
    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
    }
}

// Create global instance
window.voipUI = new VOIPUI();

