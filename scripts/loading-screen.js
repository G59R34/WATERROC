/**
 * PURPOSELY SUPER SLOW: Fake loading screens with randomized 5-10 second delays
 * Creates loading overlays that appear for random durations between 5-10 seconds
 * Plays loading.wav sound when loading completes
 */

// Create and cache audio element for loading sound
let loadingAudio = null;
function getLoadingAudio() {
    if (!loadingAudio) {
        loadingAudio = new Audio('loading.wav');
        loadingAudio.volume = 0.7; // Set volume to 70%
        loadingAudio.preload = 'auto';
    }
    return loadingAudio;
}

// Play loading sound
function playLoadingSound() {
    try {
        const audio = getLoadingAudio();
        audio.currentTime = 0; // Reset to start
        audio.play().catch(error => {
            console.log('Could not play loading sound:', error);
            // Silently fail if audio can't play (e.g., user hasn't interacted yet)
        });
    } catch (error) {
        console.log('Error playing loading sound:', error);
    }
}

// Create a global loading overlay element
function createLoadingOverlay(message = 'Loading...') {
    // Remove existing overlay if present
    const existing = document.getElementById('globalLoadingOverlay');
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'globalLoadingOverlay';
    overlay.className = 'global-loading-overlay';
    overlay.innerHTML = `
        <div class="global-loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-message">${message}</p>
            <div class="loading-progress-container">
                <div class="loading-progress-bar"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Animate progress bar
    const progressBar = overlay.querySelector('.loading-progress-bar');
    if (progressBar) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 3; // Random progress increments
            if (progress > 100) progress = 100;
            progressBar.style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(interval);
            }
        }, 200);
    }
    
    return overlay;
}

// Show loading screen with random duration (5-10 seconds)
function showLoadingScreen(message = 'Loading...', callback = null) {
    const overlay = createLoadingOverlay(message);
    overlay.style.display = 'flex';
    
    // CRITICAL: Only disable pointer events on the overlay itself, not the entire body
    // This allows the page to function while showing the overlay
    overlay.style.pointerEvents = 'auto';
    
    // Random duration between 5-10 seconds
    const minDuration = 5000; // 5 seconds
    const maxDuration = 10000; // 10 seconds
    const duration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    
    setTimeout(() => {
        hideLoadingScreen();
        if (callback && typeof callback === 'function') {
            callback();
        }
    }, duration);
    
    return overlay;
}

// Hide loading screen
function hideLoadingScreen() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            // ADDED: Play loading sound when loading completes
            playLoadingSound();
        }, 500); // Fade out transition
    } else {
        // If no overlay, still play sound (for page load completion)
        playLoadingSound();
    }
}

// Show loading screen for page navigation
function showPageLoadScreen() {
    const messages = [
        'Loading page...',
        'Preparing dashboard...',
        'Fetching data...',
        'Initializing components...',
        'Loading resources...',
        'Please wait...',
        'Processing request...',
        'Syncing data...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage, () => {
        // ADDED: Play loading sound when page load completes
        playLoadingSound();
    });
}

// Show loading screen for form submissions
function showFormLoadingScreen(formName = 'form') {
    const messages = [
        'Submitting ' + formName + '...',
        'Processing ' + formName + '...',
        'Saving data...',
        'Validating information...',
        'Uploading...',
        'Processing request...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// Show loading screen for data fetching
function showDataLoadingScreen(dataType = 'data') {
    const messages = [
        'Loading ' + dataType + '...',
        'Fetching ' + dataType + '...',
        'Retrieving information...',
        'Syncing ' + dataType + '...',
        'Processing ' + dataType + '...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// Show loading screen for button actions
function showActionLoadingScreen(actionName = 'action') {
    const messages = [
        'Processing ' + actionName + '...',
        'Executing ' + actionName + '...',
        'Please wait...',
        'Working on it...',
        'This may take a moment...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
    window.showLoadingScreen = showLoadingScreen;
    window.hideLoadingScreen = hideLoadingScreen;
    window.showPageLoadScreen = showPageLoadScreen;
    window.showFormLoadingScreen = showFormLoadingScreen;
    window.showDataLoadingScreen = showDataLoadingScreen;
    window.showActionLoadingScreen = showActionLoadingScreen;
    window.playLoadingSound = playLoadingSound; // Export for manual triggering
}

// ADDED: Play sound when page fully loads (DOMContentLoaded + window.load)
if (typeof document !== 'undefined') {
    // Play sound when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // Wait a bit for page to fully render
            setTimeout(() => {
                if (typeof showPageLoadScreen === 'undefined' || !document.getElementById('globalLoadingOverlay')) {
                    // Only play if no loading screen is showing (to avoid double play)
                    playLoadingSound();
                }
            }, 100);
        });
    } else {
        // DOM already loaded
        setTimeout(() => {
            if (typeof showPageLoadScreen === 'undefined' || !document.getElementById('globalLoadingOverlay')) {
                playLoadingSound();
            }
        }, 100);
    }
    
    // Also play when window fully loads (all resources loaded)
    window.addEventListener('load', function() {
        setTimeout(() => {
            // Only play if no loading screen is currently showing
            if (!document.getElementById('globalLoadingOverlay')) {
                playLoadingSound();
            }
        }, 200);
    });
}

