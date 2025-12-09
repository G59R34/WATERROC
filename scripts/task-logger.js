// Task Logger - Tracks all task events and statistics
class TaskLogger {
    constructor() {
        this.logKey = 'taskLog';
        this.statsKey = 'taskStats';
        this.employeeStatsKey = 'employeeTaskStats';
        this.init();
    }

    init() {
        // Initialize storage structures if they don't exist
        if (!localStorage.getItem(this.logKey)) {
            localStorage.setItem(this.logKey, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.statsKey)) {
            localStorage.setItem(this.statsKey, JSON.stringify({
                totalCreated: 0,
                totalCompleted: 0,
                totalDeleted: 0,
                totalAcknowledged: 0,
                byWorkArea: {},
                byStatus: {},
                byDate: {}
            }));
        }
        if (!localStorage.getItem(this.employeeStatsKey)) {
            localStorage.setItem(this.employeeStatsKey, JSON.stringify({}));
        }
    }

    /**
     * Log a task event
     * @param {string} action - 'created', 'completed', 'deleted', 'acknowledged', 'modified'
     * @param {object} task - The task object
     * @param {object} additionalData - Any additional data to log
     */
    logEvent(action, task, additionalData = {}) {
        const log = JSON.parse(localStorage.getItem(this.logKey));
        
        const logEntry = {
            id: Date.now() + Math.random(), // Unique log ID
            timestamp: new Date().toISOString(),
            action: action,
            taskId: task.id,
            taskName: task.name,
            employeeId: task.employeeId,
            employeeName: task.employeeName || 'Unknown',
            workArea: task.workArea,
            startTime: task.startTime,
            endTime: task.endTime,
            status: task.status,
            date: task.date || new Date().toISOString().split('T')[0],
            acknowledged: task.acknowledged || false,
            acknowledgedBy: task.acknowledgedBy || null,
            acknowledgedAt: task.acknowledgedAt || null,
            ...additionalData
        };

        log.push(logEntry);
        localStorage.setItem(this.logKey, JSON.stringify(log));

        // Update statistics
        this.updateStats(action, task);
        this.updateEmployeeStats(action, task);

        console.log(`📊 Task event logged: ${action} - ${task.name}`);
    }

    /**
     * Update global task statistics
     */
    updateStats(action, task) {
        const stats = JSON.parse(localStorage.getItem(this.statsKey));
        const dateKey = task.date || new Date().toISOString().split('T')[0];

        // Update totals
        if (action === 'created') stats.totalCreated++;
        if (action === 'completed') stats.totalCompleted++;
        if (action === 'deleted') stats.totalDeleted++;
        if (action === 'acknowledged') stats.totalAcknowledged++;

        // Update by work area
        if (!stats.byWorkArea[task.workArea]) {
            stats.byWorkArea[task.workArea] = { created: 0, completed: 0, deleted: 0 };
        }
        if (action === 'created') stats.byWorkArea[task.workArea].created++;
        if (action === 'completed') stats.byWorkArea[task.workArea].completed++;
        if (action === 'deleted') stats.byWorkArea[task.workArea].deleted++;

        // Update by status
        if (!stats.byStatus[task.status]) {
            stats.byStatus[task.status] = 0;
        }
        stats.byStatus[task.status]++;

        // Update by date
        if (!stats.byDate[dateKey]) {
            stats.byDate[dateKey] = { created: 0, completed: 0, deleted: 0 };
        }
        if (action === 'created') stats.byDate[dateKey].created++;
        if (action === 'completed') stats.byDate[dateKey].completed++;
        if (action === 'deleted') stats.byDate[dateKey].deleted++;

        localStorage.setItem(this.statsKey, JSON.stringify(stats));
    }

    /**
     * Update employee-specific statistics
     */
    updateEmployeeStats(action, task) {
        const employeeStats = JSON.parse(localStorage.getItem(this.employeeStatsKey));
        const employeeId = task.employeeId.toString();

        if (!employeeStats[employeeId]) {
            employeeStats[employeeId] = {
                employeeName: task.employeeName || 'Unknown',
                totalAssigned: 0,
                totalCompleted: 0,
                totalAcknowledged: 0,
                totalDeleted: 0,
                byWorkArea: {},
                completionRate: 0,
                acknowledgmentRate: 0,
                taskHistory: []
            };
        }

        const empStats = employeeStats[employeeId];

        // Update totals
        if (action === 'created') empStats.totalAssigned++;
        if (action === 'completed') empStats.totalCompleted++;
        if (action === 'acknowledged') empStats.totalAcknowledged++;
        if (action === 'deleted') empStats.totalDeleted++;

        // Update by work area
        if (!empStats.byWorkArea[task.workArea]) {
            empStats.byWorkArea[task.workArea] = { assigned: 0, completed: 0 };
        }
        if (action === 'created') empStats.byWorkArea[task.workArea].assigned++;
        if (action === 'completed') empStats.byWorkArea[task.workArea].completed++;

        // Calculate rates
        const activeTaskCount = empStats.totalAssigned - empStats.totalDeleted;
        empStats.completionRate = activeTaskCount > 0 
            ? Math.round((empStats.totalCompleted / activeTaskCount) * 100) 
            : 0;
        empStats.acknowledgmentRate = activeTaskCount > 0
            ? Math.round((empStats.totalAcknowledged / activeTaskCount) * 100)
            : 0;

        // Add to task history
        empStats.taskHistory.push({
            timestamp: new Date().toISOString(),
            action: action,
            taskId: task.id,
            taskName: task.name,
            workArea: task.workArea
        });

        // Keep only last 100 history items
        if (empStats.taskHistory.length > 100) {
            empStats.taskHistory = empStats.taskHistory.slice(-100);
        }

        localStorage.setItem(this.employeeStatsKey, JSON.stringify(employeeStats));
    }

    /**
     * Get all logs with optional filtering
     */
    getLogs(filters = {}) {
        let logs = JSON.parse(localStorage.getItem(this.logKey));

        if (filters.action) {
            logs = logs.filter(log => log.action === filters.action);
        }
        if (filters.employeeId) {
            logs = logs.filter(log => log.employeeId === filters.employeeId);
        }
        if (filters.workArea) {
            logs = logs.filter(log => log.workArea === filters.workArea);
        }
        if (filters.startDate) {
            logs = logs.filter(log => log.date >= filters.startDate);
        }
        if (filters.endDate) {
            logs = logs.filter(log => log.date <= filters.endDate);
        }

        return logs;
    }

    /**
     * Get global statistics
     */
    getStats() {
        return JSON.parse(localStorage.getItem(this.statsKey));
    }

    /**
     * Get statistics for a specific employee
     */
    getEmployeeStats(employeeId) {
        const stats = JSON.parse(localStorage.getItem(this.employeeStatsKey));
        return stats[employeeId.toString()] || null;
    }

    /**
     * Get all employee statistics
     */
    getAllEmployeeStats() {
        return JSON.parse(localStorage.getItem(this.employeeStatsKey));
    }

    /**
     * Get leaderboard of employees by completion rate
     */
    getLeaderboard(metric = 'completionRate') {
        const stats = this.getAllEmployeeStats();
        const leaderboard = Object.entries(stats)
            .map(([id, data]) => ({
                employeeId: id,
                employeeName: data.employeeName,
                [metric]: data[metric],
                totalCompleted: data.totalCompleted,
                totalAssigned: data.totalAssigned
            }))
            .sort((a, b) => b[metric] - a[metric]);

        return leaderboard;
    }

    /**
     * Export logs as CSV
     */
    exportLogsAsCSV() {
        const logs = JSON.parse(localStorage.getItem(this.logKey));
        
        if (logs.length === 0) return null;

        const headers = Object.keys(logs[0]);
        const csv = [
            headers.join(','),
            ...logs.map(log => 
                headers.map(header => 
                    JSON.stringify(log[header] || '')
                ).join(',')
            )
        ].join('\n');

        return csv;
    }

    /**
     * Clear old logs (keep last N days)
     */
    clearOldLogs(daysToKeep = 90) {
        const logs = JSON.parse(localStorage.getItem(this.logKey));
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const filteredLogs = logs.filter(log => 
            new Date(log.timestamp) >= cutoffDate
        );

        localStorage.setItem(this.logKey, JSON.stringify(filteredLogs));
        console.log(`🗑️ Cleared ${logs.length - filteredLogs.length} old log entries`);
    }
}

// Create global instance
const taskLogger = new TaskLogger();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskLogger;
}
