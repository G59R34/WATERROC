// Employee Dashboard Script with Supabase Integration
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize check-in system
    if (typeof checkInSystem !== 'undefined') {
        checkInSystem.init();
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
    
    // Initialize Gantt Chart in read-only mode first
    const gantt = new GanttChart('ganttChart', false);
    
    // Logout functionality - set this up FIRST before any async operations
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
    
    // Check Supabase authentication
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        await supabaseService.loadCurrentUser();
        const currentUser = await supabaseService.getCurrentUser();
        
        // Check employment status
        if (currentUser) {
            const { data: profile } = await supabaseService.client
                .from('employee_profiles')
                .select('employment_status')
                .eq('employee_id', currentUser.id)
                .single();
            
            const employmentStatus = profile?.employment_status || 'active';
            
            if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
                alert('Your account access has been revoked. Please contact an administrator.');
                await supabaseService.signOut();
                sessionStorage.clear();
                window.location.href = 'index.html';
                return;
            }
        }
        
        await syncFromSupabase();
    }
    
    // Show check-in dialog after everything is loaded
    setTimeout(() => {
        if (typeof checkInSystem !== 'undefined' && checkInSystem.shouldShowCheckIn()) {
            checkInSystem.show('employee');
        }
    }, 500);
    
    // Sync data from Supabase
    async function syncFromSupabase() {
        if (!supabaseService.isReady()) return;
        
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return;
        
        const employees = await supabaseService.getEmployees();
        const allTasks = await supabaseService.getTasksWithAcknowledgements();
        
        if (employees && allTasks) {
            // Find the employee linked to this user
            const userEmployee = employees.find(e => e.user_id === currentUser.id);
            
            if (!userEmployee) {
                console.warn('No employee record found for this user');
                // Show message to user
                const ganttContainer = document.getElementById('ganttChart');
                ganttContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #64748b;">
                        <h3>No Employee Record Found</h3>
                        <p>Your user account is not linked to an employee. Please contact an administrator.</p>
                    </div>
                `;
                return;
            }
            
            // Filter tasks to only show this employee's tasks
            const userTasks = allTasks.filter(t => t.employee_id === userEmployee.id);
            
            const data = {
                employees: [{ // Only show this employee
                    id: userEmployee.id,
                    name: userEmployee.name,
                    role: userEmployee.role
                }],
                tasks: userTasks.map(t => ({
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
                nextTaskId: Math.max(...allTasks.map(t => t.id), 0) + 1
            };
            
            localStorage.setItem('ganttData', JSON.stringify(data));
            gantt.data = data;
            gantt.render();
            
            console.log(`📋 Loaded ${userTasks.length} task(s) for ${userEmployee.name}`);
        }
    }
    
    // Auto-refresh from Supabase every 2 seconds
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        // Track last announcement count to detect new ones
        let lastAnnouncementCount = 0;
        
        // Initial count
        supabaseService.getUnreadAnnouncements().then(announcements => {
            lastAnnouncementCount = announcements ? announcements.length : 0;
        });
        
        setInterval(async () => {
            // Check for new tasks if notification system is available
            if (typeof notificationSystem !== 'undefined') {
                const currentUser = await supabaseService.getCurrentUser();
                if (currentUser) {
                    const allTasks = await supabaseService.getTasksWithAcknowledgements();
                    const employees = await supabaseService.getEmployees();
                    const userEmployee = employees?.find(e => e.user_id === currentUser.id);
                    
                    if (userEmployee && allTasks) {
                        const userTasks = allTasks.filter(t => t.employee_id === userEmployee.id);
                        await notificationSystem.checkForNewTasks(userTasks.length);
                    }
                }
            }
            
            // Check for new announcements
            const unreadAnnouncements = await supabaseService.getUnreadAnnouncements();
            if (unreadAnnouncements && unreadAnnouncements.length > lastAnnouncementCount) {
                const newCount = unreadAnnouncements.length - lastAnnouncementCount;
                console.log(`📢 ${newCount} new announcement(s) detected!`);
                
                // Add notification for new announcements
                if (typeof notificationSystem !== 'undefined' && newCount > 0) {
                    const latestAnnouncement = unreadAnnouncements[0];
                    notificationSystem.addNotification(
                        'announcement',
                        `📢 ${latestAnnouncement.title}: ${latestAnnouncement.message.substring(0, 100)}...`
                    );
                }
                
                lastAnnouncementCount = unreadAnnouncements.length;
            } else if (unreadAnnouncements) {
                lastAnnouncementCount = unreadAnnouncements.length;
            }
            
            await syncFromSupabase();
        }, 2000); // Refresh every 2 seconds
        
        console.log('🔄 Auto-refresh enabled (every 2 seconds)');
    }

    // My Shifts and Profile functionality
    let currentEmployeeData = null;

    // Get current employee data
    async function getCurrentEmployee() {
        if (currentEmployeeData) return currentEmployeeData;

        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) return null;

        const employees = await supabaseService.getEmployees();
        currentEmployeeData = employees?.find(e => e.user_id === currentUser.id);
        return currentEmployeeData;
    }

    // My Shifts Modal
    const myShiftsModal = document.getElementById('myShiftsModal');
    const myShiftsBtn = document.getElementById('viewMyShiftsBtn');
    let shiftsWeekStart = getMonday(new Date());

    myShiftsBtn.addEventListener('click', async () => {
        myShiftsModal.style.display = 'block';
        await loadMyShifts();
    });

    document.getElementById('myShiftsPrevWeek').addEventListener('click', async () => {
        shiftsWeekStart.setDate(shiftsWeekStart.getDate() - 7);
        await loadMyShifts();
    });

    document.getElementById('myShiftsNextWeek').addEventListener('click', async () => {
        shiftsWeekStart.setDate(shiftsWeekStart.getDate() + 7);
        await loadMyShifts();
    });

    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    function formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    async function loadMyShifts() {
        const content = document.getElementById('myShiftsContent');
        content.innerHTML = '<div class="loading-message">Loading your shifts...</div>';

        const employee = await getCurrentEmployee();
        if (!employee) {
            content.innerHTML = '<div class="loading-message">Error loading employee data</div>';
            return;
        }

        const weekEnd = new Date(shiftsWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const shifts = await supabaseService.getEmployeeShifts(
            formatDate(shiftsWeekStart),
            formatDate(weekEnd)
        );

        // Get exceptions for this employee for the week
        const exceptions = await supabaseService.getExceptionLogs({
            employeeId: employee.id,
            startDate: formatDate(shiftsWeekStart),
            endDate: formatDate(weekEnd)
        });

        // Update week display
        document.getElementById('myShiftsWeekDisplay').textContent = 
            `${formatDateDisplay(shiftsWeekStart)} - ${formatDateDisplay(weekEnd)}`;

        // Filter for this employee only
        const myShifts = shifts?.filter(s => s.employee_id === employee.id) || [];

        // Generate week days
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(shiftsWeekStart);
            day.setDate(day.getDate() + i);
            weekDays.push(day);
        }

        // Create shift map
        const shiftMap = {};
        myShifts.forEach(shift => {
            if (!shiftMap[shift.shift_date]) {
                shiftMap[shift.shift_date] = [];
            }
            shiftMap[shift.shift_date].push(shift);
        });

        // Create exception map
        const exceptionMap = {};
        exceptions.forEach(exc => {
            if (!exceptionMap[exc.exception_date]) {
                exceptionMap[exc.exception_date] = [];
            }
            exceptionMap[exc.exception_date].push(exc);
        });

        // Exception colors
        const exceptionColors = {
            'VAUT': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'DO': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            'UAEO': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
        };

        const exceptionLabels = {
            'VAUT': 'Verified Authorized Unavailable Time',
            'DO': 'Day Off',
            'UAEO': 'Unauthorized Absence'
        };

        // Build display
        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">';
        
        weekDays.forEach(day => {
            const dateStr = formatDate(day);
            const dayShifts = shiftMap[dateStr] || [];
            const dayExceptions = exceptionMap[dateStr] || [];
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
            
            html += `
                <div style="border: 2px solid var(--border-color); border-radius: 8px; padding: 15px; background: ${dayShifts.length > 0 ? '#f0f9ff' : 'white'};">
                    <div style="font-weight: 600; margin-bottom: 10px; text-align: center; color: var(--text-primary);">
                        ${dayName}<br>${formatDateDisplay(day)}
                    </div>
                    ${dayShifts.length > 0 ? dayShifts.map(shift => {
                        const statusColors = {
                            'scheduled': 'var(--primary-color)',
                            'completed': 'var(--success-color)',
                            'cancelled': 'var(--danger-color)',
                            'no-show': '#94a3b8'
                        };
                        return `
                            <div style="background: ${statusColors[shift.status] || statusColors.scheduled}; color: white; padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                                <div style="font-weight: 600;">${shift.start_time.substring(0, 5)} - ${shift.end_time.substring(0, 5)}</div>
                                ${shift.shift_templates ? `<div style="font-size: 11px; opacity: 0.9;">${shift.shift_templates.name}</div>` : ''}
                                ${shift.notes ? `<div style="font-size: 11px; margin-top: 5px; opacity: 0.9;">${shift.notes}</div>` : ''}
                            </div>
                        `;
                    }).join('') : '<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px 0;">No shifts</div>'}
                    ${dayExceptions.length > 0 ? dayExceptions.map(exc => `
                        <div style="background: ${exceptionColors[exc.exception_code] || '#64748b'}; color: white; padding: 10px; border-radius: 6px; margin-top: 8px; font-size: 12px; border: 2px solid rgba(255,255,255,0.3);">
                            <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">${exc.exception_code}</div>
                            <div style="font-size: 11px; opacity: 0.95; margin-bottom: 3px;">${exceptionLabels[exc.exception_code] || exc.exception_code}</div>
                            ${exc.start_time && exc.end_time ? `<div style="font-size: 11px; opacity: 0.9;">⏰ ${exc.start_time.substring(0, 5)} - ${exc.end_time.substring(0, 5)}</div>` : ''}
                            ${exc.reason ? `<div style="font-size: 11px; margin-top: 4px; opacity: 0.9; font-style: italic;">${exc.reason}</div>` : ''}
                            ${exc.approved_by && exc.approved_by !== 'SYSTEM' ? `<div style="font-size: 10px; margin-top: 4px; opacity: 0.8;">✓ Approved by ${exc.approved_by}</div>` : ''}
                        </div>
                    `).join('') : ''}
                </div>
            `;
        });
        
        html += '</div>';
        content.innerHTML = html;
    }

    // My Profile Modal
    const myProfileModal = document.getElementById('myProfileModal');
    const myProfileBtn = document.getElementById('editMyProfileBtn');
    const myProfileForm = document.getElementById('myProfileForm');

    myProfileBtn.addEventListener('click', async () => {
        await loadMyProfile();
        myProfileModal.style.display = 'block';
    });

    document.getElementById('cancelMyProfileBtn').addEventListener('click', () => {
        myProfileModal.style.display = 'none';
    });

    async function loadMyProfile() {
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error loading employee data');
            return;
        }

        const profile = await supabaseService.getEmployeeProfile(employee.id);

        document.getElementById('myProfileName').value = employee.name;
        document.getElementById('myProfilePhone').value = profile?.phone || '';
        document.getElementById('myProfileEmail').value = profile?.email || '';
        document.getElementById('myProfileSkills').value = profile?.skills ? profile.skills.join(', ') : '';
        document.getElementById('myProfileCertifications').value = profile?.certifications ? profile.certifications.join(', ') : '';
    }

    myProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Error loading employee data');
            return;
        }

        const profileData = {
            phone: document.getElementById('myProfilePhone').value.trim() || null,
            email: document.getElementById('myProfileEmail').value.trim() || null,
            skills: document.getElementById('myProfileSkills').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0),
            certifications: document.getElementById('myProfileCertifications').value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0)
        };

        try {
            const result = await supabaseService.createOrUpdateEmployeeProfile(employee.id, profileData);
            
            if (result) {
                alert('✅ Profile updated successfully!');
                myProfileModal.style.display = 'none';
            } else {
                alert('❌ Failed to update profile. Please try again.');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('❌ Error saving profile. Please try again.');
        }
    });

    // Close modals when clicking outside or on close button
    window.addEventListener('click', (e) => {
        if (e.target === myShiftsModal) {
            myShiftsModal.style.display = 'none';
        }
        if (e.target === myProfileModal) {
            myProfileModal.style.display = 'none';
        }
    });

    myShiftsModal.querySelector('.close').addEventListener('click', () => {
        myShiftsModal.style.display = 'none';
    });

    myProfileModal.querySelector('.close').addEventListener('click', () => {
        myProfileModal.style.display = 'none';
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
    
    // Task Details Modal
    const taskDetailsModal = document.getElementById('taskDetailsModal');
    const closeBtn = taskDetailsModal.querySelector('.close');
    
    closeBtn.addEventListener('click', function() {
        taskDetailsModal.style.display = 'none';
    });
    
    window.addEventListener('click', function(e) {
        if (e.target === taskDetailsModal) {
            taskDetailsModal.style.display = 'none';
        }
    });
    
    // Override task click handler for read-only view
    gantt.onTaskClick = async function(task) {
        const employee = this.data.employees.find(e => e.id === task.employeeId);
        
        const statusLabels = {
            'in-progress': 'In Progress',
            'completed': 'Completed',
            'pending': 'Pending',
            'overdue': 'Overdue',
            'on-hold': 'On Hold'
        };
        
        // Format time display
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        const timeDisplay = `${formatTime(startTime)} - ${formatTime(endTime)}`;
        
        const taskDetailsContent = document.getElementById('taskDetails');
        taskDetailsContent.innerHTML = `
            <p><strong>Task:</strong> ${task.name}</p>
            <p><strong>Assigned To:</strong> ${employee.name} (${employee.role})</p>
            <p><strong>Start Date:</strong> ${formatFullDate(new Date(task.startDate))}</p>
            <p><strong>End Date:</strong> ${formatFullDate(new Date(task.endDate))}</p>
            <p><strong>Time:</strong> ${timeDisplay}</p>
            <p><strong>Status:</strong> ${statusLabels[task.status]}</p>
            <p><strong>Duration:</strong> ${calculateDuration(task.startDate, task.endDate)} days</p>
        `;
        
        // Setup acknowledgement buttons
        await setupAcknowledgementButtons(task.id);
        
        // Load and display messages
        await loadTaskMessages(task.id);
        
        // Setup message sending
        setupMessageSending(task.id);
        
        taskDetailsModal.style.display = 'block';
    };
    
    // Setup acknowledgement buttons
    async function setupAcknowledgementButtons(taskId) {
        const acknowledgeBtn = document.getElementById('acknowledgeBtn');
        const unacknowledgeBtn = document.getElementById('unacknowledgeBtn');
        
        if (!supabaseService.isReady()) {
            acknowledgeBtn.style.display = 'none';
            unacknowledgeBtn.style.display = 'none';
            return;
        }
        
        // Check if already acknowledged
        const hasAcked = await supabaseService.hasAcknowledgedTask(taskId);
        
        if (hasAcked) {
            acknowledgeBtn.style.display = 'none';
            unacknowledgeBtn.style.display = 'block';
        } else {
            acknowledgeBtn.style.display = 'block';
            unacknowledgeBtn.style.display = 'none';
        }
        
        // Acknowledge button handler
        acknowledgeBtn.onclick = async function() {
            const result = await supabaseService.acknowledgeTask(taskId);
            if (result) {
                alert('Task acknowledged successfully!');
                acknowledgeBtn.style.display = 'none';
                unacknowledgeBtn.style.display = 'block';
                await syncFromSupabase();
            } else {
                alert('Failed to acknowledge task');
            }
        };
        
        // Unacknowledge button handler
        unacknowledgeBtn.onclick = async function() {
            const result = await supabaseService.unacknowledgeTask(taskId);
            if (result) {
                alert('Acknowledgement removed');
                acknowledgeBtn.style.display = 'block';
                unacknowledgeBtn.style.display = 'none';
                await syncFromSupabase();
            } else {
                alert('Failed to remove acknowledgement');
            }
        };
    }
    
    function formatTime(timeStr) {
        if (!timeStr || timeStr.length !== 4) return '00:00';
        return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
    }
    
    function formatFullDate(date) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
    
    function calculateDuration(start, end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs((endDate - startDate) / oneDay)) + 1;
    }
    
    // Load task messages
    async function loadTaskMessages(taskId) {
        const messagesList = document.getElementById('taskMessagesList');
        
        if (!supabaseService.isReady()) {
            messagesList.innerHTML = '<p class="messages-empty">Messages are not available offline</p>';
            return;
        }
        
        const messages = await supabaseService.getTaskMessages(taskId);
        
        if (!messages || messages.length === 0) {
            messagesList.innerHTML = '<p class="messages-empty">No messages yet. Send a message to ask a question!</p>';
            return;
        }
        
        messagesList.innerHTML = messages.map(msg => {
            const isFromAdmin = msg.is_from_admin;
            const author = msg.user?.full_name || 'Unknown';
            const time = new Date(msg.created_at).toLocaleString();
            
            return `
                <div class="message-item ${isFromAdmin ? 'from-admin' : 'from-employee'}">
                    <div class="message-header">
                        <span class="message-author">${isFromAdmin ? '👨‍💼 ' : '👤 '}${author}</span>
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
    
    // Setup message sending
    function setupMessageSending(taskId) {
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        
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
            
            const result = await supabaseService.sendTaskMessage(taskId, message, false);
            
            if (result) {
                messageInput.value = '';
                await loadTaskMessages(taskId);
                
                // Show success notification
                if (notificationSystem) {
                    notificationSystem.addNotification(
                        'Message sent to admin',
                        'Your message has been sent successfully',
                        'success'
                    );
                }
            } else {
                alert('Failed to send message. Please try again.');
            }
            
            newSendBtn.disabled = false;
            newSendBtn.textContent = 'Send Message';
        });
        
        // Allow Enter key to send (Shift+Enter for new line)
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                newSendBtn.click();
            }
        });
    }
    
    // ============================================
    // TIME OFF REQUEST FUNCTIONALITY
    // ============================================
    
    const timeOffModal = document.getElementById('timeOffModal');
    const requestTimeOffBtn = document.getElementById('requestTimeOffBtn');
    const closeTimeOffModal = document.getElementById('closeTimeOffModal');
    const cancelTimeOffBtn = document.getElementById('cancelTimeOffBtn');
    const timeOffForm = document.getElementById('timeOffForm');
    
    // Open time off modal
    requestTimeOffBtn.addEventListener('click', async () => {
        timeOffModal.style.display = 'flex';
        
        // Set minimum date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('timeOffStartDate').min = today;
        document.getElementById('timeOffEndDate').min = today;
        
        // Load existing time off requests
        await loadMyTimeOffRequests();
    });
    
    // Close modal
    closeTimeOffModal.addEventListener('click', () => {
        timeOffModal.style.display = 'none';
        timeOffForm.reset();
    });
    
    cancelTimeOffBtn.addEventListener('click', () => {
        timeOffModal.style.display = 'none';
        timeOffForm.reset();
    });
    
    // Close modal when clicking outside
    timeOffModal.addEventListener('click', (e) => {
        if (e.target === timeOffModal) {
            timeOffModal.style.display = 'none';
            timeOffForm.reset();
        }
    });
    
    // Submit time off request
    timeOffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!supabaseService.isReady()) {
            alert('Time off requests require an active connection');
            return;
        }
        
        const currentUser = await supabaseService.getCurrentUser();
        if (!currentUser) {
            alert('You must be logged in to submit a time off request');
            return;
        }
        
        // Get current employee
        const employee = await getCurrentEmployee();
        if (!employee) {
            alert('Could not find your employee record');
            return;
        }
        
        const startDate = document.getElementById('timeOffStartDate').value;
        const endDate = document.getElementById('timeOffEndDate').value;
        const reason = document.getElementById('timeOffReason').value.trim();
        
        // Validate dates
        if (new Date(endDate) < new Date(startDate)) {
            alert('End date cannot be before start date');
            return;
        }
        
        // Create time off request
        const request = {
            employee_id: employee.id,
            start_date: startDate,
            end_date: endDate,
            reason: reason,
            status: 'pending'
        };
        
        const submitBtn = timeOffForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Submitting...';
        
        const result = await supabaseService.createTimeOffRequest(request);
        
        submitBtn.disabled = false;
        submitBtn.textContent = '📤 Submit Request';
        
        if (result) {
            alert('Time off request submitted successfully!');
            timeOffForm.reset();
            await loadMyTimeOffRequests();
            
            // Show notification
            if (notificationSystem) {
                notificationSystem.addNotification(
                    'Time Off Request Submitted',
                    `Your request from ${startDate} to ${endDate} has been submitted for approval`,
                    'success'
                );
            }
        } else {
            alert('Failed to submit time off request. Please try again.');
        }
    });
    
    // Load employee's time off requests
    async function loadMyTimeOffRequests() {
        const listContainer = document.getElementById('myTimeOffRequestsList');
        
        if (!supabaseService.isReady()) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Time off requests require an active connection</p>';
            return;
        }
        
        const employee = await getCurrentEmployee();
        if (!employee) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Could not load your employee record</p>';
            return;
        }
        
        const requests = await supabaseService.getTimeOffRequests();
        
        if (!requests || requests.length === 0) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No time off requests yet</p>';
            return;
        }
        
        // Filter to only this employee's requests
        const myRequests = requests.filter(r => r.employee_id === employee.id);
        
        if (myRequests.length === 0) {
            listContainer.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No time off requests yet</p>';
            return;
        }
        
        // Sort by most recent first
        myRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        listContainer.innerHTML = myRequests.map(request => {
            const statusColors = {
                'pending': '#f59e0b',
                'approved': '#10b981',
                'denied': '#ef4444'
            };
            
            const statusIcons = {
                'pending': '⏳',
                'approved': '✅',
                'denied': '❌'
            };
            
            const startDate = new Date(request.start_date).toLocaleDateString();
            const endDate = new Date(request.end_date).toLocaleDateString();
            const requestDate = new Date(request.created_at).toLocaleDateString();
            
            return `
                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <div>
                            <strong>${startDate} - ${endDate}</strong>
                            <div style="color: #64748b; font-size: 0.875rem; margin-top: 4px;">
                                Requested: ${requestDate}
                            </div>
                        </div>
                        <span style="background: ${statusColors[request.status]}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.875rem; font-weight: 500;">
                            ${statusIcons[request.status]} ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                    </div>
                    <div style="color: #374151; margin-top: 8px;">
                        <strong>Reason:</strong> ${request.reason}
                    </div>
                    ${request.admin_notes ? `
                        <div style="margin-top: 8px; padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 0.875rem;">
                            <strong>Admin Notes:</strong> ${request.admin_notes}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
});

