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
        this.dayWidth = 200; // Wider boxes for better visibility
        this.shifts = []; // LOGIC UPGRADE: Store shifts from Supabase
        this.hourlyTasks = []; // Store hourly tasks from Supabase
        this.draggedShift = null; // LOGIC UPGRADE: Track drag state
        this.dragOffset = { x: 0, y: 0 };
        this.timeIndicatorInterval = null; // Time indicator update interval
        
        // Zoom/Scale levels
        this.zoomLevels = {
            week: { name: 'Week View', dayWidth: 120, showHours: false, rangeType: 'week' },
            month: { name: 'Month View', dayWidth: 200, showHours: false, rangeType: 'month' },
            day: { name: 'Day View', dayWidth: 600, showHours: true, hourWidth: 25, rangeType: 'day' },
            hour: { name: 'Hour View', dayWidth: 2400, showHours: true, hourWidth: 100, rangeType: 'day' }
        };
        this.currentZoomLevel = 'month'; // Default to month view
        this.originalStartDate = null; // Store original date range
        this.originalEndDate = null;
        
        // Holiday detection - LOGIC UPGRADE: Auto-highlight holidays
        this.holidays = this.getHolidays();
        
        // Track initialization state
        this._initialized = false;
        
        // Call init asynchronously
        this.init().then(() => {
            this._initialized = true;
            console.log('✅ GanttChart init() completed');
        }).catch(error => {
            console.error('Error in GanttChart init():', error);
            this._initialized = false;
        });
    }
    
    async init() {
        // Set date range - from 1 week ago to 3 months ahead (to include recent tasks)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Start 1 week ago to catch any recent tasks
        this.startDate = new Date(today);
        this.startDate.setDate(today.getDate() - 7);
        
        this.endDate = new Date(today);
        this.endDate.setMonth(today.getMonth() + 3);
        
        // Store original date range
        this.originalStartDate = new Date(this.startDate);
        this.originalEndDate = new Date(this.endDate);
        
        // Apply current zoom level
        this.applyZoomLevel();
        
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
    
    // LOGIC UPGRADE: Load hourly tasks from Supabase
    async loadHourlyTasksFromSupabase() {
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            return [];
        }
        
        try {
            const startDateStr = this.formatDate(this.startDate);
            const endDateStr = this.formatDate(this.endDate);
            const hourlyTasks = await supabaseService.getHourlyTasks(startDateStr, endDateStr);
            return hourlyTasks || [];
        } catch (error) {
            console.error('Error loading hourly tasks:', error);
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
        
        // LOGIC UPGRADE: Load shifts and hourly tasks from Supabase
        try {
            this.shifts = await this.loadShiftsFromSupabase();
            this.hourlyTasks = await this.loadHourlyTasksFromSupabase();
            console.log(`📅 Gantt date range: ${this.formatDate(this.startDate)} to ${this.formatDate(this.endDate)}`);
            console.log(`📊 Loaded ${this.shifts.length} shifts and ${this.hourlyTasks.length} hourly tasks from Supabase`);
            
            // Log sample hourly tasks for debugging
            if (this.hourlyTasks.length > 0) {
                console.log('📋 Sample hourly tasks:', this.hourlyTasks.slice(0, 3).map(t => ({
                    id: t.id,
                    name: t.name,
                    employee_id: t.employee_id,
                    task_date: t.task_date,
                    start_time: t.start_time,
                    end_time: t.end_time
                })));
            }
            
            // Count hourly tasks within date range
            const startDateNormalized = new Date(this.startDate);
            startDateNormalized.setHours(0, 0, 0, 0);
            const endDateNormalized = new Date(this.endDate);
            endDateNormalized.setHours(23, 59, 59, 999);
            
            const tasksInRange = this.hourlyTasks.filter(task => {
                if (!task.task_date) return false;
                const taskDate = new Date(task.task_date);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate >= startDateNormalized && taskDate <= endDateNormalized;
            });
            console.log(`✅ ${tasksInRange.length} hourly tasks are within the current date range`);
            
            if (tasksInRange.length > 0) {
                console.log('📋 Tasks in range:', tasksInRange.map(t => ({
                    id: t.id,
                    name: t.name,
                    employee_id: t.employee_id,
                    task_date: t.task_date
                })));
            }
        } catch (error) {
            console.error('Error loading shifts/tasks:', error);
            this.shifts = [];
            this.hourlyTasks = [];
        }
        
        if (!this.data.employees || this.data.employees.length === 0) {
            console.log('No employees, rendering empty state');
            this.renderEmptyState();
            return;
        }
        
        // Clean up time indicator interval before re-rendering
        if (this.timeIndicatorInterval) {
            clearInterval(this.timeIndicatorInterval);
            this.timeIndicatorInterval = null;
        }
        
        this.container.innerHTML = '';
        
        // VISUAL: Clean header
        const header = this.createHeader();
        this.container.appendChild(header);
        
        // VISUAL: Professional body with shift bars
        const body = await this.createBody();
        this.container.appendChild(body);
        
        // Add current time indicator
        this.addTimeIndicator(body);
        this.startTimeIndicator();
        
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
            // Set dynamic width based on zoom level
            dayHeader.style.minWidth = `${this.dayWidth}px`;
            dayHeader.style.width = `${this.dayWidth}px`;
            
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
        
        // Create shift, task, and hourly task rows for each employee
        const rowPromises = [];
        this.data.employees.forEach(employee => {
            rowPromises.push(this.createShiftRow(employee));
            rowPromises.push(this.createTaskRow(employee));
            rowPromises.push(this.createHourlyTaskRow(employee));
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
        timelineCell.style.position = 'relative'; // Ensure positioning context for absolute hourly tasks
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            // Set dynamic width based on zoom level
            dayCell.style.minWidth = `${this.dayWidth}px`;
            dayCell.style.width = `${this.dayWidth}px`;
            
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
        timelineCell.style.position = 'relative'; // Ensure positioning context for absolute hourly tasks
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            // Set dynamic width based on zoom level
            dayCell.style.minWidth = `${this.dayWidth}px`;
            dayCell.style.width = `${this.dayWidth}px`;
            
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
        
        // Tasks for this employee (from localStorage - daily tasks only)
        const employeeTasks = this.data.tasks.filter(task => task.employeeId === employee.id);
        employeeTasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        const taskLanes = [];
        
        // Render daily tasks only
        employeeTasks.forEach(task => {
            const taskElement = this.createTaskElement(task, taskLanes);
            timelineCell.appendChild(taskElement);
        });
        
        row.appendChild(timelineCell);
        return row;
    }
    
    // Create row for hourly tasks only
    async createHourlyTaskRow(employee) {
        const row = document.createElement('div');
        row.className = 'gantt-row gantt-hourly-task-row';
        row.dataset.employeeId = employee.id;
        row.dataset.rowType = 'hourly-tasks';
        
        // VISUAL: Employee cell as card with avatar
        const employeeCell = document.createElement('div');
        employeeCell.className = 'gantt-employee-cell';
        employeeCell.dataset.employeeId = employee.id;
        
        // VISUAL: Avatar badge with "Hourly Tasks" label
        const initials = this.getInitials(employee.name);
        employeeCell.innerHTML = `
            <div class="employee-avatar">${initials}</div>
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-role">${employee.role} - Hourly Tasks</div>
            </div>
        `;
        row.appendChild(employeeCell);
        
        // Timeline cell
        const timelineCell = document.createElement('div');
        timelineCell.className = 'gantt-timeline-cell';
        timelineCell.style.position = 'relative';
        
        const days = this.getDaysBetween(this.startDate, this.endDate);
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            // Set dynamic width based on zoom level
            dayCell.style.minWidth = `${this.dayWidth}px`;
            dayCell.style.width = `${this.dayWidth}px`;
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            if (this.isHoliday(dateStr)) {
                dayCell.classList.add('holiday');
            }
            
            timelineCell.appendChild(dayCell);
        }
        
        // Hourly tasks for this employee (from Supabase)
        console.log(`🔍 Filtering hourly tasks for employee ${employee.name} (ID: ${employee.id}, type: ${typeof employee.id})`);
        console.log(`   Total hourly tasks available: ${(this.hourlyTasks || []).length}`);
        
        const employeeHourlyTasks = (this.hourlyTasks || []).filter(task => {
            const taskEmployeeId = task.employee_id || task.employeeId;
            const employeeId = employee.id;
            
            const matches = taskEmployeeId == employeeId || 
                          parseInt(taskEmployeeId) === parseInt(employeeId) ||
                          String(taskEmployeeId) === String(employeeId);
            
            if (matches) {
                console.log(`   ✅ Match found: Task "${task.name}" (employee_id: ${taskEmployeeId}) matches employee ${employee.name} (id: ${employeeId})`);
            }
            
            return matches;
        });
        
        console.log(`📋 Employee ${employee.name} has ${employeeHourlyTasks.length} hourly task(s) to display`);
        
        if (employeeHourlyTasks.length > 0) {
            console.log(`   Tasks:`, employeeHourlyTasks.map(t => ({
                id: t.id,
                name: t.name,
                task_date: t.task_date,
                start_time: t.start_time,
                end_time: t.end_time
            })));
        }
        
        const taskLanes = [];
        
        // Render hourly tasks
        let renderedCount = 0;
        employeeHourlyTasks.forEach((hourlyTask, index) => {
            console.log(`🎯 Creating element for hourly task ${index + 1}/${employeeHourlyTasks.length}: ${hourlyTask.name}`);
            const hourlyTaskElement = this.createHourlyTaskElement(hourlyTask, taskLanes);
            if (hourlyTaskElement) {
                timelineCell.appendChild(hourlyTaskElement);
                renderedCount++;
                console.log(`   ✅ Rendered hourly task: ${hourlyTask.name} on ${hourlyTask.task_date}`);
                console.log(`   Element position:`, {
                    left: hourlyTaskElement.style.left,
                    top: hourlyTaskElement.style.top,
                    width: hourlyTaskElement.style.width
                });
            } else {
                console.warn(`   ⚠️ Hourly task element creation returned null for: ${hourlyTask.name}`);
            }
        });
        
        console.log(`📊 Total rendered: ${renderedCount}/${employeeHourlyTasks.length} hourly tasks for ${employee.name}`);
        
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
        if (!timeStr) return '00:00';
        // Handle HH:MM format
        if (timeStr.includes(':')) {
            return timeStr.substring(0, 5);
        }
        // Handle HHMM format
        if (timeStr.length === 4) {
            return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
        }
        return '00:00';
    }
    
    // Create hourly task element for preview in main Gantt
    createHourlyTaskElement(hourlyTask, taskLanes = []) {
        console.log(`   🔧 createHourlyTaskElement called for: ${hourlyTask.name}`);
        
        if (!hourlyTask.task_date) {
            console.warn(`   ⚠️ Task missing task_date:`, hourlyTask);
            return null;
        }
        
        // Normalize dates to midnight for proper comparison (use local time, not UTC)
        // Parse task_date as YYYY-MM-DD and create date in local timezone
        const taskDateParts = hourlyTask.task_date.split('-');
        const taskDate = new Date(parseInt(taskDateParts[0]), parseInt(taskDateParts[1]) - 1, parseInt(taskDateParts[2]));
        taskDate.setHours(0, 0, 0, 0);
        
        const startDateNormalized = new Date(this.startDate);
        startDateNormalized.setHours(0, 0, 0, 0);
        
        const endDateNormalized = new Date(this.endDate);
        endDateNormalized.setHours(23, 59, 59, 999); // Include the entire end date
        
        const dateStr = this.formatDate(taskDate);
        
        console.log(`   📅 Task date: ${dateStr}, Range: ${this.formatDate(this.startDate)} to ${this.formatDate(this.endDate)}`);
        console.log(`   📅 Raw task_date string: "${hourlyTask.task_date}"`);
        console.log(`   📅 Normalized dates - task: ${taskDate.toLocaleDateString()}, start: ${startDateNormalized.toLocaleDateString()}, end: ${endDateNormalized.toLocaleDateString()}`);
        
        // Check if task is within date range (inclusive)
        // Compare dates by their time value (milliseconds since epoch)
        const taskTime = taskDate.getTime();
        const startDateMs = startDateNormalized.getTime();
        const endDateMs = endDateNormalized.getTime();
        
        console.log(`   📅 Time comparison: task=${taskTime}, start=${startDateMs}, end=${endDateMs}, inRange=${taskTime >= startDateMs && taskTime <= endDateMs}`);
        
        if (taskTime < startDateMs || taskTime > endDateMs) {
            console.warn(`   ⚠️ Task date ${dateStr} (${taskTime}) is outside date range ${this.formatDate(this.startDate)} (${startDateMs}) to ${this.formatDate(this.endDate)} (${endDateMs})`);
            return null;
        }
        
        console.log(`   ✅ Task date is within range, proceeding to create element...`);
        
        const daysFromStart = this.getDaysBetween(this.startDate, taskDate) - 1;
        const left = daysFromStart * this.dayWidth + 4;
        const width = this.dayWidth - 8;
        
        console.log(`Days from start: ${daysFromStart}, left: ${left}, width: ${width}`);
        
        // Parse start and end times
        const startTime = this.formatTime(hourlyTask.start_time);
        const endTime = this.formatTime(hourlyTask.end_time);
        
        // Calculate position within day based on time
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        const dayStartMinutes = 0; // Start of day (00:00)
        const dayEndMinutes = 24 * 60; // End of day (24:00)
        
        // Calculate width based on time duration (as percentage of day)
        const timeWidth = ((endMinutes - startMinutes) / dayEndMinutes) * width;
        const timeLeft = (startMinutes / dayEndMinutes) * width;
        
        // Collision detection for hourly tasks
        const taskHeight = 25;
        let lane = 0;
        let collision = true;
        
        while (collision) {
            collision = false;
            for (let i = 0; i < taskLanes.length; i++) {
                const existingTask = taskLanes[i];
                if (existingTask.lane === lane && existingTask.date === dateStr) {
                    const existingLeft = existingTask.left;
                    const existingRight = existingTask.left + existingTask.width;
                    const taskRight = left + timeLeft + timeWidth;
                    
                    if (!(taskRight < existingLeft || (left + timeLeft) > existingRight)) {
                        collision = true;
                        lane++;
                        break;
                    }
                }
            }
        }
        
        taskLanes.push({ left: left + timeLeft, width: timeWidth, lane, date: dateStr });
        const topOffset = lane * (taskHeight + 2); // Add 2px spacing between lanes
        
        const taskDiv = document.createElement('div');
        taskDiv.className = `gantt-hourly-task status-${hourlyTask.status || 'pending'} work-area-${hourlyTask.work_area || 'other'}`;
        taskDiv.dataset.taskId = hourlyTask.id;
        taskDiv.dataset.taskType = 'hourly';
        taskDiv.dataset.date = dateStr;
        
        // Visual styling for hourly tasks (different from daily tasks)
        const workAreaColors = {
            'administrative': '#3b82f6',
            'music-prod': '#8b5cf6',
            'video-creation': '#ec4899',
            'other': '#10b981',
            'note-other': '#64748b'
        };
        
        const taskColor = workAreaColors[hourlyTask.work_area] || '#64748b';
        
        // Calculate top position: start from top of row, add offset for lane stacking
        // In the new hourly task row, tasks start from the top
        const baseTop = 10; // Small margin from top
        const finalTop = baseTop + topOffset;
        
        taskDiv.style.cssText = `
            position: absolute;
            left: ${left + timeLeft}px;
            width: ${Math.max(timeWidth, 40)}px;
            height: ${taskHeight}px;
            top: ${finalTop}px;
            background: ${taskColor} !important;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 4px;
            padding: 2px 4px;
            color: white;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            z-index: 5;
            display: flex;
            align-items: center;
            overflow: hidden;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        `;
        
        // Truncate task name if too long
        const taskName = hourlyTask.name.length > 15 
            ? hourlyTask.name.substring(0, 12) + '...' 
            : hourlyTask.name;
        
        taskDiv.innerHTML = `
            <span class="hourly-task-name" title="${hourlyTask.name}">${taskName}</span>
            <span class="hourly-task-time" style="margin-left: 4px; font-size: 0.7rem; opacity: 0.9;">${startTime}</span>
        `;
        
        // Click to open hourly Gantt for that day
        taskDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.openHourlyGantt) {
                window.openHourlyGantt(dateStr);
            } else {
                console.log('Hourly task clicked:', hourlyTask);
            }
        });
        
        // Tooltip with full details
        taskDiv.title = `${hourlyTask.name}\n${startTime} - ${endTime}\n${hourlyTask.work_area || 'other'}\nClick to view hourly schedule`;
        
        console.log(`   ✅ Hourly task element created successfully:`, {
            name: hourlyTask.name,
            date: dateStr,
            position: { left: `${left + timeLeft}px`, top: `${finalTop}px`, width: `${Math.max(timeWidth, 40)}px` },
            lane: lane
        });
        
        return taskDiv;
    }
    
    // Convert time string to minutes from midnight
    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        
        let hours = 0;
        let minutes = 0;
        
        if (timeStr.includes(':')) {
            // HH:MM format
            const parts = timeStr.split(':');
            hours = parseInt(parts[0]) || 0;
            minutes = parseInt(parts[1]) || 0;
        } else if (timeStr.length === 4) {
            // HHMM format
            hours = parseInt(timeStr.substring(0, 2)) || 0;
            minutes = parseInt(timeStr.substring(2, 4)) || 0;
        }
        
        return hours * 60 + minutes;
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
    
    // Add current time indicator element to the body
    addTimeIndicator(body) {
        // Remove existing time indicator if any
        const existing = body.querySelector('.gantt-current-time');
        if (existing) existing.remove();
        
        // Create time indicator element
        const timeIndicator = document.createElement('div');
        timeIndicator.className = 'gantt-current-time';
        timeIndicator.style.position = 'absolute';
        timeIndicator.style.top = '0';
        timeIndicator.style.bottom = '0';
        timeIndicator.style.width = '2px';
        timeIndicator.style.background = '#ef4444';
        timeIndicator.style.zIndex = '100';
        timeIndicator.style.pointerEvents = 'none';
        timeIndicator.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.6)';
        timeIndicator.style.transition = 'left 0.3s ease';
        
        // Add pulsing dot at top
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.top = '0';
        dot.style.left = '-4px';
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.background = '#ef4444';
        dot.style.border = '2px solid white';
        dot.style.borderRadius = '0px';
        dot.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.8)';
        dot.style.animation = 'pulse-cursor 2s ease-in-out infinite';
        timeIndicator.appendChild(dot);
        
        body.appendChild(timeIndicator);
    }
    
    // Start time indicator updates
    startTimeIndicator() {
        // Clear existing interval
        if (this.timeIndicatorInterval) {
            clearInterval(this.timeIndicatorInterval);
        }
        
        // Update immediately and then every second
        this.updateTimeIndicator();
        this.timeIndicatorInterval = setInterval(() => {
            this.updateTimeIndicator();
        }, 1000);
    }
    
    // Update time indicator position
    updateTimeIndicator() {
        const now = new Date();
        const todayStr = this.formatDate(now);
        
        // Find today's column
        const days = this.getDaysBetween(this.startDate, this.endDate);
        let todayColumnIndex = -1;
        
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(this.startDate);
            currentDate.setDate(this.startDate.getDate() + i);
            const dateStr = this.formatDate(currentDate);
            
            if (dateStr === todayStr) {
                todayColumnIndex = i;
                break;
            }
        }
        
        // Only show indicator if today is in the visible range
        if (todayColumnIndex === -1) {
            const indicator = this.container.querySelector('.gantt-current-time');
            if (indicator) {
                indicator.style.display = 'none';
            }
            return;
        }
        
        // Calculate position within today's column based on current time
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // Position as percentage of day (0-1)
        const timePercent = (hours * 3600 + minutes * 60 + seconds) / (24 * 3600);
        
        // Calculate left position: employee column width (200px) + (today column index * dayWidth) + (time percent * dayWidth)
        const employeeColumnWidth = 200;
        const left = employeeColumnWidth + (todayColumnIndex * this.dayWidth) + (timePercent * this.dayWidth);
        
        // Update indicator position
        const indicator = this.container.querySelector('.gantt-current-time');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.style.left = `${left}px`;
        }
    }
    
    // Apply zoom level settings
    applyZoomLevel() {
        const level = this.zoomLevels[this.currentZoomLevel];
        if (level) {
            this.dayWidth = level.dayWidth;
            
            // Adjust date range based on zoom level
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (level.rangeType === 'day') {
                // Day/Hour view: show only today
                this.startDate = new Date(today);
                this.endDate = new Date(today);
            } else if (level.rangeType === 'week') {
                // Week view: show Sunday to Saturday (week containing today)
                const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
                const daysFromSunday = dayOfWeek; // How many days since Sunday
                
                this.startDate = new Date(today);
                this.startDate.setDate(today.getDate() - daysFromSunday); // Go back to Sunday
                
                this.endDate = new Date(this.startDate);
                this.endDate.setDate(this.startDate.getDate() + 6); // Add 6 days to get Saturday (7 days total)
            } else if (level.rangeType === 'month') {
                // Month view: show 1st to last day of current month
                const year = today.getFullYear();
                const month = today.getMonth();
                
                this.startDate = new Date(year, month, 1); // First day of month
                
                // Last day of month
                this.endDate = new Date(year, month + 1, 0); // Day 0 of next month = last day of current month
            } else {
                // Fallback: use original range
                if (this.originalStartDate && this.originalEndDate) {
                    this.startDate = new Date(this.originalStartDate);
                    this.endDate = new Date(this.originalEndDate);
                }
            }
            
            console.log(`🔍 Zoom level set to: ${level.name} (dayWidth: ${this.dayWidth}px, range: ${this.formatDate(this.startDate)} to ${this.formatDate(this.endDate)})`);
        }
    }
    
    // Set zoom level and re-render
    setZoomLevel(level) {
        if (this.zoomLevels[level]) {
            this.currentZoomLevel = level;
            this.applyZoomLevel();
            // Re-render the chart with new zoom level
            this.render().catch(error => {
                console.error('Error re-rendering after zoom change:', error);
            });
        } else {
            console.warn(`Invalid zoom level: ${level}`);
        }
    }
    
    // Zoom in (to more detailed view)
    zoomIn() {
        const levels = ['week', 'month', 'day', 'hour'];
        const currentIndex = levels.indexOf(this.currentZoomLevel);
        if (currentIndex < levels.length - 1) {
            this.setZoomLevel(levels[currentIndex + 1]);
        }
    }
    
    // Zoom out (to less detailed view)
    zoomOut() {
        const levels = ['week', 'month', 'day', 'hour'];
        const currentIndex = levels.indexOf(this.currentZoomLevel);
        if (currentIndex > 0) {
            this.setZoomLevel(levels[currentIndex - 1]);
        }
    }
    
    // Reset zoom to default
    resetZoom() {
        this.setZoomLevel('month');
    }
    
    // Get current zoom level name
    getZoomLevelName() {
        return this.zoomLevels[this.currentZoomLevel]?.name || 'Month View';
    }
}
