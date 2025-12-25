// ============================================
// Gantt Chart Context Menu
// Right-click menu for tasks, shifts, and hourly tasks
// ============================================

class GanttContextMenu {
    constructor(ganttChart) {
        this.ganttChart = ganttChart;
        this.menu = null;
        this.currentItem = null;
        this.currentItemType = null; // 'task', 'shift', 'hourlyTask'
        this.init();
    }
    
    init() {
        // Create context menu element
        this.menu = document.createElement('div');
        this.menu.id = 'gantt-context-menu';
        this.menu.className = 'gantt-context-menu';
        this.menu.style.display = 'none';
        document.body.appendChild(this.menu);
        
        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!this.menu.contains(e.target) && !e.target.closest('[data-context-menu-item]')) {
                this.hide();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }
    
    show(event, item, itemType) {
        event.preventDefault();
        event.stopPropagation();
        
        this.currentItem = item;
        this.currentItemType = itemType;
        
        // Build menu items based on type
        let menuItems = [];
        
        if (itemType === 'shift') {
            menuItems = [
                { label: '✏️ Edit Shift', action: () => this.handleEditShift() },
                { label: '➕ Add Shift', action: () => this.handleAddShift() },
                { label: '🗑️ Delete Shift', action: () => this.handleDeleteShift(), danger: true }
            ];
        } else if (itemType === 'task') {
            menuItems = [
                { label: '✏️ Edit Task', action: () => this.handleEditTask() },
                { label: '➕ Add Task', action: () => this.handleAddTask() },
                { label: '🗑️ Delete Task', action: () => this.handleDeleteTask(), danger: true }
            ];
        } else if (itemType === 'hourlyTask') {
            menuItems = [
                { label: '✏️ Edit Hourly Task', action: () => this.handleEditHourlyTask() },
                { label: '➕ Add Hourly Task', action: () => this.handleAddHourlyTask() },
                { label: '🗑️ Delete Hourly Task', action: () => this.handleDeleteHourlyTask(), danger: true }
            ];
        }
        
        // Build menu HTML
        this.menu.innerHTML = menuItems.map(item => `
            <div class="context-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.label}">
                ${item.label}
            </div>
        `).join('');
        
        // Add click handlers
        this.menu.querySelectorAll('.context-menu-item').forEach((menuItem, index) => {
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                menuItems[index].action();
                this.hide();
            });
        });
        
        // Position menu
        const x = event.clientX;
        const y = event.clientY;
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.menu.style.display = 'block';
        
        // Adjust if menu goes off screen
        const rect = this.menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }
    
    hide() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
        this.currentItem = null;
        this.currentItemType = null;
    }
    
    // Shift handlers
    handleEditShift() {
        if (!this.currentItem || !window.openEditShiftModal) return;
        
        // Support both direct shift object and element with shift/employee properties (for hourly Gantt)
        const shift = this.currentItem.shift || this.currentItem;
        const employee = this.currentItem.employee;
        const employeeId = employee?.id || this.currentItem.employee_id || this.currentItem.dataset?.employeeId;
        const employeeName = employee?.name || '';
        let shiftDate = shift.shift_date || this.currentItem.dataset?.date;
        
        // For hourly Gantt, use the selected date if available
        if (!shiftDate && this.ganttChart && this.ganttChart.selectedDate) {
            shiftDate = this.ganttChart.formatDate(this.ganttChart.selectedDate);
        }
        
        window.openEditShiftModal(employeeId, employeeName, shift, shiftDate);
    }
    
    handleAddShift() {
        // Get employee and date from the clicked element
        const employeeId = this.currentItem?.employee_id || this.currentItem?.dataset?.employeeId;
        const date = this.currentItem?.shift_date || this.currentItem?.dataset?.date || this.ganttChart.formatDate(new Date());
        
        if (window.openEditShiftModal) {
            window.openEditShiftModal(employeeId, '', null, date);
        } else if (window.openAddShiftModal) {
            window.openAddShiftModal(employeeId, date);
        }
    }
    
    async handleDeleteShift() {
        if (!this.currentItem) return;
        
        const shift = this.currentItem;
        const shiftId = shift.id || shift.dataset?.shiftId;
        
        if (!shiftId) {
            alert('Error: Could not find shift ID');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this shift?')) {
            return;
        }
        
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const result = await supabaseService.deleteEmployeeShift(shiftId);
                
                if (result) {
                    // Refresh the Gantt chart (works for both GanttChart and HourlyGanttChart)
                    if (this.ganttChart && typeof this.ganttChart.render === 'function') {
                        await this.ganttChart.render();
                    }
                    
                    // Also refresh if syncFromSupabase exists (for main Gantt)
                    if (typeof syncFromSupabase === 'function') {
                        await syncFromSupabase();
                    }
                    
                    // Refresh hourly Gantt if it exists
                    if (typeof currentHourlyGantt !== 'undefined' && currentHourlyGantt) {
                        await currentHourlyGantt.render();
                    }
                    
                    alert('✅ Shift deleted successfully!');
                } else {
                    alert('❌ Failed to delete shift');
                }
            } else {
                alert('❌ Database service not available');
            }
        } catch (error) {
            console.error('Error deleting shift:', error);
            alert('❌ Failed to delete shift: ' + error.message);
        }
    }
    
    // Task handlers
    handleEditTask() {
        if (!this.currentItem) return;
        
        const task = this.currentItem;
        const taskId = task.id || task.dataset?.taskId;
        
        // Check if there's a task edit modal function
        if (window.openEditTaskModal) {
            window.openEditTaskModal(taskId);
        } else if (window.editTask) {
            window.editTask(task);
        } else {
            // Fallback: open task modal if it exists
            const modal = document.getElementById('editTaskModal');
            if (modal) {
                // Populate and show modal
                document.getElementById('editTaskId')?.setAttribute('value', taskId);
                modal.style.display = 'block';
            } else {
                alert('Task editing not available');
            }
        }
    }
    
    handleAddTask() {
        const employeeId = this.currentItem?.employeeId || this.currentItem?.dataset?.employeeId;
        const date = this.currentItem?.startDate || this.currentItem?.dataset?.date || this.ganttChart.formatDate(new Date());
        
        if (window.openAddTaskModal) {
            window.openAddTaskModal(employeeId, date);
        } else {
            // Try to open task creation modal
            const modal = document.getElementById('addTaskModal') || document.getElementById('taskModal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                alert('Task creation not available');
            }
        }
    }
    
    async handleDeleteTask() {
        if (!this.currentItem) return;
        
        const task = this.currentItem;
        const taskId = task.id || task.dataset?.taskId;
        
        if (!taskId) {
            alert('Error: Could not find task ID');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this task?')) {
            return;
        }
        
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const result = await supabaseService.deleteTask(taskId);
                
                if (result) {
                    // Refresh the Gantt chart
                    if (this.ganttChart && typeof this.ganttChart.deleteTask === 'function') {
                        await this.ganttChart.deleteTask(taskId);
                    }
                    
                    if (this.ganttChart && typeof this.ganttChart.render === 'function') {
                        await this.ganttChart.render();
                    }
                    
                    alert('✅ Task deleted successfully!');
                } else {
                    alert('❌ Failed to delete task');
                }
            } else {
                // Fallback to local deletion
                if (this.ganttChart && typeof this.ganttChart.deleteTask === 'function') {
                    await this.ganttChart.deleteTask(taskId);
                    alert('✅ Task deleted successfully!');
                } else {
                    alert('❌ Could not delete task');
                }
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('❌ Failed to delete task: ' + error.message);
        }
    }
    
    // Hourly task handlers
    handleEditHourlyTask() {
        if (!this.currentItem || !window.editHourlyTask) return;
        
        const task = this.currentItem;
        
        // Convert to format expected by editHourlyTask
        const hourlyTask = {
            id: task.id || task.dataset?.taskId,
            name: task.name || task.dataset?.name,
            work_area: task.work_area || task.dataset?.workArea,
            start_time: task.start_time || task.dataset?.startTime,
            end_time: task.end_time || task.dataset?.endTime,
            task_date: task.task_date || task.dataset?.date,
            status: task.status || task.dataset?.status,
            employee_id: task.employee_id || task.dataset?.employeeId
        };
        
        window.editHourlyTask(hourlyTask);
    }
    
    handleAddHourlyTask() {
        const employeeId = this.currentItem?.employee_id || this.currentItem?.dataset?.employeeId;
        const date = this.currentItem?.task_date || this.currentItem?.dataset?.date || this.ganttChart.formatDate(new Date());
        
        if (window.openAddHourlyTaskModal) {
            window.openAddHourlyTaskModal(employeeId, date);
        } else {
            // Try to open hourly task creation modal
            const modal = document.getElementById('addHourlyTaskModal') || document.getElementById('hourlyTaskModal');
            if (modal) {
                modal.style.display = 'block';
            } else {
                alert('Hourly task creation not available');
            }
        }
    }
    
    async handleDeleteHourlyTask() {
        if (!this.currentItem) return;
        
        const task = this.currentItem;
        const taskId = task.id || task.dataset?.taskId;
        
        if (!taskId) {
            alert('Error: Could not find hourly task ID');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this hourly task?')) {
            return;
        }
        
        try {
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                const result = await supabaseService.deleteHourlyTask(taskId);
                
                if (result) {
                    // Refresh the Gantt chart
                    if (this.ganttChart && typeof this.ganttChart.render === 'function') {
                        await this.ganttChart.render();
                    }
                    
                    // Also refresh hourly gantt if it exists
                    if (typeof currentHourlyGantt !== 'undefined' && currentHourlyGantt) {
                        await currentHourlyGantt.render();
                    }
                    
                    alert('✅ Hourly task deleted successfully!');
                } else {
                    alert('❌ Failed to delete hourly task');
                }
            } else {
                alert('❌ Database service not available');
            }
        } catch (error) {
            console.error('Error deleting hourly task:', error);
            alert('❌ Failed to delete hourly task: ' + error.message);
        }
    }
}
