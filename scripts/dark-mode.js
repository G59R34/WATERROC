// Dark Mode Toggle System
// ===================================
// Handles dark mode switching and persistence across all pages

class DarkModeManager {
    constructor() {
        // OVERHAUL: Default to LIGHT MODE (bright Reflexis style)
        this.theme = this.getStoredTheme();
        this.init();
    }

    init() {
        // OVERHAUL: Apply theme - default to LIGHT MODE
        if (this.theme) {
            this.applyTheme(this.theme);
        } else {
            // Default to light mode (bright whites/grays like Reflexis)
            this.theme = 'light';
            this.applyTheme('light');
        }
        
        // Create toggle button
        this.createToggleButton();
        
        // Listen for system theme changes (only if user hasn't set a preference)
        if (window.matchMedia && !localStorage.getItem('theme')) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            // Apply system theme on initial load if no stored preference
            if (mediaQuery.matches) {
                this.theme = 'dark';
                this.applyTheme('dark');
            }
            
            mediaQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem('theme')) {
                    this.theme = e.matches ? 'dark' : 'light';
                    this.applyTheme(this.theme);
                }
            });
        }
    }

    getStoredTheme() {
        const stored = localStorage.getItem('theme');
        // Only return if explicitly set, don't default to system theme
        return stored || null;
    }

    getSystemTheme() {
        // This is only used as fallback if no stored theme exists
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    applyTheme(theme) {
        this.theme = theme;
        // OVERHAUL: Light mode is default, dark mode is toggle
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            // Light mode: set explicitly
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
        
        // CRITICAL FIX: Update toggle button - keep "Toggle Theme" text
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            toggleBtn.textContent = 'Toggle Theme';
            toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }

    toggle() {
        const newTheme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
    }

    createToggleButton() {
        // Check if button already exists
        if (document.getElementById('darkModeToggle')) {
            return;
        }

        // Try to find header-right first (most pages)
        let container = document.querySelector('.header-right');
        
        // If not found, try header-actions (employee-tasks page)
        if (!container) {
            container = document.querySelector('.header-actions');
        }
        
        // If still not found, try header-content (employee-tasks page)
        if (!container) {
            container = document.querySelector('.header-content');
        }
        
        // If still not found, try to find any header element
        if (!container) {
            container = document.querySelector('header');
        }
        
        // FIXED DARK MODE: For login page, add toggle to login card
        if (!container) {
            const loginCard = document.querySelector('.login-card');
            if (loginCard) {
                // Create a container in the login card header
                const toggleContainer = document.createElement('div');
                toggleContainer.className = 'login-theme-toggle';
                toggleContainer.style.position = 'absolute';
                toggleContainer.style.top = '15px';
                toggleContainer.style.right = '15px';
                loginCard.style.position = 'relative';
                loginCard.appendChild(toggleContainer);
                container = toggleContainer;
            } else {
                // Fallback: floating button
                container = document.body;
            }
        }

        // CRITICAL FIX: Create toggle button with "Toggle Theme" text
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'darkModeToggle';
        toggleBtn.className = 'dark-mode-toggle';
        // Default to light mode
        const currentTheme = document.documentElement.getAttribute('data-theme') || this.theme || 'light';
        toggleBtn.textContent = 'Toggle Theme';
        toggleBtn.setAttribute('aria-label', currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        toggleBtn.title = currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        
        // Add click handler
        toggleBtn.addEventListener('click', () => {
            this.toggle();
        });

        // Insert at the beginning of container (or as floating button if no header)
        if (container === document.body) {
            // Floating button in bottom right
            toggleBtn.style.position = 'fixed';
            toggleBtn.style.bottom = '20px';
            toggleBtn.style.right = '20px';
            toggleBtn.style.zIndex = '10000';
            toggleBtn.style.marginRight = '0';
            container.appendChild(toggleBtn);
        } else {
            // Insert at the beginning of header
            container.insertBefore(toggleBtn, container.firstChild);
        }
    }
}

// Initialize dark mode manager when DOM is ready
let darkModeManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        darkModeManager = new DarkModeManager();
    });
} else {
    darkModeManager = new DarkModeManager();
}

// Make it globally accessible
window.darkModeManager = darkModeManager;

