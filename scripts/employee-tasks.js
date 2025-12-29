// Employee Tasks Page - Shows tasks in text format, only upcoming tasks within 2 hours
document.addEventListener('DOMContentLoaded', async function() {
    'use strict';

    function isEmpPortal() {
        const host = window.location.hostname || '';
        const path = window.location.pathname || '';
        return host.startsWith('emp.') || path.startsWith('/emp/');
    }

    function getLoginUrl() {
        return isEmpPortal() ? '/emp/login.html' : 'index.html';
    }

    function getExtendedLeaveUrl() {
        return isEmpPortal() ? '/extended-leave.html' : 'extended-leave.html';
    }

    // Show page load screen on initial load
    if (typeof showPageLoadScreen !== 'undefined') {
        showPageLoadScreen();
    }

    // Check authentication first using sessionStorage
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = getLoginUrl();
        return;
    }

    let currentEmployee = null;
    let currentShift = null;
    let tasks = [];
    let refreshInterval = null;
    let initAttempts = 0;

    // Wait for Supabase to load
    function waitForSupabase() {
        return new Promise((resolve) => {
            const checkSupabase = () => {
                initAttempts++;
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    console.log('Supabase is ready after', initAttempts, 'attempts');
                    resolve(true);
                } else if (initAttempts >= 50) {
                    console.error('Supabase failed to load after 50 attempts');
                    resolve(false);
                } else {
                    console.log('Waiting for Supabase... attempt', initAttempts);
                    setTimeout(checkSupabase, 100);
                }
            };
            checkSupabase();
        });
    }

    // Initialize
    async function init() {
        console.log('Initializing employee tasks page...');
        
        // Wait for Supabase to be ready
        const supabaseReady = await waitForSupabase();
        
        if (!supabaseReady) {
            alert('⚠️ Connection error. Please try refreshing the page.');
            return;
        }
        
        console.log('Supabase is ready');
        
        // Load current user from auth
        await supabaseService.loadCurrentUser();
        const user = await supabaseService.getCurrentUser();

        if (!user) {
            console.error('Could not load user data');
            alert('Could not load user data. Please log in again.');
            sessionStorage.clear();
            window.location.href = getLoginUrl();
            return;
        }
        
        console.log('Current user loaded:', user);
        
        // Check employment status
        const { data: profile } = await supabaseService.client
            .from('employee_profiles')
            .select('employment_status')
            .eq('employee_id', user.id)
            .single();
        
        const employmentStatus = profile?.employment_status || 'active';
        
        if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
            alert('Your account access has been revoked. Please contact an administrator.');
            await supabaseService.signOut();
            sessionStorage.clear();
            window.location.href = getLoginUrl();
            return;
        }
        
        if (employmentStatus === 'extended_leave') {
            window.location.href = getExtendedLeaveUrl();
            return;
        }
        
        // Use the user's name directly - user object has username and full_name from users table
        currentEmployee = {
            id: user.id,
            name: user.full_name || user.username || 'Employee',
            username: user.username
        };
        
        console.log('Employee data set:', currentEmployee);

        // Initialize UI
        setupEventListeners();
        updateEmployeeInfo();
        updateCurrentTime();
        
        // Load employee ID first, then load shift and tasks
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('employee data');
        }
        await loadEmployeeId();
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('shift information');
        }
        await loadTodayShift();
        
        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('tasks');
        }
        await loadTasks();

        // Auto-refresh every 30 seconds
        refreshInterval = setInterval(async () => {
            // Don't show loading screens on auto-refresh to avoid interrupting user
            await loadTodayShift(); // Reload shift data from Supabase
            await loadTasks();
            updateCurrentTime();
        }, 30000);

        // Update time and shift display every second
        setInterval(() => {
            updateCurrentTime();
            updateShiftDisplay();
        }, 1000);
    }

    function setupEventListeners() {
        document.getElementById('logoutBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('logout');
            }
            
            try {
                // Sign out from Supabase
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    console.log('Signing out from Supabase...');
                    await supabaseService.signOut();
                }
            } catch (error) {
                console.error('Error during Supabase logout:', error);
            }
            
            // Clear all session data
            sessionStorage.clear();
            
            // Redirect to login
            window.location.href = getLoginUrl();
        });

        document.getElementById('refreshBtn').addEventListener('click', async () => {
            if (typeof showDataLoadingScreen !== 'undefined') {
                showDataLoadingScreen('tasks');
            }
            await loadTasks();
            showNotification('✅ Tasks refreshed');
        });
    }

    function updateEmployeeInfo() {
        document.getElementById('employeeName').textContent = currentEmployee.name;
    }

    function updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('currentTime').textContent = timeString;
    }

    // Format date as YYYY-MM-DD using local timezone (not UTC)
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async function loadEmployeeId() {
        try {
            if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
                console.warn('Supabase not available for loading employee ID');
                return;
            }
            // Prefer lookup by linked user_id (more reliable). currentEmployee.id is the users.id UUID.
            const userId = currentEmployee.id;
            if (userId) {
                const { data: employees } = await supabaseService.client
                    .from('employees')
                    .select('*')
                    .eq('user_id', userId)
                    .limit(1);

                if (employees && employees.length > 0) {
                    const employeeId = employees[0].id;
                    console.log('Employee ID loaded by user_id:', employeeId);
                    currentEmployee.employeeId = employeeId;
                    return;
                }
            }

            // Fallback: match by name if no user link
            const { data: employeesByName } = await supabaseService.client
                .from('employees')
                .select('*')
                .eq('name', currentEmployee.name)
                .limit(1);

            if (employeesByName && employeesByName.length > 0) {
                const employeeId = employeesByName[0].id;
                console.log('Employee ID loaded by name fallback:', employeeId);
                currentEmployee.employeeId = employeeId;
            } else {
                console.warn('No employee record found for', currentEmployee.name);
            }
        } catch (error) {
            console.error('Error loading employee ID:', error);
        }
    }

    async function loadTodayShift() {
        try {
            if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
                console.warn('Supabase not available for loading shifts');
                document.getElementById('currentShift').textContent = 'Shift data unavailable (offline mode)';
                return;
            }

            if (!currentEmployee.employeeId) {
                console.warn('Employee ID not set, cannot load shift');
                document.getElementById('currentShift').textContent = 'No employee record found';
                return;
            }

            const today = formatDate(new Date());
            const shifts = await supabaseService.getEmployeeShifts(today, today);
            console.log('All shifts for today:', shifts);
            currentShift = shifts.find(s => s.employee_id === currentEmployee.employeeId);
            console.log('Current employee shift:', currentShift);

            if (currentShift) {
                await updateShiftDisplay();
            } else {
                document.getElementById('currentShift').textContent = 'No shift scheduled today';
            }
        } catch (error) {
            console.error('Error loading shift:', error);
            document.getElementById('currentShift').textContent = 'Error loading shift';
        }
    }

    async function updateShiftDisplay() {
        if (!currentShift) return;

        const startTime = currentShift.start_time.substring(0, 5);
        const endTime = currentShift.end_time.substring(0, 5);
        const now = new Date();
        
        // Parse shift start time
        const [startHour, startMin] = currentShift.start_time.split(':').map(Number);
        const shiftStart = new Date();
        shiftStart.setHours(startHour, startMin, 0, 0);
        
        // Parse shift end time
        const [endHour, endMin] = currentShift.end_time.split(':').map(Number);
        const shiftEnd = new Date();
        shiftEnd.setHours(endHour, endMin, 0, 0);
        
        const minutesUntilStart = Math.floor((shiftStart - now) / 60000);
        const minutesUntilEnd = Math.floor((shiftEnd - now) / 60000);
        
        let displayText = `Today's Shift: ${startTime} - ${endTime}`;
        
        if (minutesUntilStart > 0) {
            // Shift hasn't started yet
            const hours = Math.floor(minutesUntilStart / 60);
            const mins = minutesUntilStart % 60;
            if (hours > 0) {
                displayText += ` • Starts in ${hours}h ${mins}m`;
            } else {
                displayText += ` • Starts in ${mins} minutes`;
            }
        } else if (minutesUntilEnd > 0) {
            // Currently in shift
            const hours = Math.floor(minutesUntilEnd / 60);
            const mins = minutesUntilEnd % 60;
            displayText += ` • 🟢 Active`;
            if (hours > 0) {
                displayText += ` (${hours}h ${mins}m remaining)`;
            } else {
                displayText += ` (${mins}m remaining)`;
            }
        } else {
            // Shift has ended
            displayText += ' • Completed';
        }
        
        document.getElementById('currentShift').textContent = displayText;
        
        // Load and display exception status
        await loadExceptionStatus();
    }
    
    async function loadExceptionStatus() {
        try {
            const today = formatDate(new Date());
            const exceptions = await supabaseService.getExceptionLogs({
                employeeId: currentEmployee.employeeId,
                date: today
            });
            
            const exceptionDiv = document.getElementById('exceptionStatus');
            
            if (exceptions && exceptions.length > 0) {
                const exception = exceptions[0];
                const codeColors = {
                    'VAUT': { bg: '#10b981', text: 'Authorized Time Off' },
                    'DO': { bg: '#3b82f6', text: 'Day Off' },
                    'UAEO': { bg: '#ef4444', text: 'Unauthorized Absence' }
                };
                
                const codeInfo = codeColors[exception.exception_code] || { bg: '#64748b', text: exception.exception_code };
                
                exceptionDiv.innerHTML = `
                    <div style="padding: 12px; background: ${codeInfo.bg}; color: white; border-radius: 8px; margin-top: 10px;">
                        <strong style="font-size: 14px;">⚠️ Exception Status: ${exception.exception_code}</strong>
                        <div style="font-size: 13px; margin-top: 5px; opacity: 0.95;">${codeInfo.text}</div>
                        ${exception.reason ? `<div style="font-size: 12px; margin-top: 5px; opacity: 0.9;">Reason: ${exception.reason}</div>` : ''}
                        ${exception.approved_by ? `<div style="font-size: 12px; margin-top: 3px; opacity: 0.9;">✓ Approved by ${exception.approved_by}</div>` : ''}
                    </div>
                `;
            } else {
                exceptionDiv.innerHTML = '';
            }
        } catch (error) {
            console.error('Error loading exception status:', error);
        }
    }

    async function loadTasks() {
        try {
            const today = formatDate(new Date());
            
            console.log('Loading tasks from Supabase for employeeId:', currentEmployee.employeeId);
            
            if (!supabaseService || !supabaseService.isReady()) {
                console.error('Supabase not connected');
                tasks = [];
                renderTasks();
                return;
            }
            
            // Filter tasks for current employee using the employeeId we got from the employees table
            if (currentEmployee.employeeId) {
                // Fetch tasks from Supabase for this employee and today's date
                tasks = await supabaseService.getHourlyTasks(today, today, currentEmployee.employeeId) || [];
                console.log('Tasks loaded for employeeId from Supabase:', currentEmployee.employeeId, tasks.length);
            } else {
                console.warn('No employeeId set, attempting fallback fetch for all hourly tasks and matching by name');
                // Fetch all hourly tasks for the date and try to find matching by employee name
                const allTasks = await supabaseService.getHourlyTasks(today, today, null) || [];
                console.log('Fetched all tasks for date (fallback):', allTasks.length);
                tasks = allTasks.filter(t => {
                    // Supabase returns related employee as `employees` per getHourlyTasks
                    const emp = t.employees || t.employee || null;
                    if (!emp) return false;
                    if (emp.id && currentEmployee.employeeId && emp.id === currentEmployee.employeeId) return true;
                    if (emp.name && currentEmployee.name && emp.name === currentEmployee.name) return true;
                    return false;
                });
                console.log('Tasks after name/id matching fallback:', tasks.length);
            }
            
            renderTasks();
        } catch (error) {
            console.error('Error loading tasks:', error);
            tasks = [];
            renderTasks();
        }
    }

    function renderTasks() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const twoHoursFromNow = currentTime + 120; // 2 hours = 120 minutes

        // Categorize tasks
        const upcomingTasks = [];
        const currentTasks = [];
        const completedTasks = [];
        const allDailyTasks = [];

        tasks.forEach(task => {
            // Handle both Supabase format (start_time) and old format (startTime)
            const startTime = task.start_time || task.startTime;
            const endTime = task.end_time || task.endTime;
            
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const taskStartTime = startHour * 60 + startMin;
            const taskEndTime = endHour * 60 + endMin;

            // Add to all daily tasks list
            allDailyTasks.push({ ...task, taskStartTime, taskEndTime });

            if (task.status === 'completed') {
                completedTasks.push(task);
            } else if (taskStartTime > currentTime) {
                // Upcoming task - only show if within 2 hours
                if (taskStartTime <= twoHoursFromNow) {
                    upcomingTasks.push({ ...task, minutesUntil: taskStartTime - currentTime });
                }
            } else if (currentTime >= taskStartTime && currentTime <= taskEndTime) {
                currentTasks.push(task);
            }
        });

        // Sort by start time
        upcomingTasks.sort((a, b) => a.minutesUntil - b.minutesUntil);
        
        // Sort using snake_case or camelCase field names
        currentTasks.sort((a, b) => {
            const aStart = a.start_time || a.startTime;
            const bStart = b.start_time || b.startTime;
            return aStart.localeCompare(bStart);
        });
        completedTasks.sort((a, b) => {
            const aStart = a.start_time || a.startTime;
            const bStart = b.start_time || b.startTime;
            return bStart.localeCompare(aStart);
        });

        // Sort all daily tasks by start time
        allDailyTasks.sort((a, b) => {
            // Completed tasks go to the end
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (a.status !== 'completed' && b.status === 'completed') return -1;
            // Otherwise sort by start time
            return a.taskStartTime - b.taskStartTime;
        });

        // Render each category
        renderTaskList('upcomingTasksList', upcomingTasks, true);
        renderTaskList('currentTasksList', currentTasks, false);
        renderTaskList('completedTasksList', completedTasks, false);
        renderTaskList('allDailyTasksList', allDailyTasks, false, true);
    }

    function renderTaskList(containerId, taskList, showTimeUntil, showAllDaily = false) {
        const container = document.getElementById(containerId);
        
        if (taskList.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tasks</p></div>';
            return;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        container.innerHTML = taskList.map(task => {
            // Handle both Supabase format (start_time) and old format (startTime)
            const startTime = task.start_time || task.startTime;
            const endTime = task.end_time || task.endTime;
            const workArea = task.work_area || task.workArea;
            const acknowledgedAt = task.acknowledged_at || task.acknowledgedAt;
            
            const urgentClass = task.minutesUntil && task.minutesUntil <= 30 ? 'urgent' : '';
            const statusClass = task.status === 'completed' ? 'completed' : 
                               task.status === 'in-progress' ? 'in-progress' : '';
            
            // For "All Daily Tasks" section, show time status
            let timeStatusHtml = '';
            if (showAllDaily) {
                const taskStartTime = task.taskStartTime || 0;
                const taskEndTime = task.taskEndTime || 0;
                
                if (task.status === 'completed') {
                    timeStatusHtml = '<div class="time-status completed-time">✅ Completed</div>';
                } else if (currentTime < taskStartTime) {
                    const minutesUntil = taskStartTime - currentTime;
                    const hours = Math.floor(minutesUntil / 60);
                    const mins = minutesUntil % 60;
                    const timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                    timeStatusHtml = `<div class="time-status upcoming-time">⏰ Starts in ${timeText}</div>`;
                } else if (currentTime >= taskStartTime && currentTime <= taskEndTime) {
                    timeStatusHtml = '<div class="time-status current-time">🟢 In Progress</div>';
                } else {
                    timeStatusHtml = '<div class="time-status past-time">⏪ Past</div>';
                }
            }
            
            let timeUntilHtml = '';
            if (showTimeUntil && task.minutesUntil !== undefined) {
                const hours = Math.floor(task.minutesUntil / 60);
                const mins = task.minutesUntil % 60;
                const timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                timeUntilHtml = `<div class="time-until">⏰ Starts in ${timeText}</div>`;
            }

            const acknowledgedHtml = task.acknowledged 
                ? `<div class="acknowledged-badge">✅ Acknowledged ${acknowledgedAt ? 'at ' + new Date(acknowledgedAt).toLocaleTimeString() : ''}</div>`
                : '';
            
            const acknowledgeBtn = !task.acknowledged && task.status !== 'completed'
                ? `<button class="btn-acknowledge" onclick="acknowledgeTask(${task.id})">✓ Acknowledge Task</button>`
                : '';

            return `
                <div class="task-item ${urgentClass} ${statusClass}" data-task-id="${task.id}">
                    <div class="task-header">
                        <h3 class="task-title">${escapeHtml(task.name)}</h3>
                        <span class="task-status ${task.status}">${task.status}</span>
                    </div>
                    <div class="task-details">
                        <div class="task-time">
                            <strong>🕐 Time:</strong> ${startTime.substring(0,5)} - ${endTime.substring(0,5)}
                        </div>
                        <div class="task-location ${workArea || 'other'}">
                            📍 ${formatWorkArea(workArea)}
                        </div>
                        ${timeUntilHtml}
                        ${timeStatusHtml}
                        ${acknowledgedHtml}
                    </div>
                    ${acknowledgeBtn}
                </div>
            `;
        }).join('');
    }

    function formatWorkArea(area) {
        const areaNames = {
            'music-prod': 'Music Prod.',
            'video-creation': 'Video Creation',
            'administrative': 'Administrative',
            'other': 'Other',
            'note-other': 'Note - Other'
        };
        return areaNames[area] || 'Unassigned';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Make acknowledgeTask available globally
    window.acknowledgeTask = async function(taskId) {
        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('task acknowledgement');
        }
        
        try {
            console.log('Attempting to acknowledge task:', taskId);
            console.log('Current employee:', currentEmployee);
            
            if (!supabaseService || !supabaseService.isReady()) {
                showNotification('❌ Supabase not connected');
                return;
            }
            
            if (!currentEmployee || !currentEmployee.name) {
                showNotification('❌ Employee data not loaded');
                return;
            }
            
            // Acknowledge the task in the database
            const result = await supabaseService.acknowledgeHourlyTask(taskId, currentEmployee.name);
            console.log('Acknowledge result:', result);
            
            if (!result) {
                showNotification('❌ Failed to acknowledge task');
                return;
            }
            
            // Reload tasks to update display
            await loadTasks();
            
            showNotification('✅ Task acknowledged!');
        } catch (error) {
            console.error('Error acknowledging task:', error);
            showNotification('❌ Error: ' + error.message);
        }
    };

    function showNotification(message) {
        // Simple notification - could be enhanced
        const notif = document.createElement('div');
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }

    // Start the application
    init();

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

});
