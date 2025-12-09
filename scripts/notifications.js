// Notification System for Waterstream
class NotificationSystem {
    constructor() {
        this.notifications = [];
        this.unreadCount = 0;
        this.lastCheckedTaskCount = 0;
        this.lastCheckedAckCount = 0;
        this.initialized = false;
    }
    
    /**
     * Initialize the notification system
     */
    async init() {
        if (this.initialized) return;
        
        // Request browser notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('🔔 Notification permission:', permission);
        }
        
        this.initialized = true;
        console.log('🔔 Notification system initialized');
        
        // Add a welcome notification
        setTimeout(() => {
            this.addNotification('system', 'Notification system is active! You will be notified of new tasks and acknowledgements.');
        }, 1000);
    }
    
    /**
     * Show a browser notification
     */
    showBrowserNotification(title, body, icon = '💧') {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: icon,
                badge: icon,
                tag: 'waterstream-notification'
            });
        }
    }
    
    /**
     * Add notification to the in-app list
     */
    addNotification(type, message, taskId = null) {
        const notification = {
            id: Date.now(),
            type: type,
            message: message,
            taskId: taskId,
            timestamp: Date.now(),
            read: false
        };
        
        this.notifications.unshift(notification);
        this.unreadCount++;
        
        // Update badge
        this.updateBadge();
        
        // Show browser notification
        if (type !== 'system') {
            const title = this.getNotificationTitle(type);
            this.showBrowserNotification(title, message);
        }
        
        // Play sound
        this.playNotificationSound();
        
        // Add to check-in system if available
        if (typeof checkInSystem !== 'undefined') {
            checkInSystem.addNotification(type, message);
            
            // Show check-in dialog for important notifications
            if (type === 'new-task' || type === 'announcement' || type === 'message') {
                // Get user role from session
                const userRole = sessionStorage.getItem('userRole') || 'employee';
                setTimeout(() => {
                    checkInSystem.forceShow(userRole);
                }, 1000);
            }
        }
        
        // Keep only last 50 notifications
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }
    }
    
    /**
     * Get notification title based on type
     */
    getNotificationTitle(type) {
        const titles = {
            'new-task': '📋 New Task Assigned',
            'acknowledgement': '✅ Task Acknowledged',
            'message': '💬 New Message',
            'system': '🔔 System Notification',
            'task-update': '📝 Task Updated'
        };
        return titles[type] || '🔔 Notification';
    }
    
    /**
     * Update badge (alias for updateNotificationBadge for compatibility)
     */
    updateBadge() {
        this.updateNotificationBadge();
    }
    
    /**
     * Check for new tasks (for employees)
     */
    async checkForNewTasks(currentTaskCount) {
        if (this.lastCheckedTaskCount === 0) {
            this.lastCheckedTaskCount = currentTaskCount;
            return;
        }
        
        if (currentTaskCount > this.lastCheckedTaskCount) {
            const newTasksCount = currentTaskCount - this.lastCheckedTaskCount;
            const message = `You have ${newTasksCount} new task${newTasksCount > 1 ? 's' : ''} assigned!`;
            
            this.addNotification('new_task', message);
            this.showBrowserNotification('New Task Assigned', message);
            
            // Play notification sound
            this.playNotificationSound();
        }
        
        this.lastCheckedTaskCount = currentTaskCount;
    }
    
    /**
     * Check for new acknowledgements (for admins)
     */
    async checkForNewAcknowledgements(currentAckCount) {
        if (this.lastCheckedAckCount === 0) {
            this.lastCheckedAckCount = currentAckCount;
            return;
        }
        
        if (currentAckCount > this.lastCheckedAckCount) {
            const newAcksCount = currentAckCount - this.lastCheckedAckCount;
            const message = `${newAcksCount} task${newAcksCount > 1 ? 's' : ''} acknowledged by employees!`;
            
            this.addNotification('task_acknowledged', message);
            this.showBrowserNotification('Task Acknowledged', message);
            
            // Play notification sound
            this.playNotificationSound();
        }
        
        this.lastCheckedAckCount = currentAckCount;
    }
    
    /**
     * Mark notification as read
     */
    markAsRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification && !notification.read) {
            notification.read = true;
            this.unreadCount--;
            this.updateNotificationBadge();
            this.renderNotifications();
        }
    }
    
    /**
     * Mark all notifications as read
     */
    markAllAsRead() {
        this.notifications.forEach(n => n.read = true);
        this.unreadCount = 0;
        this.updateNotificationBadge();
        this.renderNotifications();
    }
    
    /**
     * Clear all notifications
     */
    clearAll() {
        this.notifications = [];
        this.unreadCount = 0;
        this.updateNotificationBadge();
        this.renderNotifications();
    }
    
    /**
     * Update notification badge count
     */
    updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.style.display = 'block';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    
    /**
     * Render notifications in the panel
     */
    renderNotifications() {
        const container = document.getElementById('notificationList');
        if (!container) return;
        
        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #94a3b8;">
                    <p>📭 No notifications</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.notifications.map(notif => {
            const timeAgo = this.getTimeAgo(new Date(notif.timestamp));
            const icon = this.getNotificationIcon(notif.type);
            const readClass = notif.read ? 'notification-read' : '';
            
            return `
                <div class="notification-item ${readClass}" data-id="${notif.id}">
                    <div class="notification-icon">${icon}</div>
                    <div class="notification-content">
                        <p class="notification-message">${notif.message}</p>
                        <span class="notification-time">${timeAgo}</span>
                    </div>
                    ${!notif.read ? '<div class="notification-unread-dot"></div>' : ''}
                </div>
            `;
        }).join('');
        
        // Add click handlers to mark as read
        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                this.markAsRead(id);
            });
        });
    }
    
    /**
     * Get notification icon based on type
     */
    getNotificationIcon(type) {
        const icons = {
            'new_task': '📋',
            'task_acknowledged': '✅',
            'task_updated': '✏️',
            'task_deleted': '🗑️',
            'system': 'ℹ️'
        };
        return icons[type] || '🔔';
    }
    
    /**
     * Get time ago string
     */
    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
    
    /**
     * Play notification sound
     */
    playNotificationSound() {
        // Create a simple beep sound using Web Audio API
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
        } catch (error) {
            console.log('Could not play notification sound:', error);
        }
    }
}

// Create global notification system instance
const notificationSystem = new NotificationSystem();
