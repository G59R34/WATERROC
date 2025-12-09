// Admin Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize notification system if available
    if (typeof notificationSystem !== 'undefined') {
        await notificationSystem.init();
        setupNotificationPanel();
    }
    
    // Initialize announcement banner
    if (typeof announcementBanner !== 'undefined') {
        announcementBanner.init();
    }
    
    // Initialize Gantt Chart FIRST
    const gantt = new GanttChart('ganttChart', true);
    
    // Set up date inputs
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    startDateInput.valueAsDate = gantt.startDate;
    endDateInput.valueAsDate = gantt.endDate;
    
    // Check Supabase authentication
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        await supabaseService.loadCurrentUser();
        if (!supabaseService.isAdmin()) {
            alert('Access denied. Admin privileges required.');
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        // Sync from Supabase AFTER gantt is initialized
        await syncFromSupabase();
    }
    
    // Sync data from Supabase
    async function syncFromSupabase() {
        if (!supabaseService.isReady()) return;
        
        const employees = await supabaseService.getEmployees();
        const tasks = await supabaseService.getTasksWithAcknowledgements();
        
        if (employees && tasks) {
            const data = {
                employees: employees.map(e => ({
                    id: e.id,
                    name: e.name,
                    role: e.role
                })),
                tasks: tasks.map(t => ({
                    id: t.id,
                    employeeId: t.employee_id,
                    name: t.name,
                    startDate: t.start_date,
                    endDate: t.end_date,
                    startTime: t.start_time,
                    endTime: t.end_time,
                    status: t.status,
                    acknowledgements: t.acknowledgements || []
                })),
                nextEmployeeId: Math.max(...employees.map(e => e.id), 0) + 1,
                nextTaskId: Math.max(...tasks.map(t => t.id), 0) + 1
            };
            
            localStorage.setItem('ganttData', JSON.stringify(data));
            gantt.data = data;
            gantt.render();
        }
    }
    
    // Auto-refresh from Supabase every 2 seconds
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        setInterval(async () => {
            // Check for new acknowledgements if notification system is available
            if (typeof notificationSystem !== 'undefined') {
                const tasks = await supabaseService.getTasksWithAcknowledgements();
                if (tasks) {
                    const totalAcks = tasks.reduce((sum, task) => sum + (task.acknowledgements?.length || 0), 0);
                    await notificationSystem.checkForNewAcknowledgements(totalAcks);
                }
            }
            await syncFromSupabase();
        }, 2000); // Refresh every 2 seconds
        
        console.log('🔄 Auto-refresh enabled (every 2 seconds)');
    }
    
    // Analytics navigation
    document.getElementById('viewAnalyticsBtn').addEventListener('click', function() {
        window.location.href = 'analytics.html';
    });
    
    // Employee Profiles navigation
    document.getElementById('manageProfilesBtn').addEventListener('click', function() {
        window.location.href = 'profiles.html';
    });
    
    // Shift Scheduling navigation
    document.getElementById('manageShiftsBtn').addEventListener('click', function() {
        window.location.href = 'shifts.html';
    });
    
    // Task Templates navigation
    document.getElementById('manageTaskTemplatesBtn').addEventListener('click', function() {
        window.location.href = 'task-templates.html';
    });
    
    // Setup notification panel
    function setupNotificationPanel() {
        const notificationBtn = document.getElementById('notificationBtn');
        const notificationPanel = document.getElementById('notificationPanel');
        const notificationOverlay = document.getElementById('notificationOverlay');
        const closeNotificationBtn = document.getElementById('closeNotificationBtn');
        const markAllReadBtn = document.getElementById('markAllReadBtn');
        const clearAllBtn = document.getElementById('clearAllBtn');
        
        if (!notificationBtn) return; // Exit if elements don't exist
        
        // Toggle notification panel
        notificationBtn.addEventListener('click', () => {
            notificationPanel.classList.add('active');
            notificationOverlay.classList.add('active');
        });
        
        // Close panel
        const closePanel = () => {
            notificationPanel.classList.remove('active');
            notificationOverlay.classList.remove('active');
        };
        
        closeNotificationBtn.addEventListener('click', closePanel);
        notificationOverlay.addEventListener('click', closePanel);
        
        // Mark all as read
        markAllReadBtn.addEventListener('click', () => {
            notificationSystem.markAllAsRead();
        });
        
        // Clear all notifications
        clearAllBtn.addEventListener('click', () => {
            if (confirm('Clear all notifications?')) {
                notificationSystem.clearAll();
            }
        });
    }
    
    // Logout functionality
    document.getElementById('logoutBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        
        try {
            // Sign out from Supabase first
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                console.log('Signing out from Supabase...');
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during Supabase logout:', error);
        }
        
        // Clear all session data
        sessionStorage.clear();
        localStorage.removeItem('ganttData');
        
        // Small delay to ensure signOut completes
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
    });
    
    // Update date range
    document.getElementById('updateDateRange').addEventListener('click', function() {
        const newStart = new Date(startDateInput.value);
        const newEnd = new Date(endDateInput.value);
        
        if (newStart > newEnd) {
            alert('Start date must be before end date!');
            return;
        }
        
        gantt.setDateRange(newStart, newEnd);
        startDateInput.valueAsDate = gantt.startDate;
        endDateInput.valueAsDate = gantt.endDate;
    });
    
    // Reset view
    document.getElementById('resetViewBtn').addEventListener('click', function() {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 7);
        
        const end = new Date(today);
        end.setDate(today.getDate() + 23);
        
        gantt.setDateRange(start, end);
        startDateInput.valueAsDate = gantt.startDate;
        endDateInput.valueAsDate = gantt.endDate;
    });
    
    // Announcement Modal
    const announcementModal = document.getElementById('announcementModal');
    const sendAnnouncementBtn = document.getElementById('sendAnnouncementBtn');
    const announcementForm = document.getElementById('announcementForm');
    const cancelAnnouncementBtn = document.getElementById('cancelAnnouncementBtn');
    
    // Open announcement modal
    sendAnnouncementBtn.addEventListener('click', function() {
        announcementModal.style.display = 'block';
        document.getElementById('announcementTitle').value = '';
        document.getElementById('announcementMessage').value = '';
        document.getElementById('announcementPriority').value = 'normal';
    });
    
    // Close announcement modal
    announcementModal.querySelectorAll('.close')[0].addEventListener('click', function() {
        announcementModal.style.display = 'none';
    });
    
    cancelAnnouncementBtn.addEventListener('click', function() {
        announcementModal.style.display = 'none';
    });
    
    // Submit announcement
    announcementForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const title = document.getElementById('announcementTitle').value;
        const message = document.getElementById('announcementMessage').value;
        const priority = document.getElementById('announcementPriority').value;
        
        if (!title || !message) {
            alert('Please fill in all fields');
            return;
        }
        
        // Show loading state
        const submitBtn = announcementForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        if (supabaseService.isReady()) {
            const result = await supabaseService.createAnnouncement(title, message, priority);
            
            if (result) {
                alert('✅ Announcement sent to all employees!');
                announcementModal.style.display = 'none';
                
                // Refresh announcement banner
                if (typeof announcementBanner !== 'undefined') {
                    await announcementBanner.loadAnnouncements();
                }
                
                // Add to notification system
                if (typeof notificationSystem !== 'undefined') {
                    notificationSystem.addNotification(
                        'announcement-sent',
                        `Your announcement "${title}" has been sent to all employees`
                    );
                }
            } else {
                alert('❌ Failed to send announcement. Please try again.');
            }
        } else {
            alert('❌ Announcements require Supabase connection');
        }
        
        // Reset button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
    
    // Save data manually
    document.getElementById('saveDataBtn').addEventListener('click', function() {
        gantt.saveData();
        
        // Show success message
        const btn = document.getElementById('saveDataBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Saved!';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    });
    
    // Modal functionality
    const addEmployeeModal = document.getElementById('addEmployeeModal');
    const addTaskModal = document.getElementById('addTaskModal');
    const editTaskModal = document.getElementById('editTaskModal');
    
    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    const addTaskBtn = document.getElementById('addTaskBtn');
    
    const closeBtns = document.querySelectorAll('.close');
    
    // Open Add Employee Modal
    addEmployeeBtn.addEventListener('click', async function() {
        await loadUsersForEmployeeModal();
        addEmployeeModal.style.display = 'block';
    });
    
    // Load users into the employee modal dropdown
    async function loadUsersForEmployeeModal() {
        const userSelect = document.getElementById('linkUserAccount');
        
        // Clear existing options except the first one
        while (userSelect.options.length > 1) {
            userSelect.remove(1);
        }
        
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const { data: users, error } = await supabaseService.client
                .from('users')
                .select('id, username, email, full_name')
                .order('username');
            
            if (users && !error) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = `${user.full_name} (${user.username})`;
                    userSelect.appendChild(option);
                });
            }
        }
    }
    
    // Open Add Task Modal
    addTaskBtn.addEventListener('click', function() {
        updateEmployeeDropdown();
        addTaskModal.style.display = 'block';
        
        // Set default dates
        const today = new Date();
        document.getElementById('taskStart').valueAsDate = today;
        
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        document.getElementById('taskEnd').valueAsDate = nextWeek;
        
        // Set default times
        document.getElementById('taskStartTime').value = '09:00';
        document.getElementById('taskEndTime').value = '17:00';
    });
    
    // Close modals
    closeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            addEmployeeModal.style.display = 'none';
            addTaskModal.style.display = 'none';
            editTaskModal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === addEmployeeModal) {
            addEmployeeModal.style.display = 'none';
        }
        if (e.target === addTaskModal) {
            addTaskModal.style.display = 'none';
        }
        if (e.target === editTaskModal) {
            editTaskModal.style.display = 'none';
        }
    });
    
    // Add Employee Form
    document.getElementById('addEmployeeForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('employeeName').value;
        const role = document.getElementById('employeeRole').value;
        const userId = document.getElementById('linkUserAccount').value || null;
        
        // Add to Gantt chart
        const employee = gantt.addEmployee(name, role);
        
        // If Supabase is enabled, sync to database with user_id
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            await supabaseService.addEmployee(name, role, userId);
            await syncFromSupabase(); // Refresh from database
        }
        
        addEmployeeModal.style.display = 'none';
        this.reset();
        
        const linkedMsg = userId ? ' and linked to user account' : '';
        alert(`Employee ${name} added successfully${linkedMsg}!`);
    });
    
    // Add Task Form
    document.getElementById('addTaskForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const employeeId = parseInt(document.getElementById('taskEmployee').value);
        const name = document.getElementById('taskName').value;
        const startDate = document.getElementById('taskStart').value;
        const endDate = document.getElementById('taskEnd').value;
        const startTime = document.getElementById('taskStartTime').value.replace(':', '');
        const endTime = document.getElementById('taskEndTime').value.replace(':', '');
        const status = document.getElementById('taskStatus').value;
        
        // Validate dates
        if (new Date(startDate) > new Date(endDate)) {
            alert('Start date must be before end date!');
            return;
        }
        
        // Add to local Gantt chart
        gantt.addTask(employeeId, name, startDate, endDate, status, startTime, endTime);
        
        // Sync to Supabase if enabled
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            await supabaseService.addTask(employeeId, name, startDate, endDate, startTime, endTime, status);
            
            // Refresh from database
            await syncFromSupabase();
        }
        
        addTaskModal.style.display = 'none';
        this.reset();
        
        alert(`Task "${name}" added successfully!`);
    });
    
    // Edit Task Form
    document.getElementById('editTaskForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const taskId = parseInt(document.getElementById('editTaskId').value);
        const name = document.getElementById('editTaskName').value;
        const startDate = document.getElementById('editTaskStart').value;
        const endDate = document.getElementById('editTaskEnd').value;
        const startTime = document.getElementById('editTaskStartTime').value.replace(':', '');
        const endTime = document.getElementById('editTaskEndTime').value.replace(':', '');
        const status = document.getElementById('editTaskStatus').value;
        
        // Validate dates
        if (new Date(startDate) > new Date(endDate)) {
            alert('Start date must be before end date!');
            return;
        }
        
        // Update local Gantt chart
        gantt.updateTask(taskId, {
            name: name,
            startDate: startDate,
            endDate: endDate,
            startTime: startTime,
            endTime: endTime,
            status: status
        });
        
        // Sync to Supabase if enabled
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const currentUser = supabaseService.getCurrentUser();
            await supabaseService.updateTask(taskId, {
                name: name,
                start_date: startDate,
                end_date: endDate,
                start_time: startTime,
                end_time: endTime,
                status: status,
                updated_by: currentUser ? currentUser.id : null
            });
            
            // Refresh from database
            await syncFromSupabase();
        }
        
        editTaskModal.style.display = 'none';
        this.reset();
        
        alert('Task updated successfully!');
    });
    
    // Delete Task
    document.getElementById('deleteTaskBtn').addEventListener('click', async function() {
        const taskId = parseInt(document.getElementById('editTaskId').value);
        
        if (confirm('Are you sure you want to delete this task?')) {
            console.log('🗑️ Deleting task ID:', taskId);
            
            // Delete from Supabase first
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const result = await supabaseService.deleteTask(taskId);
                console.log('Supabase delete result:', result);
                
                // Refresh from database
                await syncFromSupabase();
            }
            
            // Delete from local Gantt chart
            gantt.deleteTask(taskId);
            
            editTaskModal.style.display = 'none';
            document.getElementById('editTaskForm').reset();
            
            alert('Task deleted successfully!');
        }
    });
    
    // Override task click handler
    gantt.onTaskClick = async function(task) {
        const employee = this.data.employees.find(e => e.id === task.employeeId);
        
        // Populate edit form
        document.getElementById('editTaskId').value = task.id;
        document.getElementById('editTaskName').value = task.name;
        document.getElementById('editTaskStart').value = task.startDate;
        document.getElementById('editTaskEnd').value = task.endDate;
        
        // Format time for input (HHMM to HH:MM)
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        document.getElementById('editTaskStartTime').value = 
            `${startTime.substring(0, 2)}:${startTime.substring(2, 4)}`;
        document.getElementById('editTaskEndTime').value = 
            `${endTime.substring(0, 2)}:${endTime.substring(2, 4)}`;
        
        document.getElementById('editTaskStatus').value = task.status;
        
        // Load and display acknowledgements
        await loadTaskAcknowledgements(task.id);
        
        // Load and display messages
        await loadAdminTaskMessages(task.id);
        
        // Setup admin message sending
        setupAdminMessageSending(task.id);
        
        // Show modal
        editTaskModal.style.display = 'block';
    };
    
    // Load task acknowledgements
    async function loadTaskAcknowledgements(taskId) {
        const ackList = document.getElementById('ackList');
        ackList.innerHTML = '<div class="ack-empty">Loading...</div>';
        
        if (!supabaseService.isReady()) {
            ackList.innerHTML = '<div class="ack-empty">Acknowledgements require Supabase</div>';
            return;
        }
        
        const acks = await supabaseService.getTaskAcknowledgements(taskId);
        
        if (!acks || acks.length === 0) {
            ackList.innerHTML = '<div class="ack-empty">No acknowledgements yet</div>';
            return;
        }
        
        ackList.innerHTML = acks.map(ack => {
            const date = new Date(ack.acknowledged_at);
            const timeStr = date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="ack-item">
                    <span class="ack-icon">✓</span>
                    <span class="ack-user">${ack.user.full_name || ack.user.username}</span>
                    <span class="ack-time">${timeStr}</span>
                </div>
            `;
        }).join('');
    }
    
    // Helper function to update employee dropdown
    function updateEmployeeDropdown() {
        const employees = gantt.getEmployees();
        const select = document.getElementById('taskEmployee');
        
        select.innerHTML = '';
        
        if (employees.length === 0) {
            select.innerHTML = '<option value="">No employees available</option>';
            return;
        }
        
        employees.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.id;
            option.textContent = `${emp.name} - ${emp.role}`;
            select.appendChild(option);
        });
    }
    
    // Load task messages for admin
    async function loadAdminTaskMessages(taskId) {
        const messagesList = document.getElementById('taskMessagesList');
        
        if (!supabaseService.isReady()) {
            messagesList.innerHTML = '<p class="messages-empty">Messages are not available offline</p>';
            return;
        }
        
        const messages = await supabaseService.getTaskMessages(taskId);
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<p class="messages-empty">No messages yet.</p>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => {
            const isFromAdmin = msg.is_from_admin;
            const author = msg.user?.full_name || 'Unknown';
            const time = new Date(msg.created_at).toLocaleString();
            
            return `
                <div class="message-item ${isFromAdmin ? 'from-admin' : 'from-employee'}">
                    <div class="message-header">
                        <span class="message-author">${isFromAdmin ? '👨‍💼 Admin' : '👤 Employee'}: ${author}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${msg.message}</div>
                </div>
            `;
        }).join('');
        
        // Mark messages as read
        await supabaseService.markMessagesAsRead(taskId);
        
        // Scroll to bottom
        messagesList.scrollTop = messagesList.scrollHeight;
    }
    
    // Setup admin message sending
    function setupAdminMessageSending(taskId) {
        const messageInput = document.getElementById('adminMessageInput');
        const sendBtn = document.getElementById('sendAdminMessageBtn');
        
        // Clear previous input
        messageInput.value = '';
        
        // Remove previous event listeners by cloning
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        newSendBtn.addEventListener('click', async () => {
            const message = messageInput.value.trim();
            
            if (!message) {
                alert('Please enter a message');
                return;
            }
            
            if (!supabaseService.isReady()) {
                alert('Messages are not available offline');
                return;
            }
            
            newSendBtn.disabled = true;
            newSendBtn.textContent = 'Sending...';
            
            const result = await supabaseService.sendTaskMessage(taskId, message, true);
            
            if (result) {
                messageInput.value = '';
                await loadAdminTaskMessages(taskId);
                
                // Show success notification
                if (notificationSystem) {
                    notificationSystem.addNotification(
                        'Reply sent',
                        'Your message has been sent to the employee',
                        'success'
                    );
                }
            } else {
                alert('Failed to send message. Please try again.');
            }
            
            newSendBtn.disabled = false;
            newSendBtn.textContent = 'Send Reply';
        });
        
        // Allow Enter key to send (Shift+Enter for new line)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                newSendBtn.click();
            }
        });
    }
});
