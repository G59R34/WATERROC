// ============================================
// Gantt Chart - Enterprise Scheduling Dashboard
// VISUAL: Professional Reflexis/Zebra Workcloud style
// LOGIC: Load shifts from Supabase, render as bars, drag-and-drop
// ============================================

class GanttChart {
    constructor(containerId, isEditable = false) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Gantt chart container with id "${containerId}" not found!`);
            return;
        }
        console.log('GanttChart constructor: container found', this.container);
        this.isEditable = isEditable;
        this.data = this.loadData();
        this.startDate = null;
        this.endDate = null;
        this.dayWidth = 140; // Professional spacing
        this.shifts = []; // LOGIC UPGRADE: Store shifts from Supabase
        this.draggedShift = null; // LOGIC UPGRADE: Track drag state
        this.dragOffset = { x: 0, y: 0 };
        
        // Holiday detection - LOGIC UPGRADE: Auto-highlight holidays
        this.holidays = this.getHolidays();
        
        // Call init asynchronously
        this.init().catch(error => {
            console.error('Error in GanttChart init():', error);
        });
    }
    
    async init() {
        // Set date range - from today to 3 months ahead
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.startDate = new Date(today);
        
        this.endDate = new Date(today);
        this.endDate.setMonth(today.getMonth() + 3);
        
        console.log('GanttChart init() called, about to render');
        console.log('Container exists:', !!this.container);
        console.log('Data:', this.data);
        try {
            await this.render();
            console.log('GanttChart render() completed successfully');
        } catch (error) {
            console.error('Error in GanttChart render():', error);
            // Still show empty state if render fails
            if (this.container) {
                try {
                    this.renderEmptyState();
                } catch (emptyError) {
                    console.error('Error rendering empty state:', emptyError);
                    // Last resort - just show a message
                    this.container.innerHTML = '<div style="padding: 20px; text-align: center;"><p>Gantt chart failed to load. Please refresh the page.</p></div>';
                }
            }
        }
    }
    
    // LOGIC UPGRADE: Holiday detection for Christmas, New Year, etc.
    getHolidays() {
        const currentYear = new Date().getFullYear();
        const holidays = [];
        
        // Fixed holidays
        holidays.push({ month: 0, day: 1, name: "New Year's Day" }); // Jan 1
        holidays.push({ month: 6, day: 4, name: "Independence Day" }); // Jul 4
        holidays.push({ month: 11, day: 25, name: "Christmas" }); // Dec 25
        holidays.push({ month: 10, day: 24, name: "Thanksgiving" }); // Nov 24 (approximate)
        
        // Calculate dates for current year
        return holidays.map(h => {
            const date = new Date(currentYear, h.month, h.day);
            return {
                date: this.formatDate(date),
                name: h.name,
                month: h.month,
                day: h.day
            };
        });
    }
    
    isHoliday(dateStr) {
        return this.holidays.some(h => h.date === dateStr);
    }
    
    getHolidayName(dateStr) {
        const holiday = this.holidays.find(h => h.date === dateStr);
        return holiday ? holiday.name : null;
    }
    
    loadData() {
        const savedData = localStorage.getItem('ganttData');
        if (savedData) {
            return JSON.parse(savedData);
        }
        
        return {
            employees: [],
            tasks: [],
            nextEmployeeId: 1,
            nextTaskId: 1
        };
    }
    
    saveData() {
        localStorage.setItem('ganttData', JSON.stringify(this.data));
    }
    
    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    getDaysBetween(start, end) {
        const oneDay = 24 * 60 * 60 * 1000;
        return Math.round(Math.abs((end - start) / oneDay)) + 1;
    }
    
    getDayOfWeek(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[date.getDay()];
    }
    
    isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }
    
    isToday(date) {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }
    
    setDateRange(start, end) {
        this.startDate = new Date(start);
        this.endDate = new Date(end);
        this.render();
    }
    
    // LOGIC UPGRADE: Load shifts from Supabase
    async loadShiftsFromSupabase() {
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            return [];
        }
        
        try {
            const startDateStr = this.formatDate(this.startDate);
            const endDateStr = this.formatDate(this.endDate);
            const shifts = await supabaseService.getEmployeeShifts(startDateStr, endDateStr);
            return shifts || [];
        } catch (error) {
            console.error('Error loading shifts:', error);
            return [];
        }
    }
    
    async render() {
        if (!this.container) {
            console.error('Gantt chart container is null, cannot render');
            return;
        }
        
        console.log('Rendering Gantt chart...', 'Employees:', this.data?.employees?.length || 0);
        
        // Ensure data exists
        if (!this.data) {
            console.warn('Gantt data is null, initializing default data');
            this.data = {
                employees: [],
                tasks: [],
                nextEmployeeId: 1,
                nextTaskId: 1
            };
        }
        
        // LOGIC UPGRADE: Load shifts from Supabase
        try {
            this.shifts = await this.loadShiftsFromSupabase();
        } catch (error) {
            console.error('Error loading shifts:', error);
            this.shifts = [];
        }
        
        if (!this.data.employees || this.data.employees.length === 0) {
            console.log('No employees, rendering empty state');
            this.renderEmptyState();
            return;
        }
        
        this.container.innerHTML = '';
        
        // VISUAL: Clean header
        const header = this.createHeader();
        this.container.appendChild(header);
        
        // VISUAL: Professional body with shift bars
        const body = await this.createBody();
        this.container.appendChild(body);
        
        // Smooth scrolling sync
        const timelineHeader = header.querySelector('.gantt-timeline-header');
        if (timelineHeader) {
            let isScrolling = false;
            body.addEventListener('scroll', () => {
                if (!isScrolling) {
                    isScrolling = true;
                    requestAnimationFrame(() => {
                        timelineHeader.scrollLeft = body.scrollLeft;
                        isScrolling = false;
                    });
                }
            }, { passive: true });
        }
        
        // LOGIC UPGRADE: Initialize drag-and-drop if editable
        if (this.isEditable) {
            this.initDragAndDrop();
        }
        
        console.log('Gantt chart rendered successfully');
    }
    
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="gantt-empty-state">
                <h3>No Employees Added</h3>
                <p>Add employees to start scheduling shifts</p>
            </div>
        `;
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.className = 'gantt-header';
        
        // Employee column header
        const employeeHeader = document.createElement('div');
        employeeHeader.className = 'gantt-employee-header';
        employeeHeader.textContent = 'Employee';
        header.appendChild(employeeHeader);
        
        // Timeline header
        const timelineHeader = document.createElement('div');
        timelineHeader.className = 'gantt-timeline-header';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayHeader = document.createElement('div');
            dayHeader.className = 'gantt-day-header';
            dayHeader.dataset.date = dateStr;
            dayHeader.style.cursor = 'pointer';
            dayHeader.title = 'Click to view hourly schedule';
            
            if (this.isWeekend(currentDate)) {
                dayHeader.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayHeader.classList.add('today');
            }
            
            // VISUAL: Holiday banner - elegant highlight
            if (this.isHoliday(dateStr)) {
                dayHeader.classList.add('holiday');
                const holidayName = this.getHolidayName(dateStr);
                dayHeader.setAttribute('data-holiday', holidayName);
            }
            
            // OVERHAUL: Clean header - NO "0000-2359" clutter, sharp rectangular
            dayHeader.innerHTML = `
                <span class="day-name">${this.getDayOfWeek(currentDate)}</span>
                <span class="day-date">${currentDate.getDate()}</span>
                ${this.isHoliday(dateStr) ? `<span class="day-holiday">${this.getHolidayName(dateStr)}</span>` : ''}
            `;
            
            timelineHeader.appendChild(dayHeader);
        }
        
        header.appendChild(timelineHeader);
        return header;
    }
    
    async createBody() {
        const body = document.createElement('div');
        body.className = 'gantt-body';
        
        // Create both shift and task rows for each employee
        const rowPromises = [];
        this.data.employees.forEach(employee => {
            rowPromises.push(this.createShiftRow(employee));
            rowPromises.push(this.createTaskRow(employee));
        });
        
        const rows = await Promise.all(rowPromises);
        
        rows.forEach(row => {
            if (row) body.appendChild(row);
        });
        
        return body;
    }
    
    // Create row for shifts only
    async createShiftRow(employee) {
        const row = document.createElement('div');
        row.className = 'gantt-row gantt-shift-row';
        row.dataset.employeeId = employee.id;
        row.dataset.rowType = 'shifts';
        
        // VISUAL: Employee cell as card with avatar
        const employeeCell = document.createElement('div');
        employeeCell.className = 'gantt-employee-cell';
        employeeCell.dataset.employeeId = employee.id;
        
        // VISUAL: Avatar badge with "Shifts" label
        const initials = this.getInitials(employee.name);
        employeeCell.innerHTML = `
            <div class="employee-avatar">${initials}</div>
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-role">${employee.role} - Shifts</div>
            </div>
        `;
        row.appendChild(employeeCell);
        
        // Timeline cell
        const timelineCell = document.createElement('div');
        timelineCell.className = 'gantt-timeline-cell';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            // VISUAL: Holiday highlight
            if (this.isHoliday(dateStr)) {
                dayCell.classList.add('holiday');
            }
            
            timelineCell.appendChild(dayCell);
        }
        
        // LOGIC UPGRADE: Load time off periods
        let timeOffPeriods = [];
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            const startDateStr = this.formatDate(this.startDate);
            const endDateStr = this.formatDate(this.endDate);
            timeOffPeriods = await supabaseService.getApprovedTimeOff(employee.id, startDateStr, endDateStr) || [];
        }
        
        // VISUAL: Time off periods (behind shifts)
        timeOffPeriods.forEach(timeOff => {
            const timeOffElement = this.createTimeOffElement(timeOff, employee.id);
            if (timeOffElement) {
                timelineCell.appendChild(timeOffElement);
            }
        });
        
        // LOGIC UPGRADE: Render actual shifts as bars (not text codes)
        const employeeShifts = this.shifts.filter(s => s.employee_id === employee.id);
        employeeShifts.forEach(shift => {
            const shiftBar = this.createShiftBar(shift, employee.id);
            if (shiftBar) {
                timelineCell.appendChild(shiftBar);
            }
        });
        
        row.appendChild(timelineCell);
        return row;
    }
    
    // Create row for tasks only
    async createTaskRow(employee) {
        const row = document.createElement('div');
        row.className = 'gantt-row gantt-task-row';
        row.dataset.employeeId = employee.id;
        row.dataset.rowType = 'tasks';
        
        // VISUAL: Employee cell as card with avatar
        const employeeCell = document.createElement('div');
        employeeCell.className = 'gantt-employee-cell';
        employeeCell.dataset.employeeId = employee.id;
        
        // VISUAL: Avatar badge with "Tasks" label
        const initials = this.getInitials(employee.name);
        employeeCell.innerHTML = `
            <div class="employee-avatar">${initials}</div>
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-role">${employee.role} - Tasks</div>
            </div>
        `;
        row.appendChild(employeeCell);
        
        // Timeline cell
        const timelineCell = document.createElement('div');
        timelineCell.className = 'gantt-timeline-cell';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            // VISUAL: Holiday highlight
            if (this.isHoliday(dateStr)) {
                dayCell.classList.add('holiday');
            }
            
            timelineCell.appendChild(dayCell);
        }
        
        // Tasks for this employee (from localStorage)
        const employeeTasks = this.data.tasks.filter(task => task.employeeId === employee.id);
        employeeTasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        const taskLanes = [];
        employeeTasks.forEach(task => {
            const taskElement = this.createTaskElement(task, taskLanes);
            timelineCell.appendChild(taskElement);
        });
        
        row.appendChild(timelineCell);
        return row;
    }
    
    getInitials(name) {
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }
    
    // LOGIC UPGRADE: Create shift bar from Supabase data
    createShiftBar(shift, employeeId) {
        const shiftDate = new Date(shift.shift_date);
        const dateStr = this.formatDate(shiftDate);
        
        // Calculate position
        const daysFromStart = this.getDaysBetween(this.startDate, shiftDate) - 1;
        const left = daysFromStart * this.dayWidth + 6;
        const width = this.dayWidth - 12;
        
        // Parse time (HH:MM:SS format from Supabase)
        const startTime = shift.start_time.substring(0, 5); // "HH:MM"
        const endTime = shift.end_time.substring(0, 5);
        
        // OVERHAUL: Sharp rectangular shift bar - enterprise Reflexis style
        const shiftBar = document.createElement('div');
        shiftBar.className = 'gantt-shift-bar';
        shiftBar.dataset.shiftId = shift.id;
        shiftBar.dataset.employeeId = employeeId;
        shiftBar.dataset.date = dateStr;
        
        // Status-based color
        const statusClass = shift.status || 'scheduled';
        shiftBar.classList.add(`shift-status-${statusClass}`);
        
        // Template color if available
        if (shift.shift_templates?.color) {
            shiftBar.style.backgroundColor = shift.shift_templates.color;
        }
        
        // OVERHAUL: Clean shift display - time range only, no clutter
        shiftBar.innerHTML = `
            <span class="shift-time">${startTime} - ${endTime}</span>
            ${shift.shift_templates?.name ? `<span class="shift-template">${shift.shift_templates.name}</span>` : ''}
        `;
        
        // OVERHAUL: Sharp rectangular styling (2px border-radius max)
        shiftBar.style.cssText += `
            position: absolute;
            left: ${left}px;
            width: ${width}px;
            height: 50px;
            top: 50%;
            transform: translateY(-50%);
            border-radius: 0px;
            padding: 4px 8px;
            color: white;
            font-weight: 600;
            font-size: 0.875rem;
            cursor: ${this.isEditable ? 'move' : 'pointer'};
            z-index: 5;
            display: flex;
            flex-direction: column;
            justify-content: center;
            border: none;
        `;
        
        // LOGIC UPGRADE: Drag-and-drop handlers
        if (this.isEditable) {
            shiftBar.classList.add('editable-shift');
            shiftBar.addEventListener('mousedown', (e) => this.startDrag(e, shiftBar, shift));
        }
        
        // Click to edit
        shiftBar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.openEditShiftModal) {
                window.openEditShiftModal(employeeId, '', shift, dateStr);
            }
        });
        
        // VISUAL: Hover tooltip
        shiftBar.title = `Shift: ${startTime} - ${endTime}\n${shift.shift_templates?.name || 'Custom Shift'}\nClick to edit`;
        
        return shiftBar;
    }
    
    // LOGIC UPGRADE: Drag-and-drop for shifts
    startDrag(e, shiftBar, shift) {
        e.preventDefault();
        e.stopPropagation();
        
        this.draggedShift = {
            element: shiftBar,
            shift: shift,
            startX: e.clientX,
            startLeft: parseInt(shiftBar.style.left)
        };
        
        shiftBar.style.opacity = '0.7';
        shiftBar.style.zIndex = '1000';
        
        document.addEventListener('mousemove', this.handleDrag = (e) => this.onDrag(e));
        document.addEventListener('mouseup', this.endDrag = () => this.stopDrag());
    }
    
    onDrag(e) {
        if (!this.draggedShift) return;
        
        const deltaX = e.clientX - this.draggedShift.startX;
        const newLeft = this.draggedShift.startLeft + deltaX;
        
        // Snap to day boundaries
        const dayIndex = Math.round(newLeft / this.dayWidth);
        const snappedLeft = dayIndex * this.dayWidth + 6;
        
        this.draggedShift.element.style.left = `${snappedLeft}px`;
    }
    
    async stopDrag() {
        if (!this.draggedShift) return;
        
        const shiftBar = this.draggedShift.element;
        const shift = this.draggedShift.shift;
        
        // Calculate new date from position
        const left = parseInt(shiftBar.style.left);
        const dayIndex = Math.round((left - 6) / this.dayWidth);
        const newDate = new Date(this.startDate);
        newDate.setDate(this.startDate.getDate() + dayIndex);
        const newDateStr = this.formatDate(newDate);
        
        // LOGIC UPGRADE: Update shift in Supabase
        if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
            try {
                await supabaseService.updateEmployeeShift(shift.id, {
                    shift_date: newDateStr
                });
                
                // Refresh shifts
                this.shifts = await this.loadShiftsFromSupabase();
                this.render();
            } catch (error) {
                console.error('Error updating shift:', error);
                // Revert position
                shiftBar.style.left = `${this.draggedShift.startLeft}px`;
            }
        }
        
        shiftBar.style.opacity = '1';
        shiftBar.style.zIndex = '5';
        
        document.removeEventListener('mousemove', this.handleDrag);
        document.removeEventListener('mouseup', this.endDrag);
        
        this.draggedShift = null;
    }
    
    initDragAndDrop() {
        // Additional drag setup if needed
    }
    
    createTimeOffElement(timeOff, employeeId) {
        const timeOffDiv = document.createElement('div');
        timeOffDiv.className = 'gantt-time-off';
        timeOffDiv.dataset.employeeId = employeeId;
        timeOffDiv.title = `Time Off: ${timeOff.reason || 'Approved time off'}`;
        
        const startDate = new Date(timeOff.start_date);
        const endDate = new Date(timeOff.end_date);
        
        const daysFromStart = this.getDaysBetween(this.startDate, startDate) - 1;
        const duration = this.getDaysBetween(startDate, endDate);
        
        const left = daysFromStart * this.dayWidth + 4;
        const width = duration * this.dayWidth - 8;
        
        timeOffDiv.style.cssText = `
            position: absolute;
            left: ${left}px;
            width: ${width}px;
            height: 60px;
            top: 50%;
            transform: translateY(-50%);
            background: repeating-linear-gradient(
                45deg,
                rgba(16, 185, 129, 0.15),
                rgba(16, 185, 129, 0.15) 10px,
                rgba(16, 185, 129, 0.25) 10px,
                rgba(16, 185, 129, 0.25) 20px
            );
            border: 2px dashed #10b981;
            border-radius: 8px;
            z-index: 1;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #059669;
            font-weight: 600;
            font-size: 0.85rem;
        `;
        
        timeOffDiv.textContent = '🏖️ Time Off';
        
        return timeOffDiv;
    }
    
    createTaskElement(task, taskLanes = []) {
        const taskDiv = document.createElement('div');
        taskDiv.className = `gantt-task status-${task.status}`;
        taskDiv.dataset.taskId = task.id;
        
        if (this.isEditable) {
            taskDiv.classList.add('editable');
        }
        
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);
        
        const daysFromStart = this.getDaysBetween(this.startDate, taskStart) - 1;
        const taskDuration = this.getDaysBetween(taskStart, taskEnd);
        
        const left = daysFromStart * this.dayWidth + 4;
        const width = taskDuration * this.dayWidth - 8;
        
        // Collision detection
        const taskHeight = 70;
        let lane = 0;
        let collision = true;
        
        while (collision) {
            collision = false;
            for (let i = 0; i < taskLanes.length; i++) {
                const existingTask = taskLanes[i];
                if (existingTask.lane === lane) {
                    const existingLeft = existingTask.left;
                    const existingRight = existingTask.left + existingTask.width;
                    const taskRight = left + width;
                    
                    if (!(taskRight < existingLeft || left > existingRight)) {
                        collision = true;
                        lane++;
                        break;
                    }
                }
            }
        }
        
        taskLanes.push({ left, width, lane });
        const topOffset = lane * taskHeight;
        
        taskDiv.style.left = `${left}px`;
        taskDiv.style.width = `${width}px`;
        taskDiv.style.top = `${topOffset + 20}px`;
        taskDiv.style.transform = 'none';
        
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        const timeDisplay = `${this.formatTime(startTime)}-${this.formatTime(endTime)}`;
        
        taskDiv.innerHTML = `
            <span class="task-name">${task.name}</span>
            <span class="task-dates">${this.formatDisplayDate(taskStart)} - ${this.formatDisplayDate(taskEnd)}</span>
            <span class="task-time">${timeDisplay}</span>
        `;
        
        taskDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onTaskClick(task);
        });
        
        return taskDiv;
    }
    
    formatDisplayDate(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}/${day}`;
    }
    
    formatTime(timeStr) {
        if (!timeStr || timeStr.length !== 4) return '00:00';
        return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
    }
    
    onTaskClick(task) {
        console.log('Task clicked:', task);
    }
    
    addEmployee(name, role) {
        const newEmployee = {
            id: this.data.nextEmployeeId++,
            name: name,
            role: role
        };
        
        this.data.employees.push(newEmployee);
        this.saveData();
        this.render();
        
        return newEmployee;
    }
    
    addTask(employeeId, name, startDate, endDate, status, startTime = '0000', endTime = '2359') {
        const newTask = {
            id: this.data.nextTaskId++,
            employeeId: parseInt(employeeId),
            name: name,
            startDate: startDate,
            endDate: endDate,
            startTime: startTime,
            endTime: endTime,
            status: status
        };
        
        this.data.tasks.push(newTask);
        this.saveData();
        this.render();
        
        return newTask;
    }
    
    updateTask(taskId, updates) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === parseInt(taskId));
        if (taskIndex !== -1) {
            this.data.tasks[taskIndex] = { ...this.data.tasks[taskIndex], ...updates };
            this.saveData();
            this.render();
            return true;
        }
        return false;
    }
    
    async deleteTask(taskId) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === parseInt(taskId));
        if (taskIndex !== -1) {
            this.data.tasks.splice(taskIndex, 1);
            this.saveData();
            await this.render();
            console.log('Task deleted from Gantt chart, ID:', taskId);
            return true;
        }
        console.warn('Task not found in Gantt chart, ID:', taskId);
        return false;
    }
    
    getEmployees() {
        return this.data.employees;
    }

    removeEmployee(employeeId) {
        this.data.employees = this.data.employees.filter(emp => emp.id !== employeeId);
        this.data.tasks = this.data.tasks.filter(task => task.employeeId !== employeeId);
        this.saveData();
        this.render();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    getTask(taskId) {
        return this.data.tasks.find(t => t.id === parseInt(taskId));
    }
}
