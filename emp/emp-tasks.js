// Employee Tasks (emp.waterroc.com)
document.addEventListener('DOMContentLoaded', async function() {
    'use strict';

    let currentEmployee = null;
    let currentShift = null;
    let tasks = [];
    let refreshInterval = null;
    let initAttempts = 0;

    function goToLogin() {
        // Keep relative so it works whether /emp/ is mounted or served as a folder
        window.location.href = './login.html';
    }

    // Wait for Supabase to load
    function waitForSupabase() {
        return new Promise((resolve) => {
            const checkSupabase = () => {
                initAttempts++;
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    resolve(true);
                } else if (initAttempts >= 60) {
                    resolve(false);
                } else {
                    setTimeout(checkSupabase, 100);
                }
            };
            checkSupabase();
        });
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function updateEmployeeInfo() {
        const nameEl = document.getElementById('employeeName');
        if (nameEl) nameEl.textContent = currentEmployee?.name || 'Employee';
    }

    function updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const el = document.getElementById('currentTime');
        if (el) el.textContent = timeString;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
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

    async function loadExceptionStatus(today) {
        try {
            const exceptions = await supabaseService.getExceptionLogs({
                employeeId: currentEmployee.employeeId,
                date: today
            });

            const exceptionDiv = document.getElementById('exceptionStatus');
            if (!exceptionDiv) return;

            if (exceptions && exceptions.length > 0) {
                const exception = exceptions[0];
                const codeColors = {
                    'VAUT': { bg: '#10b981', text: 'Authorized Time Off' },
                    'VATO': { bg: '#10b981', text: 'Verified Authorized Time Off' },
                    'DO': { bg: '#3b82f6', text: 'Day Off' },
                    'UAEO': { bg: '#ef4444', text: 'Unauthorized Absence' },
                    'NSFT': { bg: '#f59e0b', text: 'No Show For Task' },
                    'EMWM': { bg: '#8b5cf6', text: 'Meeting With Management' }
                };

                const codeInfo = codeColors[exception.exception_code] || { bg: '#64748b', text: exception.exception_code };
                exceptionDiv.innerHTML = `
                    <div style="padding: 12px; background: ${codeInfo.bg}; color: white; border-radius: 12px; margin-top: 10px;">
                        <strong style="font-size: 14px;">⚠️ Exception: ${escapeHtml(exception.exception_code)}</strong>
                        <div style="font-size: 13px; margin-top: 6px; opacity: 0.95;">${escapeHtml(codeInfo.text)}</div>
                        ${exception.reason ? `<div style="font-size: 12px; margin-top: 6px; opacity: 0.9;">Reason: ${escapeHtml(exception.reason)}</div>` : ''}
                        ${exception.approved_by ? `<div style="font-size: 12px; margin-top: 4px; opacity: 0.9;">✓ Approved by ${escapeHtml(exception.approved_by)}</div>` : ''}
                    </div>
                `;
            } else {
                exceptionDiv.innerHTML = '';
            }
        } catch (error) {
            console.error('Error loading exception status:', error);
        }
    }

    async function loadTodayShift(today) {
        try {
            const shiftEl = document.getElementById('currentShift');
            if (!currentEmployee?.employeeId) {
                if (shiftEl) shiftEl.textContent = 'No employee record found';
                return;
            }

            const shifts = await supabaseService.getEmployeeShifts(today, today);
            currentShift = (shifts || []).find(s => s.employee_id === currentEmployee.employeeId) || null;

            if (!currentShift) {
                if (shiftEl) shiftEl.textContent = 'No shift scheduled today';
                await loadExceptionStatus(today);
                return;
            }

            const startTime = String(currentShift.start_time || '').substring(0, 5);
            const endTime = String(currentShift.end_time || '').substring(0, 5);
            if (shiftEl) shiftEl.textContent = `Today's Shift: ${startTime} - ${endTime}`;
            await loadExceptionStatus(today);
        } catch (error) {
            console.error('Error loading shift:', error);
            const shiftEl = document.getElementById('currentShift');
            if (shiftEl) shiftEl.textContent = 'Error loading shift';
        }
    }

    function renderTaskList(containerId, taskList, showTimeUntil, showAllDaily = false) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!taskList || taskList.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tasks</p></div>';
            return;
        }

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        container.innerHTML = taskList.map(task => {
            const startTime = task.start_time || task.startTime;
            const endTime = task.end_time || task.endTime;
            const workArea = task.work_area || task.workArea;
            const acknowledgedAt = task.acknowledged_at || task.acknowledgedAt;

            const urgentClass = task.minutesUntil && task.minutesUntil <= 30 ? 'urgent' : '';
            const statusClass = task.status === 'completed' ? 'completed' :
                task.status === 'in-progress' ? 'in-progress' : '';

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
                ? `<button class="btn-acknowledge" data-ack-task-id="${task.id}">✓ Acknowledge Task</button>`
                : '';

            return `
                <div class="task-item ${urgentClass} ${statusClass}" data-task-id="${task.id}">
                    <div class="task-header">
                        <h3 class="task-title">${escapeHtml(task.name)}</h3>
                        <span class="task-status ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
                    </div>
                    <div class="task-details">
                        <div class="task-time">
                            <strong>🕐 Time:</strong> ${String(startTime).substring(0, 5)} - ${String(endTime).substring(0, 5)}
                        </div>
                        <div class="task-location ${escapeHtml(workArea || 'other')}">
                            📍 ${escapeHtml(formatWorkArea(workArea))}
                        </div>
                        ${timeUntilHtml}
                        ${timeStatusHtml}
                        ${acknowledgedHtml}
                    </div>
                    ${acknowledgeBtn}
                </div>
            `;
        }).join('');

        // Wire acknowledge buttons
        container.querySelectorAll('[data-ack-task-id]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const taskId = Number(btn.getAttribute('data-ack-task-id'));
                await acknowledgeTask(taskId, btn);
            });
        });
    }

    function renderTasks() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const twoHoursFromNow = currentTime + 120;

        const upcomingTasks = [];
        const currentTasks = [];
        const completedTasks = [];
        const allDailyTasks = [];

        (tasks || []).forEach(task => {
            const startTime = task.start_time || task.startTime;
            const endTime = task.end_time || task.endTime;
            if (!startTime || !endTime) return;

            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const taskStartTime = startHour * 60 + startMin;
            const taskEndTime = endHour * 60 + endMin;

            allDailyTasks.push({ ...task, taskStartTime, taskEndTime });

            if (task.status === 'completed') {
                completedTasks.push(task);
            } else if (taskStartTime > currentTime) {
                if (taskStartTime <= twoHoursFromNow) {
                    upcomingTasks.push({ ...task, minutesUntil: taskStartTime - currentTime });
                }
            } else if (currentTime >= taskStartTime && currentTime <= taskEndTime) {
                currentTasks.push(task);
            }
        });

        upcomingTasks.sort((a, b) => a.minutesUntil - b.minutesUntil);
        currentTasks.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        completedTasks.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
        allDailyTasks.sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return 1;
            if (a.status !== 'completed' && b.status === 'completed') return -1;
            return (a.taskStartTime || 0) - (b.taskStartTime || 0);
        });

        renderTaskList('upcomingTasksList', upcomingTasks, true);
        renderTaskList('currentTasksList', currentTasks, false);
        renderTaskList('completedTasksList', completedTasks, false);
        renderTaskList('allDailyTasksList', allDailyTasks, false, true);
    }

    async function loadTasks(today) {
        try {
            if (!currentEmployee?.employeeId) {
                tasks = [];
                renderTasks();
                return;
            }

            tasks = await supabaseService.getHourlyTasks(today, today, currentEmployee.employeeId) || [];
            renderTasks();
        } catch (error) {
            console.error('Error loading tasks:', error);
            tasks = [];
            renderTasks();
        }
    }

    async function acknowledgeTask(taskId, buttonEl) {
        try {
            if (!taskId) return;
            if (!currentEmployee?.name) return;

            if (buttonEl) {
                buttonEl.disabled = true;
                buttonEl.textContent = 'Acknowledging...';
            }

            const result = await supabaseService.acknowledgeHourlyTask(taskId, currentEmployee.name);
            if (!result) {
                alert('Failed to acknowledge task. Please try again.');
                return;
            }

            const today = formatDate(new Date());
            await loadTasks(today);
        } catch (error) {
            console.error('Error acknowledging task:', error);
            alert('Error acknowledging task. Please try again.');
        } finally {
            if (buttonEl) {
                buttonEl.disabled = false;
                buttonEl.textContent = '✓ Acknowledge Task';
            }
        }
    }

    function setupEventListeners() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                        await supabaseService.signOut();
                    }
                } catch (error) {
                    console.error('Error during logout:', error);
                }
                sessionStorage.clear();
                goToLogin();
            });
        }

        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                const today = formatDate(new Date());
                await loadTodayShift(today);
                await loadTasks(today);
            });
        }
    }

    async function init() {
        // Optional: show global loading screen if available
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }

        const ready = await waitForSupabase();
        if (!ready) {
            alert('⚠️ Connection error. Please try refreshing the page.');
            return;
        }

        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            goToLogin();
            return;
        }

        await supabaseService.loadCurrentUser();
        const user = await supabaseService.getCurrentUser();
        if (!user) {
            sessionStorage.clear();
            goToLogin();
            return;
        }

        // Disallow admin accounts on employee portal
        if (user.is_admin === true) {
            await supabaseService.signOut();
            sessionStorage.clear();
            goToLogin();
            return;
        }

        const employee = await supabaseService.getCurrentEmployee();
        if (!employee) {
            await supabaseService.signOut();
            sessionStorage.clear();
            goToLogin();
            return;
        }

        // Employment status check (employee_profiles.employee_id => employees.id)
        const { data: profile } = await supabaseService.client
            .from('employee_profiles')
            .select('employment_status')
            .eq('employee_id', employee.id)
            .maybeSingle();

        const employmentStatus = profile?.employment_status || 'active';
        sessionStorage.setItem('employmentStatus', employmentStatus);
        sessionStorage.setItem('userRole', 'employee');

        if (employmentStatus === 'terminated' || employmentStatus === 'administrative_leave') {
            alert('Your account access has been revoked. Please contact an administrator.');
            await supabaseService.signOut();
            sessionStorage.clear();
            goToLogin();
            return;
        }

        if (employmentStatus === 'extended_leave') {
            window.location.href = '/extended-leave.html';
            return;
        }

        currentEmployee = {
            id: user.id,
            employeeId: employee.id,
            name: employee.name || user.full_name || user.username || 'Employee',
            username: user.username
        };

        setupEventListeners();
        updateEmployeeInfo();
        updateCurrentTime();

        const today = formatDate(new Date());
        await loadTodayShift(today);
        await loadTasks(today);

        refreshInterval = setInterval(async () => {
            const todayNow = formatDate(new Date());
            await loadTodayShift(todayNow);
            await loadTasks(todayNow);
            updateCurrentTime();
        }, 30000);

        setInterval(updateCurrentTime, 1000);
    }

    await init();

    window.addEventListener('beforeunload', () => {
        if (refreshInterval) clearInterval(refreshInterval);
    });
});

