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
        
        // Multi-select state
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionBox = null;
        this.selectedItems = new Set(); // Track selected items by their element
        this.selectionMode = false; // Toggle selection mode
        
        // Multi-select state
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionBox = null;
        this.selectedItems = new Set(); // Track selected items by their element
        this.selectionMode = false; // Toggle selection mode
        
        // Zoom/Scale levels
        this.zoomLevels = {
            week: { name: 'Week View', dayWidth: 120, showHours: false, rangeType: 'week' },
            month: { name: 'Month View', dayWidth: 200, showHours: false, rangeType: 'month', calendarStyle: true },
            day: { name: 'Day View', dayWidth: 2400, showHours: true, hourWidth: 100, rangeType: 'day' },
            hour: { name: 'Hour View', dayWidth: 200, showHours: true, hourWidth: 200, rangeType: 'hour' }
        };
        this.currentZoomLevel = 'month'; // Default to month view
        this.originalStartDate = null; // Store original date range
        this.originalEndDate = null;
        
        // Holiday detection - LOGIC UPGRADE: Auto-highlight holidays
        this.holidays = this.getHolidays();
        
        // Track initialization state
        this._initialized = false;
        
        // Initialize context menu
        this.contextMenu = null;
        
        // Call init asynchronously
        this.init().then(() => {
            this._initialized = true;
            console.log('✅ GanttChart init() completed');
            
            // Initialize context menu after chart is ready
            if (typeof GanttContextMenu !== 'undefined') {
                this.contextMenu = new GanttContextMenu(this);
            }
        }).catch(error => {
            console.error('Error in GanttChart init():', error);
            this._initialized = false;
        });
    }

    // Mobile/touch heuristics (used to tune column widths + UX)
    isMobileViewport() {
        try {
            if (!window.matchMedia) return window.innerWidth <= 768;
            return window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches;
        } catch (_) {
            return window.innerWidth <= 768;
        }
    }

    isVerySmallViewport() {
        try {
            if (!window.matchMedia) return window.innerWidth <= 480;
            return window.matchMedia('(max-width: 480px)').matches;
        } catch (_) {
            return window.innerWidth <= 480;
        }
    }

    // Used by the current-time indicator; must match responsive CSS, not a hardcoded 200px.
    getEmployeeColumnWidth() {
        if (!this.container) return 200;
        const headerCell = this.container.querySelector('.gantt-employee-header');
        const rowCell = this.container.querySelector('.gantt-employee-cell');
        return headerCell?.offsetWidth || rowCell?.offsetWidth || 200;
    }

    // Mobile-friendly alternative to right-click: long-press on an item.
    // Safe to call repeatedly; it binds per-element.
    attachLongPressContextMenu(element, item, itemType) {
        if (!element) return;
        if (!this.contextMenu) return;
        if (!this.isMobileViewport()) return;

        // Avoid double-binding if element persists across renders.
        if (element.__ganttLongPressBound) return;
        element.__ganttLongPressBound = true;

        const HOLD_MS = 520;
        const MOVE_PX = 10;
        let timer = null;
        let startX = 0;
        let startY = 0;
        let firedAt = 0;

        const clear = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };

        const schedule = (x, y) => {
            clear();
            startX = x;
            startY = y;
            timer = setTimeout(() => {
                firedAt = Date.now();
                const fakeEvent = {
                    preventDefault() {},
                    stopPropagation() {},
                    clientX: x,
                    clientY: y
                };
                this.contextMenu.show(fakeEvent, item, itemType);
            }, HOLD_MS);
        };

        element.addEventListener('touchstart', (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            const t = e.touches[0];
            schedule(t.clientX, t.clientY);
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (!timer) return;
            const t = e.touches?.[0];
            if (!t) return;
            if (Math.abs(t.clientX - startX) > MOVE_PX || Math.abs(t.clientY - startY) > MOVE_PX) {
                clear();
            }
        }, { passive: true });

        element.addEventListener('touchend', () => clear(), { passive: true });
        element.addEventListener('touchcancel', () => clear(), { passive: true });

        // If a long-press fired, suppress the subsequent synthetic click.
        element.addEventListener('click', (e) => {
            if (firedAt && Date.now() - firedAt < 900) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
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
        
        // Initialize multi-select
        // Only initialize multi-select if editable (admin only)
        if (this.isEditable) {
            this.initMultiSelect(body);
        }
        
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

        // Re-render on viewport changes (rotate / resize) so widths stay usable on mobile.
        // Debounced and only bound once.
        if (!this._resizeHandlerBound) {
            this._resizeHandlerBound = true;
            let resizeTimer = null;
            window.addEventListener('resize', () => {
                if (!this.container) return;
                // Only do the expensive re-render if we're likely on mobile/tablet.
                if (!this.isMobileViewport()) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    // Keep the same zoom level, just re-apply responsive widths.
                    this.applyZoomLevel();
                    this.render().catch(() => {});
                }, 200);
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
        
        const level = this.zoomLevels[this.currentZoomLevel];
        const isCalendarStyle = level && level.calendarStyle;
        
        if (isCalendarStyle) {
            // Calendar-style header for month view - traditional calendar layout
            header.className = 'gantt-header gantt-calendar-header';
            
            // Month and year title
            const monthTitle = document.createElement('div');
            monthTitle.className = 'gantt-calendar-month-title';
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
            const monthStart = new Date(this.startDate);
            monthStart.setDate(1);
            const monthName = monthNames[monthStart.getMonth()];
            const year = monthStart.getFullYear();
            monthTitle.textContent = `${monthName} ${year}`;
            header.appendChild(monthTitle);
            
            // Week day headers (Sun, Mon, Tue, etc.)
            const weekDaysHeader = document.createElement('div');
            weekDaysHeader.className = 'gantt-weekdays-header';
            
            const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            weekDays.forEach(dayName => {
                const dayHeader = document.createElement('div');
                dayHeader.className = 'gantt-weekday-header';
                dayHeader.textContent = dayName;
                weekDaysHeader.appendChild(dayHeader);
            });
            
            header.appendChild(weekDaysHeader);
            return header;
        } else {
            // Standard timeline header
            const level = this.zoomLevels[this.currentZoomLevel];
            const isHourView = level && level.rangeType === 'hour';
            
            // Employee column header
            const employeeHeader = document.createElement('div');
            employeeHeader.className = 'gantt-employee-header';
            employeeHeader.textContent = 'Employee';
            header.appendChild(employeeHeader);
            
            // Timeline header
            const timelineHeader = document.createElement('div');
            timelineHeader.className = 'gantt-timeline-header';
            if (isHourView) {
                timelineHeader.style.width = '100%';
                timelineHeader.style.minWidth = '0';
            }
            
            if (isHourView) {
                // Hour view: single full-width hour header
                const now = new Date();
                const currentHour = now.getHours();
                const hourLabel = `${String(currentHour).padStart(2, '0')}:00 - ${String(currentHour + 1).padStart(2, '0')}:00`;
                
                const hourHeader = document.createElement('div');
                hourHeader.className = 'gantt-hour-header';
                hourHeader.style.width = '100%';
                hourHeader.style.flex = '1';
                hourHeader.style.minWidth = '0';
                hourHeader.innerHTML = `
                    <span class="hour-label">${hourLabel}</span>
                    <span class="hour-date">${now.toLocaleDateString()}</span>
                `;
                hourHeader.classList.add('today');
                timelineHeader.appendChild(hourHeader);
            } else {
                // Day/week/month view: show days
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
            }
            
            header.appendChild(timelineHeader);
            return header;
        }
    }
    
    async createBody() {
        const body = document.createElement('div');
        body.className = 'gantt-body';
        
        const level = this.zoomLevels[this.currentZoomLevel];
        const isCalendarStyle = level && level.calendarStyle;
        
        if (isCalendarStyle) {
            // Calendar-style body for month view - traditional calendar grid
            body.className = 'gantt-body gantt-calendar-body';
            
            // Get all days once to ensure consistency
            const weekDays = this.getWeekDaysForMonth();
            console.log(`📅 Calendar view: Generating ${weekDays.length} days`);
            
            // Organize days into weeks (7 days per week)
            const weeks = [];
            for (let i = 0; i < weekDays.length; i += 7) {
                weeks.push(weekDays.slice(i, i + 7));
            }
            
            // Create calendar week rows
            weeks.forEach((week, weekIndex) => {
                const weekRow = this.createCalendarWeekRow(week, weekIndex);
                if (weekRow) {
                    body.appendChild(weekRow);
                }
            });
            
            return body;
        } else {
            // Standard timeline body
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
    }
    
    // Create calendar week row (traditional calendar layout)
    createCalendarWeekRow(weekDays, weekIndex) {
        const row = document.createElement('div');
        row.className = 'gantt-calendar-week-row';
        row.dataset.weekIndex = weekIndex;
        
        const seenDates = new Set();
        
        weekDays.forEach(currentDate => {
            const dateStr = this.formatDate(currentDate);
            
            // Skip if we've already created a cell for this date (prevent duplicates)
            if (seenDates.has(dateStr)) {
                console.warn(`⚠️ Duplicate date detected and skipped: ${dateStr}`);
                return;
            }
            seenDates.add(dateStr);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-calendar-day-cell';
            dayCell.dataset.date = dateStr;
            
            // Check if this date is in the current month (the month being displayed)
            const monthStart = new Date(this.startDate);
            monthStart.setDate(1);
            const isCurrentMonth = currentDate.getMonth() === monthStart.getMonth() && 
                                  currentDate.getFullYear() === monthStart.getFullYear();
            
            if (!isCurrentMonth) {
                dayCell.classList.add('other-month');
            }
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            if (this.isHoliday(dateStr)) {
                dayCell.classList.add('holiday');
            }
            
            // Day number - make it prominent
            const dayNumber = document.createElement('div');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = currentDate.getDate();
            dayCell.appendChild(dayNumber);
            
            // Get all shifts for this day (all employees)
            const dayShifts = this.shifts.filter(s => 
                this.formatDate(new Date(s.shift_date)) === dateStr
            );
            
            // Get all hourly tasks for this day (all employees)
            const dayHourlyTasks = this.hourlyTasks.filter(t => 
                t.task_date === dateStr
            );
            
            // Create a container for all events
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'calendar-events-container';
            
            // Add shifts
            dayShifts.forEach(shift => {
                const employee = this.data.employees.find(e => e.id === shift.employee_id);
                const shiftBar = this.createCalendarShiftBar(shift, employee);
                if (shiftBar) {
                    eventsContainer.appendChild(shiftBar);
                }
            });
            
            // Add hourly tasks
            dayHourlyTasks.forEach(task => {
                const employee = this.data.employees.find(e => e.id === task.employee_id);
                const taskBar = this.createCalendarTaskBar(task, employee);
                if (taskBar) {
                    eventsContainer.appendChild(taskBar);
                }
            });
            
            dayCell.appendChild(eventsContainer);
            row.appendChild(dayCell);
        });
        
        return row;
    }
    
    // Create calendar shift bar with employee name
    createCalendarShiftBar(shift, employee) {
        if (!shift || !employee) return null;
        
        const shiftDiv = document.createElement('div');
        shiftDiv.className = `gantt-calendar-shift status-${shift.status || 'scheduled'}`;
        shiftDiv.dataset.shiftId = shift.id;
        
        const startTime = shift.start_time ? shift.start_time.substring(0, 5) : '00:00';
        const endTime = shift.end_time ? shift.end_time.substring(0, 5) : '23:59';
        const shiftName = shift.shift_name || 'Shift';
        
        shiftDiv.innerHTML = `
            <div class="calendar-event-employee">${employee.name}</div>
            <div class="calendar-event-time">${startTime} - ${endTime}</div>
            <div class="calendar-event-name">${shiftName}</div>
        `;
        
        // Color based on status
        const statusColors = {
            'scheduled': '#4a90e2',
            'completed': '#6c757d',
            'cancelled': '#868e96',
            'no-show': '#495057'
        };
        shiftDiv.style.background = statusColors[shift.status] || '#4a90e2';
        shiftDiv.style.color = 'white';
        shiftDiv.style.padding = '4px 6px';
        shiftDiv.style.marginTop = '4px';
        shiftDiv.style.borderRadius = '3px';
        shiftDiv.style.fontSize = '0.7rem';
        shiftDiv.style.width = '100%';
        shiftDiv.style.boxSizing = 'border-box';
        
        return shiftDiv;
    }
    
    // Create calendar-style row for an employee (OLD - keeping for reference but not used)
    async createCalendarRow(employee, weekDays) {
        const row = document.createElement('div');
        row.className = 'gantt-calendar-row';
        row.dataset.employeeId = employee.id;
        
        // Employee cell
        const employeeCell = document.createElement('div');
        employeeCell.className = 'gantt-employee-cell gantt-calendar-employee-cell';
        const initials = this.getInitials(employee.name);
        employeeCell.innerHTML = `
            <div class="employee-avatar">${initials}</div>
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-role">${employee.role}</div>
            </div>
        `;
        row.appendChild(employeeCell);
        
        // Calendar grid cells (7 days per week)
        // Use provided weekDays array to ensure consistency
        const seenDates = new Set();
        
        for (let i = 0; i < weekDays.length; i++) {
            const currentDate = weekDays[i];
            const dateStr = this.formatDate(currentDate);
            
            // Skip if we've already created a cell for this date (prevent duplicates)
            if (seenDates.has(dateStr)) {
                console.warn(`⚠️ Duplicate date detected and skipped: ${dateStr}`);
                continue;
            }
            seenDates.add(dateStr);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-calendar-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            
            // Check if this date is in the current month (the month being displayed)
            const monthStart = new Date(this.startDate);
            monthStart.setDate(1);
            const isCurrentMonth = currentDate.getMonth() === monthStart.getMonth() && 
                                  currentDate.getFullYear() === monthStart.getFullYear();
            
            if (!isCurrentMonth) {
                dayCell.classList.add('other-month');
            }
            
            if (this.isWeekend(currentDate)) {
                dayCell.classList.add('weekend');
            }
            
            if (this.isToday(currentDate)) {
                dayCell.classList.add('today');
            }
            
            if (this.isHoliday(dateStr)) {
                dayCell.classList.add('holiday');
            }
            
            // Day number
            const dayNumber = document.createElement('div');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = currentDate.getDate();
            dayCell.appendChild(dayNumber);
            
            // Load shifts for this day
            const employeeShifts = this.shifts.filter(s => 
                s.employee_id === employee.id && 
                this.formatDate(new Date(s.shift_date)) === dateStr
            );
            
            employeeShifts.forEach(shift => {
                const shiftBar = this.createShiftBar(shift, employee.id);
                if (shiftBar) {
                    shiftBar.style.position = 'relative';
                    shiftBar.style.width = '100%';
                    shiftBar.style.left = '0';
                    shiftBar.style.marginTop = '4px';
                    dayCell.appendChild(shiftBar);
                }
            });
            
            // Load hourly tasks for this day
            const dayHourlyTasks = this.hourlyTasks.filter(t => 
                t.employee_id === employee.id && 
                t.task_date === dateStr
            );
            
            // Create simple task bars for calendar view
            dayHourlyTasks.forEach(task => {
                const taskBar = this.createCalendarTaskBar(task);
                if (taskBar) {
                    dayCell.appendChild(taskBar);
                }
            });
            
            row.appendChild(dayCell);
        }
        
        return row;
    }
    
    // Get all days for the month in calendar format (including days from previous/next month to fill weeks)
    getWeekDaysForMonth() {
        const days = [];
        const firstDay = new Date(this.startDate);
        const lastDay = new Date(this.endDate);
        
        // Ensure we're working with the first and last day of the month
        firstDay.setDate(1);
        const year = firstDay.getFullYear();
        const month = firstDay.getMonth();
        const lastDayOfMonth = new Date(year, month + 1, 0); // Last day of current month
        
        // Start from the Sunday of the week containing the 1st of the month
        const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
        const startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - firstDayOfWeek);
        
        // End at the Saturday of the week containing the last day of the month
        const lastDayOfWeek = lastDayOfMonth.getDay(); // 0 = Sunday
        const endDate = new Date(lastDayOfMonth);
        endDate.setDate(lastDayOfMonth.getDate() + (6 - lastDayOfWeek));
        
        // Generate all days, ensuring no duplicates
        const seenDates = new Set();
        const current = new Date(startDate);
        
        while (current <= endDate) {
            const dateKey = this.formatDate(current);
            if (!seenDates.has(dateKey)) {
                days.push(new Date(current));
                seenDates.add(dateKey);
            }
            current.setDate(current.getDate() + 1);
        }
        
        return days;
    }
    
    // Create simple task bar for calendar view with employee name
    createCalendarTaskBar(hourlyTask, employee) {
        if (!hourlyTask.task_date) {
            return null;
        }
        
        const taskDiv = document.createElement('div');
        taskDiv.className = `gantt-calendar-task status-${hourlyTask.status || 'pending'} work-area-${hourlyTask.work_area || 'other'}`;
        taskDiv.dataset.taskId = hourlyTask.id;
        taskDiv.dataset.taskType = 'hourly';
        
        // Visual styling for calendar tasks
        const workAreaColors = {
            'administrative': '#3b82f6',
            'music-prod': '#8b5cf6',
            'video-creation': '#ec4899',
            'other': '#10b981',
            'note-other': '#6b7280'
        };
        
        const color = workAreaColors[hourlyTask.work_area] || '#6b7280';
        taskDiv.style.background = color;
        taskDiv.style.color = 'white';
        taskDiv.style.padding = '4px 6px';
        taskDiv.style.marginTop = '4px';
        taskDiv.style.borderRadius = '3px';
        taskDiv.style.fontSize = '0.7rem';
        taskDiv.style.width = '100%';
        taskDiv.style.boxSizing = 'border-box';
        
        // Task name, employee, and time
        const startTime = this.formatTime(hourlyTask.start_time);
        const endTime = this.formatTime(hourlyTask.end_time);
        const employeeName = employee ? employee.name : 'Unknown';
        
        taskDiv.innerHTML = `
            <div class="calendar-event-employee">${employeeName}</div>
            <div class="calendar-event-time">${startTime} - ${endTime}</div>
            <div class="calendar-event-name">${hourlyTask.name}</div>
        `;
        
        return taskDiv;
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
        
        const level = this.zoomLevels[this.currentZoomLevel];
        const isHourView = level && level.rangeType === 'hour';
        
        if (isHourView) {
            timelineCell.style.width = '100%';
            timelineCell.style.minWidth = '0';
            timelineCell.style.flex = '1';
        }
        
        if (isHourView) {
            // Hour view: single full-width cell for current hour
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const dateStr = this.formatDate(today);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            dayCell.style.width = '100%';
            dayCell.style.minWidth = '0';
            dayCell.style.flex = '1';
            dayCell.style.position = 'relative'; // Important for absolute positioning of tasks
            dayCell.classList.add('today');
            timelineCell.appendChild(dayCell);
            
            // Filter shifts to current hour only - STRICT FILTERING
            const currentHour = now.getHours();
            const todayStr = this.formatDate(now);
            
            console.log(`🔍 Filtering shifts for employee ${employee.name} (ID: ${employee.id}) in hour view`);
            console.log(`   Current hour: ${currentHour}:00-${currentHour + 1}:00, Today: ${todayStr}`);
            console.log(`   Total shifts available: ${this.shifts.length}`);
            
            const employeeShifts = this.shifts.filter(s => {
                // Check employee match
                if (s.employee_id !== employee.id) {
                    return false;
                }
                
                // STRICT: Must have shift_date
                if (!s.shift_date) {
                    console.log(`   ❌ Shift rejected: No shift_date`);
                    return false;
                }
                
                // STRICT: Must be today - compare date strings directly (already in YYYY-MM-DD format)
                // Don't normalize as it causes timezone issues
                if (s.shift_date !== todayStr) {
                    console.log(`   ❌ Shift rejected: shift_date "${s.shift_date}" !== today "${todayStr}"`);
                    return false;
                }
                
                // STRICT: Must have start_time and end_time
                if (!s.start_time || !s.end_time) {
                    console.log(`   ❌ Shift rejected: Missing start_time or end_time`);
                    return false;
                }
                
                // Check if shift overlaps with current hour
                const startTime = s.start_time.substring(0, 5);
                const endTime = s.end_time.substring(0, 5);
                const startMinutes = this.timeToMinutes(startTime);
                const endMinutes = this.timeToMinutes(endTime);
                const hourStartMinutes = currentHour * 60;
                const hourEndMinutes = (currentHour + 1) * 60;
                
                const overlaps = startMinutes < hourEndMinutes && endMinutes > hourStartMinutes;
                
                if (overlaps) {
                    console.log(`   ✅ Shift accepted: ${startTime}-${endTime} overlaps hour ${currentHour}:00-${currentHour + 1}:00`);
                } else {
                    console.log(`   ❌ Shift rejected: ${startTime}-${endTime} (${startMinutes}-${endMinutes} min) does not overlap hour ${hourStartMinutes}-${hourEndMinutes} min`);
                }
                
                return overlaps;
            });
            
            console.log(`📊 Filtered to ${employeeShifts.length} shift(s) for ${employee.name} in current hour`);
            
            employeeShifts.forEach(shift => {
                const shiftBar = this.createShiftBarForHourView(shift, employee.id, currentHour);
                if (shiftBar) {
                    dayCell.appendChild(shiftBar);
                }
            });
        } else {
            // Normal view: create cells for all days
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
        }
        
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
        
        const level = this.zoomLevels[this.currentZoomLevel];
        const isHourView = level && level.rangeType === 'hour';
        
        if (isHourView) {
            timelineCell.style.width = '100%';
            timelineCell.style.minWidth = '0';
            timelineCell.style.flex = '1';
        }
        
        if (isHourView) {
            // Hour view: only create one cell for current hour
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const dateStr = this.formatDate(today);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            dayCell.style.width = '100%';
            dayCell.style.minWidth = '0';
            dayCell.style.flex = '1';
            dayCell.style.position = 'relative'; // Important for absolute positioning of tasks
            dayCell.classList.add('today');
            timelineCell.appendChild(dayCell);
            
            // Filter tasks to current hour only - STRICT FILTERING
            const currentHour = now.getHours();
            const todayStr = this.formatDate(now);
            let employeeTasks = this.data.tasks.filter(task => {
                if (task.employeeId !== employee.id) return false;
                
                // STRICT: Must have startDate
                if (!task.startDate) {
                    return false;
                }
                
            // STRICT: Must be today - compare date strings directly
            // If startDate is already in YYYY-MM-DD format, use it directly
            // Otherwise normalize it
            let taskDateStr = task.startDate;
            if (taskDateStr && !taskDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                taskDateStr = this.formatDate(new Date(task.startDate));
            }
            if (taskDateStr !== todayStr) {
                return null;
            }
                
                // Check if task overlaps with current hour
                const startTime = task.startTime || '0000';
                const endTime = task.endTime || '2359';
                const startMinutes = this.timeToMinutes(this.formatTime(startTime));
                const endMinutes = this.timeToMinutes(this.formatTime(endTime));
                const hourStartMinutes = currentHour * 60;
                const hourEndMinutes = (currentHour + 1) * 60;
                
                return startMinutes < hourEndMinutes && endMinutes > hourStartMinutes;
            });
            
            employeeTasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
            
            const taskLanes = [];
            employeeTasks.forEach(task => {
                const taskElement = this.createTaskElementForHourView(task, taskLanes, currentHour);
                if (taskElement) {
                    dayCell.appendChild(taskElement);
                }
            });
        } else {
            // Normal view: create cells for all days
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
        }
        
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
        
        const level = this.zoomLevels[this.currentZoomLevel];
        const isHourView = level && level.rangeType === 'hour';
        
        if (isHourView) {
            timelineCell.style.width = '100%';
            timelineCell.style.minWidth = '0';
            timelineCell.style.flex = '1';
        }
        
        if (isHourView) {
            // Hour view: single full-width cell for current hour
            const now = new Date();
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            const dateStr = this.formatDate(today);
            
            const dayCell = document.createElement('div');
            dayCell.className = 'gantt-day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.dataset.employeeId = employee.id;
            dayCell.style.width = '100%';
            dayCell.style.minWidth = '0';
            dayCell.style.flex = '1';
            dayCell.style.position = 'relative'; // Important for absolute positioning of tasks
            dayCell.classList.add('today');
            timelineCell.appendChild(dayCell);
        } else {
            // Normal view: create cells for all days
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
        }
        
        // Hourly tasks for this employee (from Supabase)
        console.log(`🔍 Filtering hourly tasks for employee ${employee.name} (ID: ${employee.id}, type: ${typeof employee.id})`);
        console.log(`   Total hourly tasks available: ${(this.hourlyTasks || []).length}`);
        
        // Reuse level and isHourView from above (already declared at line 1108)
        let employeeHourlyTasks = (this.hourlyTasks || []).filter(task => {
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
        
        // Filter to current hour if in hour view - STRICT FILTERING
        if (isHourView) {
            const now = new Date();
            const currentHour = now.getHours();
            const todayStr = this.formatDate(now);
            
            console.log(`⏰ Hour view filtering: Looking for tasks on ${todayStr} in hour ${currentHour}:00-${currentHour + 1}:00`);
            
            employeeHourlyTasks = employeeHourlyTasks.filter(task => {
                // STRICT: Must have task_date
                if (!task.task_date) {
                    console.log(`   ❌ Task "${task.name}" rejected: No task_date`);
                    return false;
                }
                
                // STRICT: Must be today - compare date strings directly (already in YYYY-MM-DD format)
                // Don't normalize as it causes timezone issues - compare strings directly
                if (task.task_date !== todayStr) {
                    console.log(`   ❌ Task "${task.name}" rejected: task_date "${task.task_date}" !== today "${todayStr}"`);
                    return false;
                }
                
                // STRICT: Must have start_time and end_time
                if (!task.start_time || !task.end_time) {
                    console.log(`   ❌ Task "${task.name}" rejected: Missing start_time or end_time`);
                    return false;
                }
                
                // Check if task overlaps with current hour
                const startTime = this.formatTime(task.start_time);
                const endTime = this.formatTime(task.end_time);
                const startMinutes = this.timeToMinutes(startTime);
                const endMinutes = this.timeToMinutes(endTime);
                
                const hourStartMinutes = currentHour * 60;
                const hourEndMinutes = (currentHour + 1) * 60;
                
                // Task overlaps if it starts before hour ends and ends after hour starts
                const overlaps = startMinutes < hourEndMinutes && endMinutes > hourStartMinutes;
                
                if (!overlaps) {
                    console.log(`   ❌ Task "${task.name}" rejected: Time ${startTime}-${endTime} (${startMinutes}-${endMinutes} min) does not overlap hour ${hourStartMinutes}-${hourEndMinutes} min`);
                } else {
                    console.log(`   ✅ Task "${task.name}" accepted: Time ${startTime}-${endTime} overlaps hour ${currentHour}:00-${currentHour + 1}:00`);
                }
                
                return overlaps;
            });
            
            console.log(`⏰ Hour view: Filtered to ${employeeHourlyTasks.length} task(s) in current hour (${currentHour}:00-${currentHour + 1}:00)`);
        }
        
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
        // level and isHourView are already declared above at line 1098-1099
        
        employeeHourlyTasks.forEach((hourlyTask, index) => {
            console.log(`🎯 Creating element for hourly task ${index + 1}/${employeeHourlyTasks.length}: ${hourlyTask.name}`);
            const hourlyTaskElement = this.createHourlyTaskElement(hourlyTask, taskLanes);
            if (hourlyTaskElement) {
                // In hour view, append to dayCell; otherwise append to timelineCell
                if (isHourView) {
                    // Find the day cell for today
                    const now = new Date();
                    const today = new Date(now);
                    today.setHours(0, 0, 0, 0);
                    const dateStr = this.formatDate(today);
                    const dayCell = timelineCell.querySelector(`.gantt-day-cell[data-date="${dateStr}"]`);
                    if (dayCell) {
                        dayCell.appendChild(hourlyTaskElement);
                    } else {
                        timelineCell.appendChild(hourlyTaskElement);
                    }
                } else {
                    timelineCell.appendChild(hourlyTaskElement);
                }
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
        
        // Click to edit (but allow multi-select with Ctrl/Cmd)
        shiftBar.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // If Ctrl/Cmd is held, toggle selection instead of opening edit modal
            if (e.ctrlKey || e.metaKey) {
                if (this.selectedItems.has(shiftBar)) {
                    this.selectedItems.delete(shiftBar);
                    shiftBar.classList.remove('gantt-selected');
                } else {
                    this.selectedItems.add(shiftBar);
                    shiftBar.classList.add('gantt-selected');
                }
                return;
            }
            
            // If item is selected, don't open edit modal (user might want to delete multiple)
            if (this.selectedItems.has(shiftBar) && this.selectedItems.size > 1) {
                return;
            }
            
            // Clear selection if clicking on a single item
            if (!this.selectedItems.has(shiftBar)) {
                this.clearSelection();
            }
            
            if (window.openEditShiftModal) {
                window.openEditShiftModal(employeeId, '', shift, dateStr);
            }
        });
        
        // Right-click context menu
        shiftBar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.contextMenu) {
                this.contextMenu.show(e, shift, 'shift');
            }
        });

        // Mobile: long-press opens the same context menu (edit/add/delete)
        this.attachLongPressContextMenu(shiftBar, shift, 'shift');
        
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
    
    // Create shift bar for hour view - scaled to 60 minutes
    createShiftBarForHourView(shift, employeeId, currentHour) {
        const now = new Date();
        const todayStr = this.formatDate(now);
        
        // STRICT: Must have shift_date
        if (!shift.shift_date) {
            return null;
        }
        
        // STRICT: Must be today - compare date strings directly (already in YYYY-MM-DD format)
        // Don't normalize as it causes timezone issues
        if (shift.shift_date !== todayStr) {
            return null;
        }
        
        // Parse shift times
        const startTime = shift.start_time ? shift.start_time.substring(0, 5) : '00:00';
        const endTime = shift.end_time ? shift.end_time.substring(0, 5) : '23:59';
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        
        // Calculate position within the hour (0-60 minutes)
        const hourStartMinutes = currentHour * 60;
        const hourEndMinutes = (currentHour + 1) * 60;
        
        // Clamp to hour boundaries
        const shiftStartInHour = Math.max(0, startMinutes - hourStartMinutes);
        const shiftEndInHour = Math.min(60, endMinutes - hourStartMinutes);
        const shiftDurationInHour = shiftEndInHour - shiftStartInHour;
        
        if (shiftDurationInHour <= 0) {
            return null;
        }
        
        // Position and width as percentage of hour column (60 minutes) - use percentage for full-width cell
        const timeLeftPercent = (shiftStartInHour / 60) * 100;
        const timeWidthPercent = (shiftDurationInHour / 60) * 100;
        
        const shiftBar = document.createElement('div');
        shiftBar.className = 'gantt-shift-bar';
        shiftBar.dataset.shiftId = shift.id;
        shiftBar.dataset.employeeId = employeeId;
        
        const statusClass = shift.status || 'scheduled';
        shiftBar.classList.add(`shift-status-${statusClass}`);
        
        shiftBar.innerHTML = `
            <span class="shift-time">${startTime} - ${endTime}</span>
            ${shift.shift_templates?.name ? `<span class="shift-template">${shift.shift_templates.name}</span>` : ''}
        `;
        
        shiftBar.style.cssText = `
            position: absolute;
            left: ${timeLeftPercent}%;
            width: ${Math.max(timeWidthPercent, 2)}%;
            height: 40px;
            top: 50%;
            transform: translateY(-50%);
            border-radius: 0px;
            padding: 4px 8px;
            color: white;
            font-weight: 600;
            font-size: 0.75rem;
            cursor: pointer;
            z-index: 5;
        `;
        
        return shiftBar;
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
            
            // If Ctrl/Cmd is held, toggle selection instead of opening task
            if (e.ctrlKey || e.metaKey) {
                if (this.selectedItems.has(taskDiv)) {
                    this.selectedItems.delete(taskDiv);
                    taskDiv.classList.remove('gantt-selected');
                } else {
                    this.selectedItems.add(taskDiv);
                    taskDiv.classList.add('gantt-selected');
                }
                return;
            }
            
            // If item is selected, don't open task (user might want to delete multiple)
            if (this.selectedItems.has(taskDiv) && this.selectedItems.size > 1) {
                return;
            }
            
            // Clear selection if clicking on a single item
            if (!this.selectedItems.has(taskDiv)) {
                this.clearSelection();
            }
            
            this.onTaskClick(task);
        });
        
        // Right-click context menu
        taskDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.contextMenu) {
                this.contextMenu.show(e, task, 'task');
            }
        });

        // Mobile: long-press context menu
        this.attachLongPressContextMenu(taskDiv, task, 'task');
        
        return taskDiv;
    }
    
    // Create task element for hour view - scaled to 60 minutes
    createTaskElementForHourView(task, taskLanes = [], currentHour) {
        const now = new Date();
        const todayStr = this.formatDate(now);
        
        // STRICT: Must have startDate
        if (!task.startDate) {
            return null;
        }
        
        // STRICT: Must be today - compare date strings directly
        // If startDate is already in YYYY-MM-DD format, use it directly
        // Otherwise normalize it
        let taskDateStr = task.startDate;
        if (taskDateStr && !taskDateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            taskDateStr = this.formatDate(new Date(task.startDate));
        }
        if (taskDateStr !== todayStr) {
            return null;
        }
        
        // Parse task times
        const startTime = task.startTime || '0000';
        const endTime = task.endTime || '2359';
        const startTimeFormatted = this.formatTime(startTime);
        const endTimeFormatted = this.formatTime(endTime);
        const startMinutes = this.timeToMinutes(startTimeFormatted);
        const endMinutes = this.timeToMinutes(endTimeFormatted);
        
        // Calculate position within the hour (0-60 minutes)
        const hourStartMinutes = currentHour * 60;
        const hourEndMinutes = (currentHour + 1) * 60;
        
        // Clamp to hour boundaries
        const taskStartInHour = Math.max(0, startMinutes - hourStartMinutes);
        const taskEndInHour = Math.min(60, endMinutes - hourStartMinutes);
        const taskDurationInHour = taskEndInHour - taskStartInHour;
        
        if (taskDurationInHour <= 0) {
            return null;
        }
        
        // Position and width as percentage of hour column (60 minutes) - use percentage for full-width cell
        const timeLeftPercent = (taskStartInHour / 60) * 100;
        const timeWidthPercent = (taskDurationInHour / 60) * 100;
        
        // Collision detection
        const taskHeight = 50;
        let lane = 0;
        let collision = true;
        
        while (collision) {
            collision = false;
            for (let i = 0; i < taskLanes.length; i++) {
                const existingTask = taskLanes[i];
                if (existingTask.lane === lane) {
                    const existingLeft = existingTask.leftPercent;
                    const existingRight = existingTask.leftPercent + existingTask.widthPercent;
                    const taskRight = timeLeftPercent + timeWidthPercent;
                    
                    if (!(taskRight < existingLeft || timeLeftPercent > existingRight)) {
                        collision = true;
                        lane++;
                        break;
                    }
                }
            }
        }
        
        taskLanes.push({ leftPercent: timeLeftPercent, widthPercent: timeWidthPercent, lane });
        const topOffset = lane * taskHeight;
        
        const taskDiv = document.createElement('div');
        taskDiv.className = `gantt-task status-${task.status}`;
        taskDiv.dataset.taskId = task.id;
        
        taskDiv.style.cssText = `
            position: absolute;
            left: ${timeLeftPercent}%;
            width: ${Math.max(timeWidthPercent, 2)}%;
            height: ${taskHeight}px;
            top: ${topOffset + 20}px;
            transform: none;
            padding: 4px 8px;
            color: white;
            font-weight: 600;
            font-size: 0.75rem;
            cursor: pointer;
            z-index: 4;
        `;
        
        const timeDisplay = `${startTimeFormatted}-${endTimeFormatted}`;
        taskDiv.innerHTML = `
            <span class="task-name">${task.name}</span>
            <span class="task-time">${timeDisplay}</span>
        `;
        
        taskDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // If Ctrl/Cmd is held, toggle selection instead of opening task
            if (e.ctrlKey || e.metaKey) {
                if (this.selectedItems.has(taskDiv)) {
                    this.selectedItems.delete(taskDiv);
                    taskDiv.classList.remove('gantt-selected');
                } else {
                    this.selectedItems.add(taskDiv);
                    taskDiv.classList.add('gantt-selected');
                }
                return;
            }
            
            // If item is selected, don't open task (user might want to delete multiple)
            if (this.selectedItems.has(taskDiv) && this.selectedItems.size > 1) {
                return;
            }
            
            // Clear selection if clicking on a single item
            if (!this.selectedItems.has(taskDiv)) {
                this.clearSelection();
            }
            
            this.onTaskClick(task);
        });
        
        // Right-click context menu
        taskDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.contextMenu) {
                this.contextMenu.show(e, task, 'task');
            }
        });

        // Mobile: long-press context menu
        this.attachLongPressContextMenu(taskDiv, task, 'task');
        
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
        
        // Check if in hour view
        const level = this.zoomLevels[this.currentZoomLevel];
        const isHourView = level && level.rangeType === 'hour';
        
        // Parse start and end times
        const startTime = this.formatTime(hourlyTask.start_time);
        const endTime = this.formatTime(hourlyTask.end_time);
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        
        if (isHourView) {
            // Hour view: only show tasks from current hour of today
            const now = new Date();
            const currentHour = now.getHours();
            const todayStr = this.formatDate(now);
            
            // STRICT: Must have task_date
            if (!hourlyTask.task_date) {
                console.log(`   ❌ Hourly task "${hourlyTask.name}" rejected: No task_date`);
                return null;
            }
            
            // STRICT: Must be today - compare date strings directly (already in YYYY-MM-DD format)
            // Don't normalize as it causes timezone issues - compare strings directly
            if (hourlyTask.task_date !== todayStr) {
                console.log(`   ❌ Hourly task "${hourlyTask.name}" rejected: task_date "${hourlyTask.task_date}" !== today "${todayStr}"`);
                return null;
            }
            
            // STRICT: Must have start_time and end_time
            if (!hourlyTask.start_time || !hourlyTask.end_time) {
                console.log(`   ❌ Hourly task "${hourlyTask.name}" rejected: Missing start_time or end_time`);
                return null;
            }
            
            // Check if task overlaps with current hour
            const hourStartMinutes = currentHour * 60;
            const hourEndMinutes = (currentHour + 1) * 60;
            
            // Task must overlap with the hour (starts before hour ends and ends after hour starts)
            if (startMinutes >= hourEndMinutes || endMinutes <= hourStartMinutes) {
                console.log(`   ❌ Hourly task "${hourlyTask.name}" rejected: Time ${startTime}-${endTime} (${startMinutes}-${endMinutes} min) does not overlap hour ${hourStartMinutes}-${hourEndMinutes} min`);
                return null;
            }
            
            console.log(`   ✅ Hourly task "${hourlyTask.name}" accepted: Time ${startTime}-${endTime} overlaps hour ${currentHour}:00-${currentHour + 1}:00`);
            
            // Position within the single hour column
            // Calculate position within the hour (0-60 minutes)
            const taskStartInHour = Math.max(0, startMinutes - hourStartMinutes);
            const taskEndInHour = Math.min(60, endMinutes - hourStartMinutes);
            const taskDurationInHour = taskEndInHour - taskStartInHour;
            
            // Position and width as percentage of hour column - use percentage for full-width cell
            const timeLeftPercent = (taskStartInHour / 60) * 100;
            const timeWidthPercent = (taskDurationInHour / 60) * 100;
            
            // Collision detection for hourly tasks in hour view
            const taskHeight = this.isMobileViewport() ? 34 : 25;
            let lane = 0;
            let collision = true;
            
            while (collision) {
                collision = false;
                for (let i = 0; i < taskLanes.length; i++) {
                    const existingTask = taskLanes[i];
                    if (existingTask.lane === lane) {
                        const existingLeft = existingTask.leftPercent || 0;
                        const existingRight = existingLeft + (existingTask.widthPercent || 0);
                        const taskRight = timeLeftPercent + timeWidthPercent;
                        
                        if (!(taskRight < existingLeft || timeLeftPercent > existingRight)) {
                            collision = true;
                            lane++;
                            break;
                        }
                    }
                }
            }
            
            taskLanes.push({ leftPercent: timeLeftPercent, widthPercent: timeWidthPercent, lane, date: todayStr });
            const topOffset = lane * (taskHeight + 2);
            
            const taskDiv = document.createElement('div');
            taskDiv.className = `gantt-hourly-task status-${hourlyTask.status || 'pending'} work-area-${hourlyTask.work_area || 'other'}`;
            taskDiv.dataset.taskId = hourlyTask.id;
            taskDiv.dataset.taskType = 'hourly';
            taskDiv.dataset.date = todayStr;
            
            const workAreaColors = {
                'administrative': '#3b82f6',
                'music-prod': '#8b5cf6',
                'video-creation': '#ec4899',
                'other': '#10b981',
                'note-other': '#64748b'
            };
            
            const taskColor = workAreaColors[hourlyTask.work_area] || '#64748b';
            const baseTop = 10;
            const finalTop = baseTop + topOffset;
            
            taskDiv.style.cssText = `
                position: absolute;
                left: ${timeLeftPercent}%;
                width: ${Math.max(timeWidthPercent, 2)}%;
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
            
            const taskName = hourlyTask.name.length > 15 ? hourlyTask.name.substring(0, 12) + '...' : hourlyTask.name;
            taskDiv.textContent = `${taskName} ${startTime}`;
            
            taskDiv.title = `${hourlyTask.name}\n${startTime} - ${endTime}\n${hourlyTask.work_area || 'other'}`;
            
            // Click handler for hourly tasks in hour view (allow multi-select)
            taskDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // If Ctrl/Cmd is held, toggle selection
                if (e.ctrlKey || e.metaKey) {
                    if (this.selectedItems.has(taskDiv)) {
                        this.selectedItems.delete(taskDiv);
                        taskDiv.classList.remove('gantt-selected');
                    } else {
                        this.selectedItems.add(taskDiv);
                        taskDiv.classList.add('gantt-selected');
                    }
                    return;
                }
                
                // If item is selected, don't do anything (user might want to delete multiple)
                if (this.selectedItems.has(taskDiv) && this.selectedItems.size > 1) {
                    return;
                }
                
                // Clear selection if clicking on a single item
                if (!this.selectedItems.has(taskDiv)) {
                    this.clearSelection();
                }
            });
            
            // Right-click context menu for hourly tasks in hour view
            taskDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.contextMenu) {
                    this.contextMenu.show(e, hourlyTask, 'hourlyTask');
                }
            });

            // Mobile: long-press context menu
            this.attachLongPressContextMenu(taskDiv, hourlyTask, 'hourlyTask');
            
            return taskDiv;
        }
        
        // Normal view: use day-based positioning
        // Normalize dates to midnight for proper comparison (use local time, not UTC)
        const taskDateParts = hourlyTask.task_date.split('-');
        const taskDate = new Date(parseInt(taskDateParts[0]), parseInt(taskDateParts[1]) - 1, parseInt(taskDateParts[2]));
        taskDate.setHours(0, 0, 0, 0);
        
        const startDateNormalized = new Date(this.startDate);
        startDateNormalized.setHours(0, 0, 0, 0);
        
        const endDateNormalized = new Date(this.endDate);
        endDateNormalized.setHours(23, 59, 59, 999);
        
        const dateStr = this.formatDate(taskDate);
        
        // Check if task is within date range
        const taskTime = taskDate.getTime();
        const startDateMs = startDateNormalized.getTime();
        const endDateMs = endDateNormalized.getTime();
        
        if (taskTime < startDateMs || taskTime > endDateMs) {
            return null;
        }
        
        const daysFromStart = this.getDaysBetween(this.startDate, taskDate) - 1;
        const left = daysFromStart * this.dayWidth + 4;
        const width = this.dayWidth - 8;
        
        // Calculate position within day based on time
        const dayStartMinutes = 0;
        const dayEndMinutes = 24 * 60;
        
        // Calculate width based on time duration (as percentage of day)
        const timeWidth = ((endMinutes - startMinutes) / dayEndMinutes) * width;
        const timeLeft = (startMinutes / dayEndMinutes) * width;
        
        // Collision detection for hourly tasks
        const taskHeight = this.isMobileViewport() ? 34 : 25;
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
        
        // Click to open hourly Gantt for that day (but allow multi-select with Ctrl/Cmd)
        taskDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // If Ctrl/Cmd is held, toggle selection instead of opening hourly Gantt
            if (e.ctrlKey || e.metaKey) {
                if (this.selectedItems.has(taskDiv)) {
                    this.selectedItems.delete(taskDiv);
                    taskDiv.classList.remove('gantt-selected');
                } else {
                    this.selectedItems.add(taskDiv);
                    taskDiv.classList.add('gantt-selected');
                }
                return;
            }
            
            // If item is selected, don't open hourly Gantt (user might want to delete multiple)
            if (this.selectedItems.has(taskDiv) && this.selectedItems.size > 1) {
                return;
            }
            
            // Clear selection if clicking on a single item
            if (!this.selectedItems.has(taskDiv)) {
                this.clearSelection();
            }
            
            if (window.openHourlyGantt) {
                window.openHourlyGantt(dateStr);
            } else {
                console.log('Hourly task clicked:', hourlyTask);
            }
        });
        
        // Right-click context menu for hourly tasks in normal view
        taskDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.contextMenu) {
                this.contextMenu.show(e, hourlyTask, 'hourlyTask');
            }
        });

        // Mobile: long-press context menu
        this.attachLongPressContextMenu(taskDiv, hourlyTask, 'hourlyTask');
        
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
    
    // Initialize multi-select functionality
    initMultiSelect(body) {
        // Don't initialize if not editable (employees can't delete)
        if (!this.isEditable) {
            return;
        }
        
        let isMouseDown = false;
        let startX = 0;
        let startY = 0;
        
        // Create selection box element
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'gantt-selection-box';
        this.selectionBox.style.display = 'none';
        body.appendChild(this.selectionBox);
        
        // Mouse down - start selection
        body.addEventListener('mousedown', (e) => {
            // Don't start selection if clicking directly on an item
            if (e.target.closest('.gantt-shift-bar, .gantt-task, .gantt-hourly-task')) {
                return;
            }
            
            // Only start selection if clicking on empty space
            if (e.target === body || e.target.classList.contains('gantt-day-cell') || 
                e.target.classList.contains('gantt-timeline-cell') || 
                e.target.classList.contains('gantt-row') ||
                e.target.classList.contains('gantt-body')) {
                
                // Prevent text selection
                e.preventDefault();
                
                // Check if Ctrl/Cmd key is held for multi-select mode
                if (e.ctrlKey || e.metaKey) {
                    this.selectionMode = true;
                }
                
                isMouseDown = true;
                this.isSelecting = true;
                
                // Disable text selection on body during drag
                body.style.userSelect = 'none';
                body.style.webkitUserSelect = 'none';
                body.style.mozUserSelect = 'none';
                body.style.msUserSelect = 'none';
                
                const rect = body.getBoundingClientRect();
                startX = e.clientX - rect.left + body.scrollLeft;
                startY = e.clientY - rect.top + body.scrollTop;
                
                this.selectionStart = { x: startX, y: startY };
                
                this.selectionBox.style.left = `${startX}px`;
                this.selectionBox.style.top = `${startY}px`;
                this.selectionBox.style.width = '0px';
                this.selectionBox.style.height = '0px';
                this.selectionBox.style.display = 'block';
                
                // Clear previous selection if not in multi-select mode
                if (!this.selectionMode) {
                    this.clearSelection();
                }
            }
        });
        
        // Mouse move - update selection box
        body.addEventListener('mousemove', (e) => {
            if (isMouseDown && this.isSelecting) {
                // Prevent text selection during drag
                e.preventDefault();
                
                const rect = body.getBoundingClientRect();
                const currentX = e.clientX - rect.left + body.scrollLeft;
                const currentY = e.clientY - rect.top + body.scrollTop;
                
                const left = Math.min(startX, currentX);
                const top = Math.min(startY, currentY);
                const width = Math.abs(currentX - startX);
                const height = Math.abs(currentY - startY);
                
                this.selectionBox.style.left = `${left}px`;
                this.selectionBox.style.top = `${top}px`;
                this.selectionBox.style.width = `${width}px`;
                this.selectionBox.style.height = `${height}px`;
                
                // Update selected items
                this.updateSelection(left, top, width, height);
            }
        });
        
        // Mouse up - finish selection
        body.addEventListener('mouseup', (e) => {
            if (isMouseDown) {
                // Re-enable text selection
                body.style.userSelect = '';
                body.style.webkitUserSelect = '';
                body.style.mozUserSelect = '';
                body.style.msUserSelect = '';
                
                isMouseDown = false;
                this.isSelecting = false;
                this.selectionBox.style.display = 'none';
                this.selectionMode = false;
            }
        });
        
        // Also prevent text selection on mouse leave (in case mouse is released outside)
        body.addEventListener('mouseleave', (e) => {
            if (isMouseDown) {
                // Re-enable text selection
                body.style.userSelect = '';
                body.style.webkitUserSelect = '';
                body.style.mozUserSelect = '';
                body.style.msUserSelect = '';
                
                isMouseDown = false;
                this.isSelecting = false;
                this.selectionBox.style.display = 'none';
                this.selectionMode = false;
            }
        });
        
        // Keyboard shortcuts (only for editable charts)
        document.addEventListener('keydown', (e) => {
            // Only allow delete if chart is editable
            if (!this.isEditable) {
                return;
            }
            
            // Delete selected items with Delete or Backspace
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedItems.size > 0) {
                e.preventDefault();
                this.deleteSelectedItems();
            }
            
            // Escape to clear selection
            if (e.key === 'Escape') {
                this.clearSelection();
            }
        });
    }
    
    // Update selection based on selection box
    updateSelection(left, top, width, height) {
        const allItems = this.container.querySelectorAll('.gantt-shift-bar, .gantt-task, .gantt-hourly-task');
        
        allItems.forEach(item => {
            const rect = item.getBoundingClientRect();
            const bodyRect = this.container.querySelector('.gantt-body').getBoundingClientRect();
            const bodyScroll = this.container.querySelector('.gantt-body');
            
            const itemLeft = rect.left - bodyRect.left + (bodyScroll?.scrollLeft || 0);
            const itemTop = rect.top - bodyRect.top + (bodyScroll?.scrollTop || 0);
            const itemRight = itemLeft + rect.width;
            const itemBottom = itemTop + rect.height;
            
            // Check if item overlaps with selection box
            const overlaps = !(itemRight < left || itemLeft > left + width || 
                             itemBottom < top || itemTop > top + height);
            
            if (overlaps) {
                if (!this.selectedItems.has(item)) {
                    this.selectedItems.add(item);
                    item.classList.add('gantt-selected');
                }
            } else {
                // Only remove from selection if not in multi-select mode
                if (!this.selectionMode && this.selectedItems.has(item)) {
                    this.selectedItems.delete(item);
                    item.classList.remove('gantt-selected');
                }
            }
        });
        
        // Log current selection count for debugging
        if (this.selectedItems.size > 0) {
            console.log(`📦 ${this.selectedItems.size} item(s) selected`);
        }
    }
    
    // Clear all selections
    clearSelection() {
        this.selectedItems.forEach(item => {
            item.classList.remove('gantt-selected');
        });
        this.selectedItems.clear();
    }
    
    // Delete all selected items
    async deleteSelectedItems() {
        // Don't allow deletion if not editable (employees can't delete)
        if (!this.isEditable) {
            console.warn('Delete operation blocked: Chart is not editable');
            alert('You do not have permission to delete items.');
            return;
        }
        
        if (this.selectedItems.size === 0) {
            console.log('No items selected for deletion');
            return;
        }
        
        const count = this.selectedItems.size;
        console.log(`🗑️ Attempting to delete ${count} selected item(s)`);
        
        if (!confirm(`Are you sure you want to delete ${count} item(s)?`)) {
            return;
        }
        
        // Create a copy of the set to avoid issues during iteration
        const itemsToDelete = Array.from(this.selectedItems);
        console.log('📋 Items to delete:', itemsToDelete.map(item => ({
            type: item.className.split(' ')[0],
            id: item.dataset.shiftId || item.dataset.taskId,
            name: item.textContent?.trim() || 'Unknown'
        })));
        
        let successCount = 0;
        let failCount = 0;
        
        for (const item of itemsToDelete) {
            try {
                const itemType = item.classList.contains('gantt-shift-bar') ? 'shift' :
                                item.classList.contains('gantt-hourly-task') ? 'hourlyTask' : 'task';
                
                const itemId = item.dataset.shiftId || item.dataset.taskId;
                
                console.log(`🗑️ Deleting ${itemType} with ID: ${itemId}`);
                
                if (!itemId) {
                    console.warn('Item missing ID:', item);
                    failCount++;
                    continue;
                }
                
                if (itemType === 'shift') {
                    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                        const result = await supabaseService.deleteEmployeeShift(parseInt(itemId));
                        if (result) successCount++;
                        else failCount++;
                    } else {
                        failCount++;
                    }
                } else if (itemType === 'hourlyTask') {
                    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                        const result = await supabaseService.deleteHourlyTask(parseInt(itemId));
                        if (result) successCount++;
                        else failCount++;
                    } else {
                        failCount++;
                    }
                } else if (itemType === 'task') {
                    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                        const result = await supabaseService.deleteTask(parseInt(itemId));
                        if (result) successCount++;
                        else failCount++;
                    } else {
                        // Fallback to local deletion
                        if (this.deleteTask) {
                            await this.deleteTask(itemId);
                            successCount++;
                        } else {
                            failCount++;
                        }
                    }
                }
            } catch (error) {
                console.error('Error deleting item:', error);
                failCount++;
            }
        }
        
        // Clear selection
        this.clearSelection();
        
        // Refresh the chart
        if (typeof this.render === 'function') {
            await this.render();
        }
        
        if (typeof syncFromSupabase === 'function') {
            await syncFromSupabase();
        }
        
        // Show result
        if (failCount === 0) {
            alert(`✅ Successfully deleted ${successCount} item(s)!`);
        } else {
            alert(`⚠️ Deleted ${successCount} item(s), ${failCount} failed.`);
        }
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
        timeIndicator.style.left = '0';
        timeIndicator.style.width = '2px';
        timeIndicator.style.height = '100%';
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
        const level = this.zoomLevels[this.currentZoomLevel];
        const isHourView = level && level.rangeType === 'hour';
        
        const indicator = this.container.querySelector('.gantt-current-time');
        if (!indicator) return;
        
        // Ensure indicator spans full height
        const body = this.container.querySelector('.gantt-body');
        if (body) {
            // Set height to match the scrollable content height
            const bodyHeight = body.scrollHeight || body.clientHeight;
            indicator.style.height = `${bodyHeight}px`;
            indicator.style.minHeight = '100%';
        }
        
        if (isHourView) {
            // Hour view: position within the single full-width hour cell
            const currentHour = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentSeconds = now.getSeconds();
            
            // Calculate position within the hour (0-60 minutes)
            const minutesInHour = currentMinutes + (currentSeconds / 60);
            const timePercent = minutesInHour / 60; // 0 to 1
            
            // Get the timeline header to calculate available width
            const timelineHeader = this.container.querySelector('.gantt-timeline-header');
            const employeeColumnWidth = this.getEmployeeColumnWidth();
            let availableWidth = window.innerWidth - employeeColumnWidth;
            
            if (timelineHeader) {
                availableWidth = timelineHeader.offsetWidth || timelineHeader.clientWidth;
            }
            
            // Position: employee column + (time percent * available width)
            const left = employeeColumnWidth + (timePercent * availableWidth);
            
            indicator.style.display = 'block';
            indicator.style.left = `${left}px`;
            return;
        }
        
        // Regular view: Find today's column
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
            indicator.style.display = 'none';
            return;
        }
        
        // Calculate position within today's column based on current time
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // Position as percentage of day (0-1)
        const timePercent = (hours * 3600 + minutes * 60 + seconds) / (24 * 3600);
        
        // Calculate left position: employee column width (200px) + (today column index * dayWidth) + (time percent * dayWidth)
        const employeeColumnWidth = this.getEmployeeColumnWidth();
        const left = employeeColumnWidth + (todayColumnIndex * this.dayWidth) + (timePercent * this.dayWidth);
        
        // Update indicator position
        indicator.style.display = 'block';
        indicator.style.left = `${left}px`;
    }
    
    // Apply zoom level settings
    applyZoomLevel() {
        const level = this.zoomLevels[this.currentZoomLevel];
        if (level) {
            // IMPORTANT: dayWidth is used for both layout (cell widths) and bar positioning.
            // On mobile, we must reduce it, otherwise the chart becomes unusable and CSS media
            // queries won't help because gantt.js sets widths inline.
            const isMobile = this.isMobileViewport();
            const isTiny = this.isVerySmallViewport();

            if (level.rangeType === 'day') {
                // Day view is hour-granular; scale by hour width (24 hours).
                const hourWidth = isMobile ? (isTiny ? 44 : 52) : (level.hourWidth || 100);
                this.dayWidth = hourWidth * 24;
            } else if (level.rangeType === 'hour') {
                // Hour view uses full-width cells; dayWidth is mostly irrelevant but kept sane.
                this.dayWidth = isMobile ? 120 : level.dayWidth;
            } else if (level.rangeType === 'week') {
                this.dayWidth = isMobile ? (isTiny ? 80 : 92) : level.dayWidth;
            } else if (level.rangeType === 'month') {
                // Month view default was 200px/day which is far too wide on phones.
                this.dayWidth = isMobile ? (isTiny ? 80 : 92) : level.dayWidth;
            } else {
                this.dayWidth = level.dayWidth;
            }
            
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
