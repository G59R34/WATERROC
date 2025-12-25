// Gantt Chart Context Menu
// ===================================
// Handles right-click context menu for adding and deleting tasks

class GanttContextMenu {
    constructor(ganttChart) {
        this.gantt = ganttChart;
        this.menu = null;
        this.currentContext = null; // { employeeId, date, taskId }
        this.init();
    }

    init() {
        this.createMenu();
        this.setupEventListeners();
    }

    createMenu() {
        // Remove existing menu if it exists
        const existing = document.getElementById('ganttContextMenu');
        if (existing) {
            existing.remove();
        }

        // Create menu element
        this.menu = document.createElement('div');
        this.menu.id = 'ganttContextMenu';
        this.menu.className = 'gantt-context-menu';
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

        // Prevent default context menu on Gantt chart
        // Use event delegation since the chart re-renders
        if (this.gantt.container) {
            this.gantt.container.addEventListener('contextmenu', (e) => {
                // Only handle if clicking on a day cell or task
                const dayCell = e.target.closest('.gantt-day-cell');
                const taskElement = e.target.closest('.gantt-task');
                
                if (dayCell || taskElement) {
                    e.preventDefault();
                    this.handleContextMenu(e);
                }
            });
        }
    }

    handleContextMenu(e) {
        // Find the clicked day cell and employee row
        const dayCell = e.target.closest('.gantt-day-cell');
        const employeeRow = e.target.closest('.gantt-row');
        const taskElement = e.target.closest('.gantt-task');

        if (!dayCell || !employeeRow) {
            return;
        }

        // Get employee ID from row
        const employeeCell = employeeRow.querySelector('.gantt-employee-cell');
        if (!employeeCell) return;

        const employeeId = employeeCell.dataset.employeeId;
        if (!employeeId) return;

        // Get date from day cell
        const dateStr = dayCell.dataset.date;
        if (!dateStr) return;

        // Check if there's a task at this location
        let taskId = null;
        if (taskElement) {
            taskId = taskElement.dataset.taskId;
        } else {
            // Check if any task overlaps with this cell
            const tasks = employeeRow.querySelectorAll('.gantt-task');
            const cellRect = dayCell.getBoundingClientRect();
            const clickX = e.clientX;

            for (const task of tasks) {
                const taskRect = task.getBoundingClientRect();
                if (clickX >= taskRect.left && clickX <= taskRect.right) {
                    taskId = task.dataset.taskId;
                    break;
                }
            }
        }

        // Store context
        this.currentContext = {
            employeeId: parseInt(employeeId),
            date: dateStr,
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

        const { employeeId, date } = this.currentContext;
        this.hide();

        // Small delay to ensure DOM is ready
        setTimeout(() => {
            // Trigger add task modal with pre-filled employee and date
            if (typeof window.openAddTaskModal === 'function') {
                window.openAddTaskModal(employeeId, date);
            } else {
                // Fallback: open the add task modal normally
                const addTaskModal = document.getElementById('addTaskModal');
                if (addTaskModal) {
                    // Update employee dropdown first
                    if (typeof updateEmployeeDropdown === 'function') {
                        updateEmployeeDropdown();
                    }
                    
                    // Pre-fill employee if possible
                    const employeeSelect = document.getElementById('taskEmployee');
                    if (employeeSelect && employeeId) {
                        // Wait a bit for dropdown to populate
                        setTimeout(() => {
                            employeeSelect.value = employeeId;
                        }, 100);
                    }

                    // Pre-fill dates
                    const startDateInput = document.getElementById('taskStart');
                    const endDateInput = document.getElementById('taskEnd');
                    if (startDateInput && date) {
                        startDateInput.value = date;
                    }
                    if (endDateInput && date) {
                        endDateInput.value = date;
                    }

                    // Reset "send to all" checkbox
                    const sendToAllCheckbox = document.getElementById('taskSendToAll');
                    if (sendToAllCheckbox) {
                        sendToAllCheckbox.checked = false;
                    }
                    
                    const employeeGroup = document.getElementById('taskEmployeeGroup');
                    if (employeeGroup) {
                        employeeGroup.style.display = 'block';
                    }

                    addTaskModal.style.display = 'block';
                } else {
                    console.error('Add task modal not found');
                }
            }
        }, 50);
    }

    async handleDeleteTask() {
        if (!this.currentContext || !this.currentContext.taskId) return;

        const taskId = this.currentContext.taskId;
        this.hide();

        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }

        // Delete from Supabase if available
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                await supabaseService.deleteTask(taskId);
                
                // Refresh from database if sync function exists
                if (typeof window.syncFromSupabase === 'function') {
                    await window.syncFromSupabase();
                } else {
                    // Fallback: delete from local Gantt chart
                    this.gantt.deleteTask(taskId);
                }
            } catch (error) {
                console.error('Error deleting task:', error);
                alert('Error deleting task. Please try again.');
            }
        } else {
            // Delete from local Gantt chart
            this.gantt.deleteTask(taskId);
        }

        alert('Task deleted successfully!');
    }
}

// Make it globally accessible
window.GanttContextMenu = GanttContextMenu;

