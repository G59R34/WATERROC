// Employee Portal - Mobile-Friendly Task Management
// ================================================

let supabaseClient = null;
let currentUser = null;
let currentEmployee = null;
let tasks = [];
let refreshInterval = null;
let pullStartY = 0;
let isPulling = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication first
        const userRole = sessionStorage.getItem('userRole');
        if (userRole !== 'employee') {
            window.location.href = 'emp-login.html';
            return;
        }

        // Initialize Supabase
        if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase initialized');
            
            // Load user session
            await loadUserSession();
            
            // Initialize the app
            await initApp();
            
            // Set up event listeners
            setupEventListeners();
            
            // Start auto-refresh
            startAutoRefresh();
            
            // Update time display
            updateTimeDisplay();
            setInterval(updateTimeDisplay, 1000);
            
        } else {
            throw new Error('Supabase configuration not found');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Failed to initialize. Please try logging in again.');
        window.location.href = 'emp-login.html';
    }
});

// Load user session
async function loadUserSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error || !session) {
            throw new Error('No active session');
        }
        
        // Load user profile
        const { data: user, error: userError } = await supabaseClient
            .from('users')
            .select('id, username, full_name, role')
            .eq('auth_id', session.user.id)
            .single();
        
        if (userError || !user) {
            throw new Error('User profile not found');
        }
        
        if (user.role !== 'employee') {
            throw new Error('Unauthorized access');
        }
        
        currentUser = user;
        currentEmployee = {
            id: user.id,
            name: user.full_name || user.username,
            username: user.username
        };
        
        console.log('User session loaded:', currentEmployee);
        
    } catch (error) {
        console.error('Session load error:', error);
        sessionStorage.clear();
        throw error;
    }
}

// Initialize app
async function initApp() {
    // Display employee info
    displayEmployeeInfo();
    
    // Load tasks
    await loadTasks();
    
    // Display tasks
    displayTasks();
}

// Display employee information
function displayEmployeeInfo() {
    const employeeNameEl = document.getElementById('employeeName');
    const statusTextEl = document.getElementById('statusText');
    const currentShiftEl = document.getElementById('currentShift');
    
    if (employeeNameEl) {
        employeeNameEl.textContent = currentEmployee.name;
    }
    
    // Check employment status
    const employmentStatus = sessionStorage.getItem('employmentStatus') || 'active';
    
    if (statusTextEl) {
        if (employmentStatus === 'active') {
            statusTextEl.textContent = 'Active';
        } else {
            statusTextEl.textContent = employmentStatus.replace('_', ' ').toUpperCase();
        }
    }
    
    // Load current shift info
    loadCurrentShift();
}

// Load current shift
async function loadCurrentShift() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toTimeString().substring(0, 5); // HH:MM
        
        // Check if employee has a shift today
        const { data: shift, error } = await supabaseClient
            .from('hourly_tasks')
            .select('*')
            .eq('employee_id', currentEmployee.id)
            .eq('task_date', today)
            .lte('start_time', currentTime)
            .gte('end_time', currentTime)
            .maybeSingle();
        
        const currentShiftEl = document.getElementById('currentShift');
        
        if (shift) {
            currentShiftEl.textContent = `On shift: ${shift.start_time} - ${shift.end_time}`;
        } else {
            // Check for upcoming shift today
            const { data: upcomingShift } = await supabaseClient
                .from('hourly_tasks')
                .select('start_time, end_time')
                .eq('employee_id', currentEmployee.id)
                .eq('task_date', today)
                .gt('start_time', currentTime)
                .order('start_time', { ascending: true })
                .limit(1)
                .maybeSingle();
            
            if (upcomingShift) {
                currentShiftEl.textContent = `Next shift: ${upcomingShift.start_time}`;
            } else {
                currentShiftEl.textContent = 'No shift scheduled today';
            }
        }
    } catch (error) {
        console.error('Error loading shift:', error);
    }
}

// Load tasks from Supabase
async function loadTasks() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Load hourly tasks for today
        const { data: hourlyTasks, error: hourlyError } = await supabaseClient
            .from('hourly_tasks')
            .select('*')
            .eq('employee_id', currentEmployee.id)
            .eq('task_date', today)
            .order('start_time', { ascending: true });
        
        if (hourlyError) {
            console.error('Error loading hourly tasks:', hourlyError);
        }
        
        // Load daily tasks
        const { data: dailyTasks, error: dailyError } = await supabaseClient
            .from('tasks')
            .select('*')
            .eq('employee_id', currentEmployee.id)
            .lte('start_date', today)
            .gte('end_date', today)
            .order('start_time', { ascending: true });
        
        if (dailyError) {
            console.error('Error loading daily tasks:', dailyError);
        }
        
        // Combine and format tasks
        tasks = [];
        
        if (hourlyTasks) {
            tasks = tasks.concat(hourlyTasks.map(task => ({
                ...task,
                type: 'hourly',
                start: `${task.task_date} ${task.start_time}:00`,
                end: `${task.task_date} ${task.end_time}:00`,
                location: task.work_area || 'Unknown'
            })));
        }
        
        if (dailyTasks) {
            tasks = tasks.concat(dailyTasks.map(task => ({
                ...task,
                type: 'daily',
                start: `${task.start_date} ${task.start_time?.substring(0, 2)}:${task.start_time?.substring(2, 4)}:00`,
                end: `${task.end_date} ${task.end_time?.substring(0, 2)}:${task.end_time?.substring(2, 4)}:00`,
                location: 'General'
            })));
        }
        
        // Sort by start time
        tasks.sort((a, b) => new Date(a.start) - new Date(b.start));
        
        console.log('Loaded tasks:', tasks.length);
        
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Display tasks in their respective sections
function displayTasks() {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    // Categorize tasks
    const upcomingTasks = [];
    const currentTasks = [];
    const todayTasks = [];
    const completedTasks = [];
    
    tasks.forEach(task => {
        const taskStart = new Date(task.start);
        const taskEnd = new Date(task.end);
        
        // Check if completed
        if (task.status === 'completed') {
            completedTasks.push(task);
        }
        // Check if current
        else if (taskStart <= now && taskEnd >= now) {
            currentTasks.push(task);
        }
        // Check if upcoming (within 2 hours)
        else if (taskStart > now && taskStart <= twoHoursFromNow) {
            upcomingTasks.push(task);
        }
        
        // All tasks for today
        todayTasks.push(task);
    });
    
    // Display each category
    displayTaskList('upcomingTasksList', upcomingTasks, 'upcomingCount');
    displayTaskList('currentTasksList', currentTasks, 'currentCount');
    displayTaskList('todayTasksList', todayTasks, 'todayCount');
    displayTaskList('completedTasksList', completedTasks, 'completedCount');
}

// Display a list of tasks
function displayTaskList(containerId, taskList, countId) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    
    if (!container) return;
    
    // Update count
    if (countEl) {
        countEl.textContent = taskList.length;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Show empty state if no tasks
    if (taskList.length === 0) {
        const emptyIcon = containerId.includes('upcoming') ? '⏰' :
                         containerId.includes('current') ? '✅' :
                         containerId.includes('today') ? '📋' : '🎉';
        const emptyText = containerId.includes('upcoming') ? 'No upcoming tasks' :
                         containerId.includes('current') ? 'No active tasks' :
                         containerId.includes('today') ? 'No tasks today' :
                         'No completed tasks';
        
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${emptyIcon}</div>
                <div class="empty-state-text">${emptyText}</div>
            </div>
        `;
        return;
    }
    
    // Display each task
    taskList.forEach(task => {
        const taskCard = createTaskCard(task);
        container.appendChild(taskCard);
    });
}

// Create a task card element
function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    
    // Determine task urgency and styling
    const now = new Date();
    const taskStart = new Date(task.start);
    const minutesUntil = Math.floor((taskStart - now) / 1000 / 60);
    
    if (task.status === 'completed') {
        card.classList.add('completed');
    } else if (task.status === 'in-progress' || (taskStart <= now && new Date(task.end) >= now)) {
        card.classList.add('in-progress');
    } else if (minutesUntil <= 30 && minutesUntil > 0) {
        card.classList.add('urgent');
    }
    
    // Format times
    const startTime = formatTime(taskStart);
    const endTime = formatTime(new Date(task.end));
    
    // Build time until text
    let timeUntilHTML = '';
    if (task.status !== 'completed' && minutesUntil > 0) {
        const urgentClass = minutesUntil <= 30 ? 'soon' : '';
        if (minutesUntil < 60) {
            timeUntilHTML = `<div class="time-until ${urgentClass}">Starts in ${minutesUntil} min</div>`;
        } else {
            const hours = Math.floor(minutesUntil / 60);
            timeUntilHTML = `<div class="time-until ${urgentClass}">Starts in ${hours}h ${minutesUntil % 60}m</div>`;
        }
    }
    
    // Status badge
    const statusText = task.status || 'pending';
    const statusClass = statusText.toLowerCase().replace('_', '-');
    
    card.innerHTML = `
        <div class="task-header">
            <div class="task-title">${escapeHtml(task.name)}</div>
            <div class="task-status ${statusClass}">${statusText}</div>
        </div>
        <div class="task-info">
            <div class="task-time">
                <span>🕐</span>
                <span class="task-time-badge">${startTime} - ${endTime}</span>
            </div>
            <div>
                <span class="task-location">📍 ${escapeHtml(task.location)}</span>
            </div>
            ${timeUntilHTML}
        </div>
    `;
    
    return card;
}

// Format time to HH:MM AM/PM
function formatTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Update time display
function updateTimeDisplay() {
    const now = new Date();
    const timeOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const timeString = now.toLocaleString('en-US', timeOptions);
    
    const timeEl = document.getElementById('currentTime');
    if (timeEl) {
        timeEl.textContent = timeString;
    }
}

// Refresh tasks
async function refreshTasks() {
    console.log('Refreshing tasks...');
    
    // Show loading in upcoming section
    const upcomingList = document.getElementById('upcomingTasksList');
    if (upcomingList) {
        upcomingList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    }
    
    // Reload data
    await loadTasks();
    await loadCurrentShift();
    
    // Re-display
    displayTasks();
    
    console.log('Tasks refreshed');
}

// Setup event listeners
function setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.style.transform = 'rotate(360deg)';
            await refreshTasks();
            setTimeout(() => {
                refreshBtn.style.transform = '';
            }, 600);
        });
    }
    
    // Bottom navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all
            navItems.forEach(i => i.classList.remove('active'));
            // Add to clicked
            item.classList.add('active');
            
            // Handle navigation
            if (item.id === 'navProfile') {
                alert('Profile section coming soon!');
            } else if (item.id === 'navTime') {
                alert('Time tracking coming soon!');
            }
        });
    });
    
    // Pull to refresh
    setupPullToRefresh();
}

// Setup pull to refresh
function setupPullToRefresh() {
    const pullIndicator = document.getElementById('pullIndicator');
    
    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            pullStartY = e.touches[0].clientY;
        }
    });
    
    document.addEventListener('touchmove', (e) => {
        if (pullStartY > 0) {
            const currentY = e.touches[0].clientY;
            const pullDistance = currentY - pullStartY;
            
            if (pullDistance > 80) {
                isPulling = true;
                pullIndicator.classList.add('show');
            }
        }
    });
    
    document.addEventListener('touchend', async () => {
        if (isPulling) {
            isPulling = false;
            pullIndicator.classList.remove('show');
            await refreshTasks();
        }
        pullStartY = 0;
    });
}

// Handle logout
async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await supabaseClient.auth.signOut();
            sessionStorage.clear();
            window.location.href = 'emp-login.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Error logging out. Please try again.');
        }
    }
}

// Auto-refresh every 2 minutes
function startAutoRefresh() {
    refreshInterval = setInterval(async () => {
        console.log('Auto-refreshing tasks...');
        await refreshTasks();
    }, 120000); // 2 minutes
}

// Stop auto-refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    } else {
        // Page is visible again, refresh and restart auto-refresh
        refreshTasks();
        startAutoRefresh();
    }
});
