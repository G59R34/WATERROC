// Analytics Dashboard Script
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Initialize variables
    let currentStartDate, currentEndDate;

    // Navigation
    document.getElementById('backToDashboard').addEventListener('click', function() {
        window.location.href = 'admin.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                await supabaseService.signOut();
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }
        sessionStorage.clear();
        window.location.href = 'index.html';
    });

    // Check Supabase connection
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
            window.location.href = 'index.html';
            return;
        }
    } else {
        alert('Analytics requires Supabase connection');
        window.location.href = 'admin.html';
        return;
    }

    // Date range selector
    const dateRangeSelect = document.getElementById('dateRangeSelect');
    const customDateRange = document.getElementById('customDateRange');
    const customStartDate = document.getElementById('customStartDate');
    const customEndDate = document.getElementById('customEndDate');
    const applyCustomRange = document.getElementById('applyCustomRange');

    dateRangeSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            updateDateRange(this.value);
        }
    });

    applyCustomRange.addEventListener('click', function() {
        if (customStartDate.value && customEndDate.value) {
            currentStartDate = customStartDate.value;
            currentEndDate = customEndDate.value;
            loadAnalytics();
        } else {
            alert('Please select both start and end dates');
        }
    });

    function updateDateRange(range) {
        const today = new Date();
        let startDate, endDate;

        switch (range) {
            case 'today':
                startDate = endDate = formatDate(today);
                break;
            case 'week':
                startDate = formatDate(new Date(today.setDate(today.getDate() - 7)));
                endDate = formatDate(new Date());
                break;
            case 'month':
                startDate = formatDate(new Date(today.setMonth(today.getMonth() - 1)));
                endDate = formatDate(new Date());
                break;
            case 'quarter':
                startDate = formatDate(new Date(today.setMonth(today.getMonth() - 3)));
                endDate = formatDate(new Date());
                break;
            case 'year':
                startDate = formatDate(new Date(today.setFullYear(today.getFullYear() - 1)));
                endDate = formatDate(new Date());
                break;
        }

        currentStartDate = startDate;
        currentEndDate = endDate;
        loadAnalytics();
    }

    function formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    // Load analytics data
    async function loadAnalytics() {
        try {
            // Load summary
            await loadSummary();
            
            // Load employee performance
            await loadEmployeePerformance();
            
            // Load status breakdown
            await loadStatusBreakdown();
            
            // Load recent activity
            await loadRecentActivity();
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    async function loadSummary() {
        const summary = await supabaseService.getAnalyticsSummary(currentStartDate, currentEndDate);
        
        if (summary) {
            document.getElementById('totalTasks').textContent = summary.total_tasks;
            document.getElementById('completedTasks').textContent = summary.completed_tasks;
            
            const completionRate = summary.total_tasks > 0 
                ? ((summary.completed_tasks / summary.total_tasks) * 100).toFixed(1)
                : 0;
            document.getElementById('completionRate').textContent = `${completionRate}% completion`;
            
            document.getElementById('onTimeRate').textContent = 
                `${summary.on_time_completion_rate.toFixed(1)}%`;
            
            document.getElementById('totalHours').textContent = 
                `${summary.total_hours_logged.toFixed(1)}h`;
        }
    }

    async function loadEmployeePerformance() {
        const workload = await supabaseService.getEmployeeWorkload(currentStartDate, currentEndDate);
        const tbody = document.getElementById('employeePerformanceTable');
        
        if (!workload || workload.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-message">No data available for this period</td></tr>';
            return;
        }

        tbody.innerHTML = workload.map(emp => {
            const performanceBadge = getPerformanceBadge(emp.completion_rate);
            
            return `
                <tr>
                    <td><strong>${escapeHtml(emp.employee_name)}</strong></td>
                    <td>${emp.total_tasks}</td>
                    <td><span style="color: var(--success-color);">${emp.completed_tasks}</span></td>
                    <td><span style="color: var(--warning-color);">${emp.pending_tasks}</span></td>
                    <td>${Number(emp.total_hours).toFixed(1)}h</td>
                    <td>
                        ${emp.completion_rate.toFixed(1)}%
                        <div class="progress-bar">
                            <div class="progress-bar-fill" style="width: ${emp.completion_rate}%"></div>
                        </div>
                    </td>
                    <td>${performanceBadge}</td>
                </tr>
            `;
        }).join('');
    }

    function getPerformanceBadge(rate) {
        if (rate >= 90) {
            return '<span class="performance-badge excellent">Excellent</span>';
        } else if (rate >= 75) {
            return '<span class="performance-badge good">Good</span>';
        } else if (rate >= 50) {
            return '<span class="performance-badge average">Average</span>';
        } else {
            return '<span class="performance-badge poor">Needs Improvement</span>';
        }
    }

    async function loadStatusBreakdown() {
        const summary = await supabaseService.getAnalyticsSummary(currentStartDate, currentEndDate);
        
        if (!summary) return;

        const total = summary.total_tasks || 1; // Avoid division by zero

        const statuses = [
            { status: 'completed', count: summary.completed_tasks },
            { status: 'in-progress', count: summary.in_progress_tasks },
            { status: 'pending', count: summary.pending_tasks },
            { status: 'overdue', count: summary.overdue_tasks }
        ];

        statuses.forEach(({ status, count }) => {
            const percentage = (count / total) * 100;
            const statusBar = document.querySelector(`.status-bar[data-status="${status}"]`);
            const statusCount = statusBar.parentElement.querySelector('.status-count');
            
            if (statusBar && statusCount) {
                statusBar.querySelector('.status-bar-fill').style.width = `${percentage}%`;
                statusCount.textContent = count;
            }
        });
    }

    async function loadRecentActivity() {
        const activityFeed = document.getElementById('activityFeed');
        
        // Get recent tasks
        const tasks = await supabaseService.getTasks();
        if (!tasks) {
            activityFeed.innerHTML = '<div class="activity-item"><div class="activity-icon">📭</div><div class="activity-content"><p>No recent activity</p></div></div>';
            return;
        }

        // Filter and sort by date
        const recentTasks = tasks
            .filter(t => {
                const taskDate = new Date(t.date);
                const start = new Date(currentStartDate);
                const end = new Date(currentEndDate);
                return taskDate >= start && taskDate <= end;
            })
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .slice(0, 10);

        if (recentTasks.length === 0) {
            activityFeed.innerHTML = '<div class="activity-item"><div class="activity-icon">📭</div><div class="activity-content"><p>No recent activity in this period</p></div></div>';
            return;
        }

        activityFeed.innerHTML = recentTasks.map(task => {
            const icon = getStatusIcon(task.status);
            const time = getTimeAgo(new Date(task.updated_at || task.created_at));
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <p><strong>${escapeHtml(task.name)}</strong> - ${task.status}</p>
                        <span class="activity-time">${time}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function getStatusIcon(status) {
        const icons = {
            'completed': '✅',
            'in-progress': '🔵',
            'pending': '🟡',
            'overdue': '🔴',
            'on-hold': '🟣'
        };
        return icons[status] || '📋';
    }

    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        
        return date.toLocaleDateString();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize with default date range (this week)
    updateDateRange('week');
});
