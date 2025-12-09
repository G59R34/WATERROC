// Check-In Dialog System for Waterstream
class CheckInSystem {
    constructor() {
        this.isOpen = false;
        this.notifications = [];
        this.hasCheckedIn = false;
    }
    
    /**
     * Initialize the check-in system
     */
    init() {
        this.createCheckInDialog();
        console.log('✅ Check-in system initialized');
    }
    
    /**
     * Create the check-in dialog HTML
     */
    createCheckInDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'checkin-overlay';
        overlay.id = 'checkinOverlay';
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        overlay.innerHTML = `
            <div class="checkin-dialog">
                <div class="checkin-header">
                    <h2>💧 Welcome to Waterstream</h2>
                    <div class="welcome-text">Time to check in and review your updates!</div>
                    <div class="date-time">${dateStr} • ${timeStr}</div>
                </div>
                
                <div class="checkin-body">
                    <div class="checkin-section">
                        <h3><span class="icon">📊</span> Quick Stats</h3>
                        <div class="checkin-stats" id="checkinStats">
                            <!-- Stats will be inserted here -->
                        </div>
                    </div>
                    
                    <div class="checkin-section">
                        <h3><span class="icon">🔔</span> Notifications</h3>
                        <div class="notification-list-checkin" id="checkinNotificationList">
                            <!-- Notifications will be inserted here -->
                        </div>
                    </div>
                </div>
                
                <div class="checkin-footer">
                    <div class="footer-text">
                        Ready to start your day? Click below to continue.
                    </div>
                    <button class="checkin-button primary" id="checkinBtn">
                        ✓ Check In & Continue
                    </button>
                    <button class="checkin-button secondary" id="skipCheckinBtn">
                        Skip for Now
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Add event listeners
        document.getElementById('checkinBtn').addEventListener('click', () => {
            this.completeCheckIn();
        });
        
        document.getElementById('skipCheckinBtn').addEventListener('click', () => {
            this.skipCheckIn();
        });
        
        // Prevent clicking overlay to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // Optional: allow clicking outside to close
                // this.skipCheckIn();
            }
        });
    }
    
    /**
     * Show the check-in dialog
     */
    async show(userRole = 'employee') {
        if (this.hasCheckedIn) return;
        
        const overlay = document.getElementById('checkinOverlay');
        overlay.classList.add('active');
        this.isOpen = true;
        
        // Load stats and notifications
        await this.loadStats(userRole);
        this.loadNotifications();
    }
    
    /**
     * Load stats for the user
     */
    async loadStats(userRole) {
        const statsContainer = document.getElementById('checkinStats');
        
        // Get gantt data
        const ganttData = JSON.parse(localStorage.getItem('ganttData') || '{"tasks":[],"employees":[]}');
        
        let stats = [];
        
        if (userRole === 'admin') {
            const totalTasks = ganttData.tasks.length;
            const pendingTasks = ganttData.tasks.filter(t => t.status === 'pending').length;
            const inProgressTasks = ganttData.tasks.filter(t => t.status === 'in-progress').length;
            const completedTasks = ganttData.tasks.filter(t => t.status === 'completed').length;
            
            // Get acknowledgement count if supabase is available
            let ackCount = 0;
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                try {
                    const tasksWithAcks = await supabaseService.getTasksWithAcknowledgements();
                    if (tasksWithAcks) {
                        ackCount = tasksWithAcks.reduce((sum, task) => 
                            sum + (task.acknowledgements?.length || 0), 0);
                    }
                } catch (error) {
                    console.error('Error fetching acknowledgements:', error);
                }
            }
            
            stats = [
                { number: totalTasks, label: 'Total Tasks' },
                { number: inProgressTasks, label: 'In Progress' },
                { number: completedTasks, label: 'Completed' },
                { number: ackCount, label: 'Acknowledgements' }
            ];
        } else {
            // Employee stats
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const userEmployee = ganttData.employees.find(e => 
                e.name.toLowerCase() === currentUser.username?.toLowerCase()
            );
            
            if (userEmployee) {
                const myTasks = ganttData.tasks.filter(t => t.employeeId === userEmployee.id);
                const myPending = myTasks.filter(t => t.status === 'pending').length;
                const myInProgress = myTasks.filter(t => t.status === 'in-progress').length;
                const myCompleted = myTasks.filter(t => t.status === 'completed').length;
                
                stats = [
                    { number: myTasks.length, label: 'Your Tasks' },
                    { number: myPending, label: 'Pending' },
                    { number: myInProgress, label: 'In Progress' },
                    { number: myCompleted, label: 'Completed' }
                ];
            } else {
                stats = [
                    { number: 0, label: 'Your Tasks' },
                    { number: 0, label: 'Pending' }
                ];
            }
        }
        
        statsContainer.innerHTML = stats.map(stat => `
            <div class="stat-card">
                <div class="stat-number">${stat.number}</div>
                <div class="stat-label">${stat.label}</div>
            </div>
        `).join('');
    }
    
    /**
     * Load notifications from notification system
     */
    async loadNotifications() {
        const notificationList = document.getElementById('checkinNotificationList');
        
        // Get unread announcements from Supabase first
        let announcements = [];
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                announcements = await supabaseService.getUnreadAnnouncements() || [];
            } catch (error) {
                console.error('Error fetching announcements:', error);
            }
        }
        
        // Get notifications from notification system if available
        let notifications = [];
        if (typeof notificationSystem !== 'undefined' && notificationSystem.notifications) {
            notifications = notificationSystem.notifications.slice(0, 10); // Show last 10
        }
        
        // Combine announcements and notifications
        const allNotifications = [
            ...announcements.map(ann => ({
                type: 'announcement',
                priority: ann.priority,
                message: `📢 ${ann.title}: ${ann.message}`,
                timestamp: new Date(ann.created_at).getTime(),
                id: ann.id
            })),
            ...notifications
        ].sort((a, b) => b.timestamp - a.timestamp);
        
        if (allNotifications.length === 0) {
            notificationList.innerHTML = `
                <div class="empty-notifications">
                    <div class="icon">🎉</div>
                    <p>No new notifications!</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">You're all caught up.</p>
                </div>
            `;
            return;
        }
        
        notificationList.innerHTML = allNotifications.map(notif => {
            const timeAgo = this.getTimeAgo(notif.timestamp);
            const typeClass = notif.type || 'system';
            const icon = this.getNotificationIcon(notif.type);
            
            // Highlight urgent/important announcements
            const priorityClass = notif.priority === 'urgent' ? 'announcement-urgent' : 
                                  notif.priority === 'important' ? 'announcement-important' : '';
            
            return `
                <div class="notification-item-checkin ${typeClass} ${priorityClass}" data-id="${notif.id || ''}">
                    <div class="notification-title">${icon} ${this.getNotificationTitle(notif.type)}</div>
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
            `;
        }).join('');
        
        // Mark announcements as read after displaying
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            announcements.forEach(ann => {
                supabaseService.markAnnouncementAsRead(ann.id);
            });
        }
    }
    
    /**
     * Get notification icon based on type
     */
    getNotificationIcon(type) {
        const icons = {
            'new-task': '📋',
            'acknowledgement': '✅',
            'message': '💬',
            'system': '🔔',
            'task-update': '📝',
            'deadline': '⏰',
            'announcement': '📢',
            'announcement-sent': '✉️'
        };
        return icons[type] || '🔔';
    }
    
    /**
     * Get notification title based on type
     */
    getNotificationTitle(type) {
        const titles = {
            'new-task': 'New Task',
            'acknowledgement': 'Task Acknowledged',
            'message': 'New Message',
            'system': 'System',
            'task-update': 'Task Updated',
            'deadline': 'Deadline Alert',
            'announcement': 'Announcement',
            'announcement-sent': 'Announcement Sent'
        };
        return titles[type] || 'Notification';
    }
    
    /**
     * Calculate time ago
     */
    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    
    /**
     * Complete check-in
     */
    completeCheckIn() {
        this.hasCheckedIn = true;
        const overlay = document.getElementById('checkinOverlay');
        overlay.classList.remove('active');
        this.isOpen = false;
        
        // Store check-in time
        localStorage.setItem('lastCheckin', Date.now().toString());
        
        // Clear notifications after check-in
        if (typeof notificationSystem !== 'undefined') {
            notificationSystem.notifications = [];
            notificationSystem.unreadCount = 0;
            notificationSystem.updateBadge();
        }
        
        console.log('✅ User checked in successfully');
    }
    
    /**
     * Skip check-in
     */
    skipCheckIn() {
        const overlay = document.getElementById('checkinOverlay');
        overlay.classList.remove('active');
        this.isOpen = false;
        console.log('⏭️ User skipped check-in');
    }
    
    /**
     * Add a notification to show in the check-in dialog
     */
    addNotification(type, message) {
        this.notifications.unshift({
            type: type,
            message: message,
            timestamp: Date.now()
        });
        
        // Keep only last 50 notifications
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }
    }
    
    /**
     * Check if user should see check-in dialog
     */
    shouldShowCheckIn() {
        if (this.hasCheckedIn) return false;
        
        // Always show if there are unread items
        return true; // We'll check for actual content in the show() method
    }
    
    /**
     * Force show check-in dialog (for new notifications/announcements)
     */
    forceShow(userRole = 'employee') {
        this.hasCheckedIn = false;
        this.show(userRole);
    }
}

// Create global instance
const checkInSystem = new CheckInSystem();
