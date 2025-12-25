/**
 * Loading screens with 1.5 second delays
 * Creates loading overlays that appear for 1.5 seconds
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

// Show loading screen with 1.5 second duration
function showLoadingScreen(message = 'Loading...', callback = null) {
    const overlay = createLoadingOverlay(message);
    overlay.style.display = 'flex';
    
    // CRITICAL: Only disable pointer events on the overlay itself, not the entire body
    // This allows the page to function while showing the overlay
    overlay.style.pointerEvents = 'auto';
    
    // Fixed duration: 1.5 seconds
    const duration = 1500; // 1.5 seconds
    
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
        'Fetching data from the cloud...',
        'Initializing components...',
        'Loading resources...',
        'Please wait...',
        'Processing request...',
        'Syncing data...',
        'Reticulating splines...',
        'Waking up hamsters...',
        'Spinning up quantum processors...',
        'Calibrating flux capacitors...',
        'Consulting the oracle...',
        'Downloading more RAM...',
        'Optimizing UI paradigms...',
        'Compiling coffee into code...',
        'Establishing secure connection to mainframe...',
        'Warming up the server hamsters...',
        'Defragmenting the database...',
        'Aligning chakras with server nodes...',
        'Convincing electrons to cooperate...',
        'Teaching AI to be patient...',
        'Summoning data from the void...',
        'Untangling network cables...',
        'Negotiating with firewall...',
        'Bribing the cache...',
        'Asking servers nicely...',
        'Loading loading screen...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage, () => {
        playLoadingSound();
    });
}

// Show loading screen for form submissions
function showFormLoadingScreen(formName = 'form', callback = null) {
    const messages = [
        'Submitting ' + formName + '...',
        'Processing ' + formName + '...',
        'Saving data to the mothership...',
        'Validating information with blockchain...',
        'Uploading to the cloud...',
        'Processing request...',
        'Encrypting your secrets...',
        'Double-checking everything twice...',
        'Running through bureaucracy simulator...',
        'Printing digital paperwork...',
        'Filing in triplicate...',
        'Notifying all interested parties...',
        'Asking permission from the database...',
        'Waiting for manager approval (not really)...',
        'Converting to enterprise format...',
        'Adding unnecessary metadata...',
        'Justifying this delay to stakeholders...',
        'Making it look official...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage, callback);
}

// Show loading screen for data fetching
function showDataLoadingScreen(dataType = 'data') {
    const messages = [
        'Loading ' + dataType + '...',
        'Fetching ' + dataType + ' from distant servers...',
        'Retrieving information from the archives...',
        'Syncing ' + dataType + ' with reality...',
        'Processing ' + dataType + ' through AI pipeline...',
        'Excavating ' + dataType + ' from storage...',
        'Decrypting ' + dataType + ' with quantum keys...',
        'Summoning ' + dataType + ' from the database...',
        'Downloading ' + dataType + ' via carrier pigeon...',
        'Extracting ' + dataType + ' from compressed space...',
        'Translating ' + dataType + ' from binary...',
        'Asking database politely for ' + dataType + '...',
        'Negotiating with cache for ' + dataType + '...',
        'Mining ' + dataType + ' from blockchain...',
        'Hydrating ' + dataType + ' molecules...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// Show loading screen for button actions
function showActionLoadingScreen(actionName = 'action') {
    const messages = [
        'Processing ' + actionName + '...',
        'Executing ' + actionName + ' with extreme precision...',
        'Please wait while we pretend to work...',
        'Working on it (actually)...',
        'This may take a moment (or ten)...',
        'Consulting the manual for ' + actionName + '...',
        'Performing ' + actionName + ' ritual...',
        'Initializing ' + actionName + ' sequence...',
        'Calculating optimal ' + actionName + ' strategy...',
        'Applying enterprise-grade ' + actionName + '...',
        'Running ' + actionName + ' through compliance...',
        'Validating ' + actionName + ' with stakeholders...',
        'Making ' + actionName + ' look professional...',
        'Adding unnecessary delays to seem important...',
        'Pretending this is complicated...',
        'Doing absolutely nothing efficiently...',
        'Maximizing user anticipation...',
        'Building suspense...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// NEW: Show loading screen for UI interactions
function showUILoadingScreen(uiElement = 'interface') {
    const messages = [
        'Updating ' + uiElement + '...',
        'Refreshing ' + uiElement + ' aesthetics...',
        'Polishing pixels...',
        'Adjusting visual fidelity...',
        'Rendering beautiful gradients...',
        'Animating transitions smoothly...',
        'Making things look pretty...',
        'Consulting design system...',
        'Applying CSS magic...',
        'Tweaking the UI until perfect...',
        'Running accessibility checks...',
        'Optimizing for retina displays...',
        'Calibrating color temperature...',
        'Aligning pixels with precision...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// NEW: Show loading screen for modal operations
function showModalLoadingScreen(modalName = 'dialog') {
    const messages = [
        'Opening ' + modalName + '...',
        'Preparing ' + modalName + ' interface...',
        'Loading ' + modalName + ' components...',
        'Initializing popup experience...',
        'Creating modal backdrop...',
        'Summoning dialog box from the void...',
        'Constructing overlay dimensions...',
        'Calculating optimal modal placement...',
        'Making this modal worth the wait...',
        'Ensuring maximum user engagement...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// NEW: Show loading screen for theme changes
function showThemeLoadingScreen() {
    const messages = [
        'Switching color schemes...',
        'Adjusting photon wavelengths...',
        'Inverting color matrix...',
        'Recalibrating brightness levels...',
        'Applying new theme across dimensions...',
        'Toggling between light and dark forces...',
        'Consulting color theory textbooks...',
        'Painting the interface...',
        'Mixing digital pigments...',
        'Updating visual ambiance...',
        'Changing the vibes...',
        'Making everything match...'
    ];
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    showLoadingScreen(randomMessage);
}

// NEW: Show loading screen for sorting/filtering
function showFilterLoadingScreen() {
    const messages = [
        'Sorting through chaos...',
        'Filtering results with precision...',
        'Organizing data alphabetically...',
        'Categorizing by importance...',
        'Applying advanced filters...',
        'Running sort algorithm...',
        'Arranging in perfect order...',
        'Finding what you\'re looking for...',
        'Searching through infinite possibilities...',
        'Narrowing down options...',
        'Making sense of everything...'
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
    window.showUILoadingScreen = showUILoadingScreen;
    window.showModalLoadingScreen = showModalLoadingScreen;
    window.showThemeLoadingScreen = showThemeLoadingScreen;
    window.showFilterLoadingScreen = showFilterLoadingScreen;
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

