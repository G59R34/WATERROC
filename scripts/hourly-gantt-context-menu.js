// Hourly Gantt Chart Context Menu
// ===================================
// Handles right-click context menu for adding and deleting hourly tasks

class HourlyGanttContextMenu {
    constructor(hourlyGanttChart) {
        this.hourlyGantt = hourlyGanttChart;
        this.menu = null;
        this.currentContext = null; // { employeeId, workArea, hour, taskId }
        this.init();
    }

    init() {
        this.createMenu();
        this.setupEventListeners();
    }

    createMenu() {
        // Remove existing menu if it exists
        const existing = document.getElementById('hourlyGanttContextMenu');
        if (existing) {
            existing.remove();
        }

        // Create menu element
        this.menu = document.createElement('div');
        this.menu.id = 'hourlyGanttContextMenu';
        this.menu.className = 'gantt-context-menu hourly-gantt-context-menu';
        this.menu.innerHTML = `
            <div class="context-menu-item" data-action="add-task">
                <span class="context-menu-icon">➕</span>
                <span class="context-menu-text">Add Task</span>
            </div>
            <div class="context-menu-item" data-action="delete-task" style="display: none;">
                <span class="context-menu-icon">🗑️</span>
                <span class="context-menu-text">Delete Task</span>
            </div>
        `;

        document.body.appendChild(this.menu);

        // Add click handlers
        this.menu.querySelector('[data-action="add-task"]').addEventListener('click', () => {
            this.handleAddTask();
        });

        this.menu.querySelector('[data-action="delete-task"]').addEventListener('click', () => {
            this.handleDeleteTask();
        });
    }

    setupEventListeners() {
        // Hide menu on click outside
        document.addEventListener('click', (e) => {
            if (this.menu && !this.menu.contains(e.target)) {
                this.hide();
            }
        });

        // Hide menu on scroll
        document.addEventListener('scroll', () => {
            this.hide();
        }, true);

        // Prevent default context menu on Hourly Gantt chart
        // Use event delegation since the chart re-renders
        if (this.hourlyGantt.container) {
            this.hourlyGantt.container.addEventListener('contextmenu', (e) => {
                // Only handle if clicking on a timeline area or task
                const timelineArea = e.target.closest('.hourly-gantt-timeline-area');
                const taskElement = e.target.closest('.hourly-gantt-task');
                
                if (timelineArea || taskElement) {
                    e.preventDefault();
                    this.handleContextMenu(e);
                }
            });
        }
    }

    handleContextMenu(e) {
        // Find the clicked timeline area and work area row
        const timelineArea = e.target.closest('.hourly-gantt-timeline-area');
        const areaRow = e.target.closest('.hourly-gantt-area-row');
        const taskElement = e.target.closest('.hourly-gantt-task');

        if (!timelineArea || !areaRow) {
            return;
        }

        // Get employee ID and work area from row
        const employeeId = areaRow.dataset.employeeId;
        const workArea = areaRow.dataset.area;
        
        if (!employeeId || !workArea) return;

        // Calculate which hour was clicked
        const rect = timelineArea.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const hour = Math.floor(clickX / this.hourlyGantt.hourWidth);
        const clampedHour = Math.max(0, Math.min(23, hour));

        // Check if there's a task at this location
        let taskId = null;
        if (taskElement) {
            taskId = taskElement.dataset.taskId;
        } else {
            // Check if any task overlaps with this hour
            const tasks = timelineArea.querySelectorAll('.hourly-gantt-task');
            const clickTime = clampedHour * 60; // Convert to minutes
            
            for (const task of tasks) {
                const taskStartTime = task.dataset.startTime;
                const taskEndTime = task.dataset.endTime;
                
                if (taskStartTime && taskEndTime) {
                    const startMinutes = this.timeToMinutes(taskStartTime);
                    const endMinutes = this.timeToMinutes(taskEndTime);
                    
                    if (clickTime >= startMinutes && clickTime < endMinutes) {
                        taskId = task.dataset.taskId;
                        break;
                    }
                }
            }
        }

        // Store context
        this.currentContext = {
            employeeId: parseInt(employeeId),
            workArea: workArea,
            hour: clampedHour,
            taskId: taskId ? parseInt(taskId) : null
        };

        // Show/hide delete option based on whether task exists
        const deleteItem = this.menu.querySelector('[data-action="delete-task"]');
        if (taskId) {
            deleteItem.style.display = 'block';
        } else {
            deleteItem.style.display = 'none';
        }

        // Position menu
        this.show(e.clientX, e.clientY);
    }

    timeToMinutes(timeStr) {
        // Convert HH:MM or HHMM to minutes
        if (!timeStr) return 0;
        
        let hours, minutes;
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            hours = parseInt(parts[0], 10);
            minutes = parseInt(parts[1], 10);
        } else if (timeStr.length === 4) {
            hours = parseInt(timeStr.substring(0, 2), 10);
            minutes = parseInt(timeStr.substring(2, 4), 10);
        } else {
            return 0;
        }
        
        return hours * 60 + minutes;
    }

    minutesToTime(minutes) {
        // Convert minutes to HH:MM format
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }

    show(x, y) {
        if (!this.menu) return;

        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;

        // Adjust if menu goes off screen
        const rect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
            this.menu.style.left = `${x - rect.width}px`;
        }

        if (rect.bottom > viewportHeight) {
            this.menu.style.top = `${y - rect.height}px`;
        }
    }

    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.currentContext = null;
    }

    handleAddTask() {
        if (!this.currentContext) return;

        const { employeeId, workArea, hour } = this.currentContext;
        this.hide();

        // Calculate start and end times (default 1 hour task)
        const startTime = this.minutesToTime(hour * 60);
        const endTime = this.minutesToTime((hour + 1) * 60);

        // Trigger add hourly task modal with pre-filled data
        if (typeof window.openHourlyTaskModal === 'function') {
            window.openHourlyTaskModal(employeeId, workArea, startTime, endTime);
        } else {
            // Fallback: open the add hourly task modal normally
            const addHourlyModal = document.getElementById('addHourlyTaskModal');
            if (addHourlyModal) {
                // Pre-fill employee if possible
                const employeeSelect = document.getElementById('hourlyTaskEmployee');
                if (employeeSelect) {
                    employeeSelect.value = employeeId;
                }

                // Pre-fill work area
                const workAreaSelect = document.getElementById('hourlyTaskWorkArea');
                if (workAreaSelect) {
                    workAreaSelect.value = workArea;
                }

                // Pre-fill times
                const startTimeInput = document.getElementById('hourlyTaskStartTime');
                const endTimeInput = document.getElementById('hourlyTaskEndTime');
                if (startTimeInput) {
                    startTimeInput.value = startTime;
                }
                if (endTimeInput) {
                    endTimeInput.value = endTime;
                }

                addHourlyModal.style.display = 'block';
            }
        }
    }

    async handleDeleteTask() {
        if (!this.currentContext || !this.currentContext.taskId) return;

        const taskId = this.currentContext.taskId;
        this.hide();

        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }

        // Delete from hourly Gantt chart
        try {
            await this.hourlyGantt.deleteTask(taskId);
            alert('Task deleted successfully!');
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Error deleting task. Please try again.');
        }
    }
}

// Make it globally accessible
window.HourlyGanttContextMenu = HourlyGanttContextMenu;


