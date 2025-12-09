// Announcement Banner Manager
class AnnouncementBannerManager {
    constructor() {
        this.container = null;
        this.currentAnnouncements = [];
        this.refreshInterval = null;
    }

    init() {
        this.container = document.getElementById('announcementBanner');
        if (!this.container) {
            console.error('Announcement banner container not found');
            return;
        }

        // Load and display announcements
        this.loadAnnouncements();

        // Refresh every 10 seconds to check for new announcements
        this.refreshInterval = setInterval(() => {
            this.loadAnnouncements();
        }, 10000);

        console.log('📢 Announcement banner initialized');
    }

    async loadAnnouncements() {
        if (!supabaseService?.isReady()) return;

        try {
            // Get all active announcements (ordered by priority and time)
            const announcements = await supabaseService.getAnnouncements(10);
            
            if (!announcements) return;

            // Check if announcements changed
            const announcementIds = announcements.map(a => a.id).join(',');
            const currentIds = this.currentAnnouncements.map(a => a.id).join(',');

            if (announcementIds !== currentIds) {
                this.currentAnnouncements = announcements;
                this.render();
            }
        } catch (error) {
            console.error('Error loading announcements:', error);
        }
    }

    render() {
        if (!this.container) return;

        // Clear existing banners
        this.container.innerHTML = '';

        // Render each announcement
        this.currentAnnouncements.forEach(announcement => {
            const banner = this.createBanner(announcement);
            this.container.appendChild(banner);
        });
    }

    createBanner(announcement) {
        const banner = document.createElement('div');
        banner.className = `announcement-banner priority-${announcement.priority || 'normal'}`;
        banner.dataset.announcementId = announcement.id;

        // Format time
        const timeAgo = this.getTimeAgo(new Date(announcement.created_at));

        // Determine icon based on priority
        const icon = this.getPriorityIcon(announcement.priority);

        banner.innerHTML = `
            <div class="announcement-banner-content">
                <div class="announcement-banner-icon">${icon}</div>
                <div class="announcement-banner-text">
                    <div class="announcement-banner-title">${this.escapeHtml(announcement.title)}</div>
                    <div class="announcement-banner-message">${this.escapeHtml(announcement.message)}</div>
                </div>
            </div>
            <div class="announcement-banner-meta">
                <span class="announcement-banner-time">${timeAgo}</span>
                ${this.isAdmin() ? `<button class="announcement-banner-dismiss" data-announcement-id="${announcement.id}" title="Remove announcement">×</button>` : ''}
            </div>
        `;

        // Add dismiss handler for admin
        if (this.isAdmin()) {
            const dismissBtn = banner.querySelector('.announcement-banner-dismiss');
            dismissBtn.addEventListener('click', () => this.dismissAnnouncement(announcement.id));
        }

        return banner;
    }

    getPriorityIcon(priority) {
        switch (priority) {
            case 'urgent':
                return '🚨';
            case 'important':
                return '⚠️';
            case 'normal':
            default:
                return '📢';
        }
    }

    async dismissAnnouncement(announcementId) {
        if (!this.isAdmin()) {
            console.warn('Only admins can dismiss announcements');
            return;
        }

        try {
            // Delete announcement from database
            await supabaseService.deleteAnnouncement(announcementId);

            // Remove from current list
            this.currentAnnouncements = this.currentAnnouncements.filter(a => a.id !== announcementId);

            // Re-render
            this.render();

            // Show success notification
            if (typeof notificationSystem !== 'undefined') {
                notificationSystem.addNotification('system', '📢 Announcement removed');
            }
        } catch (error) {
            console.error('Error dismissing announcement:', error);
            alert('Failed to remove announcement. Please try again.');
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }

    isAdmin() {
        const userRole = sessionStorage.getItem('userRole');
        return userRole === 'admin';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

// Global instance
const announcementBanner = new AnnouncementBannerManager();
