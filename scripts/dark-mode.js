// Dark Mode Toggle System
// ===================================
// Handles dark mode switching and persistence across all pages

class DarkModeManager {
    constructor() {
        // Only use stored theme if it exists, otherwise default to light (null = no theme attribute = light mode)
        this.theme = this.getStoredTheme();
        this.init();
    }

    init() {
        // Apply theme immediately to prevent flash
        // If theme is stored, apply it; otherwise default to light mode
        if (this.theme) {
            this.applyTheme(this.theme);
        } else {
            // Ensure light mode is the default (no data-theme attribute)
            document.documentElement.removeAttribute('data-theme');
            this.theme = 'light'; // Set for button display
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
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            // Light mode: remove theme attribute (defaults to light)
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
        
        // Update toggle button if it exists
        const toggleBtn = document.getElementById('darkModeToggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
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
        
        // If still not found, create a container in the body
        if (!container) {
            console.warn('Could not find header element for dark mode toggle, creating floating button');
            container = document.body;
        }

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'darkModeToggle';
        toggleBtn.className = 'dark-mode-toggle';
        // Determine current theme from DOM or stored value
        const currentTheme = document.documentElement.getAttribute('data-theme') || this.theme || 'light';
        toggleBtn.innerHTML = currentTheme === 'dark' ? '☀️' : '🌙';
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

