// ============================================
// Forced Attention Lock - AGGRESSIVE MODE
// Monitors user attention and forces refocus on high-value pages
// ============================================

console.log('[ATTENTION LOCK] Script loaded');

(function() {
    'use strict';
    
    console.log('[ATTENTION LOCK] IIFE executing');
    
    // Configuration - AGGRESSIVE SETTINGS
    const ATTENTION_LOCK_ENABLED = true;
    const IDLE_THRESHOLD_MS = 20000; // 20 seconds - fullscreen sooner
    const NOTIFICATION_INTERVAL_MS = 2000; // Notifications every 2 seconds (CONSTANT/AGGRESSIVE)
    const SPLASH_DISPLAY_DELAY_MS = 25000; // Show splash 25 seconds after going away
    const REWARD_ACTIVE_TIME_MS = 60000; // 1 minute of active time to earn reward
    const REWARD_GAME_TIME_MS = 10000; // 10 seconds of game time reward
    
    // High-value pages that require attention lock
    const HIGH_VALUE_PAGES = [
        'admin.html',
        'employee.html',
        'analytics.html',
        'employee-monitor.html',
        'profiles.html',
        'crew-scheduling.html'
    ];
    
    // State
    let hiddenStartTime = null;
    let reminderInterval = null;
    let notificationInterval = null;
    let reminderCount = 0;
    let lastNotificationTime = 0;
    let splashOverlay = null;
    let wasFullscreen = false;
    let fullscreenRequested = false;
    
    // Reward system state
    let activeStartTime = null;
    let totalActiveTime = 0;
    let rewardGameWindow = null;
    let rewardGameTimeout = null;
    let isRewardGameActive = false;
    const isEmployeePage = window.location.pathname.includes('employee.html');
    
    // Check if current page requires attention lock
    function isHighValuePage() {
        const pathname = window.location.pathname || '';
        const href = window.location.href || '';
        const currentPage = pathname.split('/').pop() || href.split('/').pop() || href;
        
        const isHighValue = HIGH_VALUE_PAGES.some(page => 
            currentPage.includes(page) || 
            pathname.includes(page) || 
            href.includes(page)
        );
        
        console.log('[ATTENTION LOCK] Page check:', {
            pathname: pathname,
            currentPage: currentPage,
            isHighValue: isHighValue,
            highValuePages: HIGH_VALUE_PAGES
        });
        
        return isHighValue;
    }
    
    // Check if feature is enabled (do this check after DOM is ready)
    function checkAndInitialize() {
        if (!ATTENTION_LOCK_ENABLED) {
            console.log('[ATTENTION LOCK] Feature is disabled');
            return false;
        }
        
        if (!isHighValuePage()) {
            console.log('[ATTENTION LOCK] Not a high-value page, skipping');
            return false;
        }
        
        return true;
    }
    
    // Create splash overlay that blocks the page
    function createSplashOverlay() {
        if (splashOverlay) return; // Already exists
        
        splashOverlay = document.createElement('div');
        splashOverlay.id = 'waterroc-attention-splash';
        splashOverlay.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                z-index: 999999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                text-align: center;
                padding: 40px;
                box-sizing: border-box;
            ">
                <div style="
                    font-size: 72px;
                    margin-bottom: 30px;
                    animation: pulse 2s infinite;
                ">⚠️</div>
                <h1 style="
                    font-size: 48px;
                    margin: 0 0 20px 0;
                    font-weight: 700;
                ">PLEASE RETURN</h1>
                <p style="
                    font-size: 24px;
                    margin: 0 0 30px 0;
                    opacity: 0.9;
                ">Complete this step for security</p>
                <p style="
                    font-size: 18px;
                    margin: 0;
                    opacity: 0.8;
                ">You've been away from the page. Please return immediately.</p>
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
            </style>
        `;
        
        document.body.appendChild(splashOverlay);
        console.log('[ATTENTION LOCK] Splash overlay displayed');
    }
    
    // Remove splash overlay
    function removeSplashOverlay() {
        if (splashOverlay && splashOverlay.parentNode) {
            splashOverlay.parentNode.removeChild(splashOverlay);
            splashOverlay = null;
            console.log('[ATTENTION LOCK] Splash overlay removed');
        }
    }
    
    // Force fullscreen
    async function forceFullscreen() {
        if (fullscreenRequested) return; // Already requested
        
        try {
            // Check if already in fullscreen
            const isFullscreen = document.fullscreenElement || 
                                document.webkitFullscreenElement || 
                                document.mozFullScreenElement || 
                                document.msFullscreenElement;
            
            if (!isFullscreen) {
                fullscreenRequested = true;
                wasFullscreen = false;
                
                // Try standard fullscreen API
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                } else if (document.documentElement.webkitRequestFullscreen) {
                    await document.documentElement.webkitRequestFullscreen();
                } else if (document.documentElement.mozRequestFullScreen) {
                    await document.documentElement.mozRequestFullScreen();
                } else if (document.documentElement.msRequestFullscreen) {
                    await document.documentElement.msRequestFullscreen();
                }
                
                // Try Electron fullscreen if available
                if (typeof require !== 'undefined') {
                    try {
                        const { ipcRenderer } = require('electron');
                        if (ipcRenderer) {
                            ipcRenderer.send('force-fullscreen');
                        }
                    } catch (e) {
                        // Not in Electron
                    }
                }
                
                console.log('[ATTENTION LOCK] Forced fullscreen mode');
            } else {
                wasFullscreen = true;
            }
        } catch (e) {
            console.warn('[ATTENTION LOCK] Could not force fullscreen:', e);
        }
    }
    
    // Exit fullscreen
    async function exitFullscreen() {
        if (wasFullscreen) return; // Was already in fullscreen, don't exit
        
        try {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                await document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                await document.msExitFullscreen();
            }
            
            if (typeof require !== 'undefined') {
                try {
                    const { ipcRenderer } = require('electron');
                    if (ipcRenderer) {
                        ipcRenderer.send('exit-fullscreen');
                    }
                } catch (e) {
                    // Not in Electron
                }
            }
            
            fullscreenRequested = false;
            console.log('[ATTENTION LOCK] Exited fullscreen mode');
        } catch (e) {
            console.warn('[ATTENTION LOCK] Could not exit fullscreen:', e);
        }
    }
    
    // Create full-screen aggressive notification overlay
    let notificationOverlay = null;
    function createAggressiveNotificationOverlay(message, detail) {
        // Remove existing overlay if any
        if (notificationOverlay && notificationOverlay.parentNode) {
            notificationOverlay.parentNode.removeChild(notificationOverlay);
        }
        
        notificationOverlay = document.createElement('div');
        notificationOverlay.id = 'waterroc-aggressive-notification';
        notificationOverlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(239, 68, 68, 0.98) !important;
            z-index: 9999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            color: white !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            text-align: center !important;
            padding: 40px !important;
            box-sizing: border-box !important;
            animation: pulse-red 0.5s infinite !important;
            cursor: default !important;
            user-select: none !important;
            pointer-events: auto !important;
        `;
        
        notificationOverlay.innerHTML = `
            <div style="
                font-size: 120px;
                margin-bottom: 40px;
                animation: bounce 1s infinite;
            ">🚨</div>
            <h1 style="
                font-size: 64px;
                margin: 0 0 30px 0;
                font-weight: 900;
                text-shadow: 3px 3px 6px rgba(0,0,0,0.5);
            ">${message}</h1>
            <p style="
                font-size: 32px;
                margin: 0 0 50px 0;
                opacity: 0.95;
                line-height: 1.5;
            ">${detail}</p>
            <p style="
                font-size: 24px;
                margin: 0;
                opacity: 0.9;
            ">RETURN TO THE PAGE IMMEDIATELY</p>
            <style>
                @keyframes pulse-red {
                    0%, 100% { background: rgba(239, 68, 68, 0.98); }
                    50% { background: rgba(220, 38, 38, 0.98); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-20px); }
                }
            </style>
        `;
        
        document.body.appendChild(notificationOverlay);
        
        // Remove overlay after 1.5 seconds (before next one appears)
        setTimeout(() => {
            if (notificationOverlay && notificationOverlay.parentNode) {
                notificationOverlay.style.opacity = '0';
                notificationOverlay.style.transition = 'opacity 0.3s';
                setTimeout(() => {
                    if (notificationOverlay && notificationOverlay.parentNode) {
                        notificationOverlay.parentNode.removeChild(notificationOverlay);
                        notificationOverlay = null;
                    }
                }, 300);
            }
        }, 1500);
    }
    
    // Show notification/alert - CONSTANT AGGRESSIVE MODE WITH FULL-SCREEN OVERLAY
    function triggerAttentionReminder() {
        const now = Date.now();
        const timeAway = Math.floor((now - hiddenStartTime) / 1000);
        
        const message = `PLEASE RETURN NOW`;
        const detail = `You've been away for ${timeAway} seconds. This is unacceptable.`;
        
        // CONSTANT: Always try to focus the window on EVERY reminder
        try {
            window.focus();
            
            // Try to use Electron's focus if available
            if (typeof require !== 'undefined') {
                try {
                    const { ipcRenderer } = require('electron');
                    if (ipcRenderer) {
                        ipcRenderer.send('force-window-focus');
                    }
                } catch (e) {
                    // Not in Electron or IPC not available
                }
            }
        } catch (e) {
            console.warn('Could not focus window:', e);
        }
        
        // AGGRESSIVE: Full-screen red overlay that takes over the screen
        createAggressiveNotificationOverlay(message, detail);
        
        // Also show browser notification as backup
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(message, {
                    body: detail,
                    icon: '/favicon.png',
                    tag: 'waterroc-attention-constant',
                    requireInteraction: true,
                    silent: false
                });
            } catch (e) {
                // Ignore
            }
        }
        
        // Log for debugging
        console.log(`[ATTENTION LOCK] Reminder #${reminderCount + 1}: User away for ${timeAway}s`);
        reminderCount++;
        lastNotificationTime = now;
    }
    
    // Track active time for reward system
    function startActiveTimeTracking() {
        if (!isEmployeePage) return; // Only for employee pages
        
        if (!activeStartTime) {
            activeStartTime = Date.now();
            console.log('[REWARD SYSTEM] Started tracking active time');
        }
    }
    
    function stopActiveTimeTracking() {
        if (!isEmployeePage || !activeStartTime) return;
        
        const activeDuration = Date.now() - activeStartTime;
        totalActiveTime += activeDuration;
        activeStartTime = null;
        
        console.log(`[REWARD SYSTEM] Paused tracking. Total active time: ${Math.floor(totalActiveTime / 1000)}s`);
    }
    
    function checkAndGrantReward() {
        if (!isEmployeePage) return;
        
        if (activeStartTime) {
            const currentSessionTime = Date.now() - activeStartTime;
            const totalTime = totalActiveTime + currentSessionTime;
            
            if (totalTime >= REWARD_ACTIVE_TIME_MS && !isRewardGameActive) {
                grantGameReward();
                // Reset after granting reward
                totalActiveTime = 0;
                activeStartTime = Date.now(); // Reset for next reward cycle
            }
        }
    }
    
    function grantGameReward() {
        if (isRewardGameActive) return;
        
        isRewardGameActive = true;
        console.log(`[REWARD SYSTEM] 🎮 Granting ${REWARD_GAME_TIME_MS / 1000}s of Krunker.io game time!`);
        
        // Close any existing reward window
        if (rewardGameWindow && !rewardGameWindow.closed) {
            rewardGameWindow.close();
        }
        
        // Create game window
        const gameUrl = 'https://krunker.io';
        const windowFeatures = 'width=1200,height=800,left=100,top=100,resizable=yes,scrollbars=yes';
        
        try {
            rewardGameWindow = window.open(gameUrl, 'KrunkerReward', windowFeatures);
            
            if (rewardGameWindow) {
                // Show reward notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('🎮 Reward Unlocked!', {
                        body: `You've been active for 1 minute! Enjoy ${REWARD_GAME_TIME_MS / 1000} seconds of Krunker.io!`,
                        icon: '/favicon.png'
                    });
                }
                
                // Close game window after reward time
                rewardGameTimeout = setTimeout(() => {
                    if (rewardGameWindow && !rewardGameWindow.closed) {
                        rewardGameWindow.close();
                        console.log('[REWARD SYSTEM] Game time expired, window closed');
                    }
                    isRewardGameActive = false;
                    rewardGameWindow = null;
                    
                    // Notify that reward time is over
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('⏰ Reward Time Over', {
                            body: 'Your game time has ended. Stay active to earn more rewards!',
                            icon: '/favicon.png'
                        });
                    }
                }, REWARD_GAME_TIME_MS);
            }
        } catch (e) {
            console.error('[REWARD SYSTEM] Could not open game window:', e);
            isRewardGameActive = false;
        }
    }
    
    // Start monitoring when page becomes hidden - CONSTANT AGGRESSIVE MODE
    function handleVisibilityChange() {
        if (document.hidden || document.visibilityState === 'hidden') {
            // Page became hidden - start timer
            hiddenStartTime = Date.now();
            reminderCount = 0;
            fullscreenRequested = false;
            stopActiveTimeTracking(); // Pause active time tracking
            
            // CONSTANT: Start continuous notifications IMMEDIATELY (don't wait for threshold)
            triggerAttentionReminder(); // First notification right away
            startContinuousNotifications();
            
            // AGGRESSIVE: Force fullscreen after 20 seconds
            setTimeout(() => {
                if (document.hidden && hiddenStartTime) {
                    createSplashOverlay();
                    forceFullscreen();
                }
            }, IDLE_THRESHOLD_MS);
            
        } else {
            // Page became visible - stop monitoring
            if (hiddenStartTime) {
                const timeAway = Date.now() - hiddenStartTime;
                if (timeAway > IDLE_THRESHOLD_MS) {
                    console.log(`[ATTENTION LOCK] User returned after ${Math.floor(timeAway / 1000)}s away`);
                }
            }
            hiddenStartTime = null;
            reminderCount = 0;
            stopContinuousNotifications();
            removeSplashOverlay();
            
            // Resume active time tracking for rewards
            startActiveTimeTracking();
            
            // Exit fullscreen if we forced it
            if (fullscreenRequested && !wasFullscreen) {
                setTimeout(() => exitFullscreen(), 1000);
            }
            fullscreenRequested = false;
        }
    }
    
    // Start continuous notifications - CONSTANT: Every 2 seconds
    function startContinuousNotifications() {
        stopContinuousNotifications(); // Clear any existing interval
        
        notificationInterval = setInterval(() => {
            if (document.hidden && hiddenStartTime) {
                // CONSTANT: Trigger reminder every 2 seconds
                triggerAttentionReminder();
                
                // Keep splash visible and fullscreen active
                if (!splashOverlay) {
                    createSplashOverlay();
                }
                if (!fullscreenRequested) {
                    forceFullscreen();
                }
            } else {
                stopContinuousNotifications();
            }
        }, NOTIFICATION_INTERVAL_MS);
    }
    
    // Stop continuous notifications
    function stopContinuousNotifications() {
        if (notificationInterval) {
            clearInterval(notificationInterval);
            notificationInterval = null;
        }
        if (reminderInterval) {
            clearTimeout(reminderInterval);
            reminderInterval = null;
        }
    }
    
    // Also handle window blur/focus events (for tab switching) - CONSTANT AGGRESSIVE
    function handleWindowBlur() {
        if (!document.hidden) {
            // Window lost focus but page is still visible - start timer
            hiddenStartTime = Date.now();
            reminderCount = 0;
            fullscreenRequested = false;
            stopActiveTimeTracking(); // Pause active time tracking
            
            // CONSTANT: Start notifications immediately
            triggerAttentionReminder();
            startContinuousNotifications();
            
            // Force fullscreen after 20 seconds
            setTimeout(() => {
                if (hiddenStartTime && (!document.hasFocus() || window.blurred)) {
                    createSplashOverlay();
                    forceFullscreen();
                }
            }, IDLE_THRESHOLD_MS);
        }
    }
    
    function handleWindowFocus() {
        if (hiddenStartTime) {
            const timeAway = Date.now() - hiddenStartTime;
            if (timeAway > IDLE_THRESHOLD_MS) {
                console.log(`[ATTENTION LOCK] Window refocused after ${Math.floor(timeAway / 1000)}s`);
            }
        }
        hiddenStartTime = null;
        reminderCount = 0;
        stopContinuousNotifications();
        removeSplashOverlay();
        
        // Resume active time tracking for rewards
        startActiveTimeTracking();
        
        // Exit fullscreen if we forced it
        if (fullscreenRequested && !wasFullscreen) {
            setTimeout(() => exitFullscreen(), 1000);
        }
        fullscreenRequested = false;
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (checkAndInitialize()) {
                init();
            }
        });
    } else {
        if (checkAndInitialize()) {
            init();
        }
    }
    
    function init() {
        console.log('[ATTENTION LOCK] Starting initialization...');
        
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {
                console.warn('[ATTENTION LOCK] Notification permission denied or not supported');
            });
        }
        
        // Listen for visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        console.log('[ATTENTION LOCK] Visibility change listener added');
        
        // Listen for window blur/focus
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);
        console.log('[ATTENTION LOCK] Blur/focus listeners added');
        
        // Track if window is blurred (for cases where blur event doesn't fire)
        let windowBlurred = false;
        window.addEventListener('blur', () => { windowBlurred = true; });
        window.addEventListener('focus', () => { windowBlurred = false; });
        window.blurred = windowBlurred;
        
        // Start active time tracking for rewards (if employee page)
        if (isEmployeePage && !document.hidden) {
            startActiveTimeTracking();
            
            // Check for reward every 10 seconds while active
            setInterval(() => {
                if (!document.hidden && !hiddenStartTime) {
                    checkAndGrantReward();
                }
            }, 10000);
            console.log('[ATTENTION LOCK] Reward system initialized');
        }
        
        // Test trigger - log current state
        console.log('[ATTENTION LOCK] Current state:', {
            documentHidden: document.hidden,
            visibilityState: document.visibilityState,
            hasFocus: document.hasFocus(),
            isEmployeePage: isEmployeePage
        });
        
        console.log('[ATTENTION LOCK] ✅ Initialized successfully on high-value page' + (isEmployeePage ? ' (Reward system enabled)' : ''));
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopContinuousNotifications();
        removeSplashOverlay();
        stopActiveTimeTracking();
        if (rewardGameWindow && !rewardGameWindow.closed) {
            rewardGameWindow.close();
        }
        if (rewardGameTimeout) {
            clearTimeout(rewardGameTimeout);
        }
        if (fullscreenRequested && !wasFullscreen) {
            exitFullscreen();
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('focus', handleWindowFocus);
    });
    
    // Handle fullscreen changes to track state
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && fullscreenRequested && !wasFullscreen) {
            // User exited fullscreen - force it back if still away
            if (document.hidden && hiddenStartTime) {
                setTimeout(() => forceFullscreen(), 500);
            }
        }
    });
    
    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.webkitFullscreenElement && fullscreenRequested && !wasFullscreen) {
            if (document.hidden && hiddenStartTime) {
                setTimeout(() => forceFullscreen(), 500);
            }
        }
    });
})();

