// LOGIC: Enhanced Gantt interactions - click shift to edit modal, auto-save drafts, conflict detection
document.addEventListener('DOMContentLoaded', function() {
    // SLOWER: Search functionality with debounce delay
    const employeeSearch = document.getElementById('employeeSearch');
    if (employeeSearch) {
        let searchTimeout;
        employeeSearch.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            // PURPOSELY SUPER SLOW: Much longer delay for search
            searchTimeout = setTimeout(() => {
                const searchTerm = this.value.toLowerCase().trim();
                const ganttRows = document.querySelectorAll('.gantt-row');
                
                ganttRows.forEach(row => {
                    const employeeCell = row.querySelector('.gantt-employee-cell');
                    if (employeeCell) {
                        const employeeName = employeeCell.textContent.toLowerCase();
                        if (employeeName.includes(searchTerm) || searchTerm === '') {
                            row.style.display = 'flex';
                        } else {
                            row.style.display = 'none';
                        }
                    }
                });
            }, 1500);
        });
    }
    
    // ADDED UI: Zoom controls for Gantt
    let currentZoom = 1;
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    const ganttChart = document.getElementById('ganttChart');
    
    // ADDED: Fake loading screens for zoom controls
    if (zoomInBtn && ganttChart) {
        zoomInBtn.addEventListener('click', function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('zoom', () => {
                    currentZoom = Math.min(currentZoom + 0.1, 2);
                    applyZoom();
                });
            } else {
                currentZoom = Math.min(currentZoom + 0.1, 2);
                applyZoom();
            }
        });
    }
    
    if (zoomOutBtn && ganttChart) {
        zoomOutBtn.addEventListener('click', function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('zoom', () => {
                    currentZoom = Math.max(currentZoom - 0.1, 0.5);
                    applyZoom();
                });
            } else {
                currentZoom = Math.max(currentZoom - 0.1, 0.5);
                applyZoom();
            }
        });
    }
    
    if (zoomResetBtn && ganttChart) {
        zoomResetBtn.addEventListener('click', function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('zoom reset', () => {
                    currentZoom = 1;
                    applyZoom();
                });
            } else {
                currentZoom = 1;
                applyZoom();
            }
        });
    }
    
    function applyZoom() {
        if (ganttChart) {
            ganttChart.style.transition = 'transform 2s ease';
            ganttChart.style.transform = `scale(${currentZoom})`;
            ganttChart.style.transformOrigin = 'top left';
        }
    }
    
    // ADDED UI: Export CSV functionality with fake loading screen
    const exportCSVBtn = document.getElementById('exportCSVBtn');
    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', function() {
            if (typeof showActionLoadingScreen !== 'undefined') {
                showActionLoadingScreen('export', () => {
                    exportGanttToCSV();
                });
            } else {
                exportGanttToCSV();
            }
        });
    }
    
    function exportGanttToCSV() {
        const rows = document.querySelectorAll('.gantt-row');
        let csv = 'Employee,Date,Shift Time,Status\n';
        
        rows.forEach(row => {
            const employeeCell = row.querySelector('.gantt-employee-cell .employee-name');
            const employeeName = employeeCell ? employeeCell.textContent.trim() : 'Unknown';
            
            const shiftBars = row.querySelectorAll('.gantt-shift-bar');
            shiftBars.forEach(bar => {
                const date = bar.dataset.date || '';
                const time = bar.querySelector('.shift-time') ? bar.querySelector('.shift-time').textContent : '';
                const status = bar.classList.contains('shift-status-scheduled') ? 'Scheduled' : 
                              bar.classList.contains('shift-status-completed') ? 'Completed' : 'Unknown';
                csv += `"${employeeName}","${date}","${time}","${status}"\n`;
            });
        });
        
        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gantt-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
    
    // LOGIC: Click shift to edit modal
    document.addEventListener('click', function(e) {
        const shiftBar = e.target.closest('.gantt-shift-bar');
        if (shiftBar && window.openEditShiftModal) {
            const employeeId = shiftBar.dataset.employeeId;
            const shiftId = shiftBar.dataset.shiftId;
            const date = shiftBar.dataset.date;
            window.openEditShiftModal(employeeId, shiftId, null, date);
        }
    });
    
    // LOGIC: Auto-save drafts (save to localStorage every 30 seconds)
    let autoSaveInterval;
    if (typeof ganttChart !== 'undefined' && ganttChart) {
        autoSaveInterval = setInterval(function() {
            const ganttData = {
                employees: [],
                tasks: [],
                timestamp: new Date().toISOString()
            };
            
            // Collect current Gantt state
            const rows = document.querySelectorAll('.gantt-row');
            rows.forEach(row => {
                const employeeCell = row.querySelector('.gantt-employee-cell');
                if (employeeCell) {
                    const employeeName = employeeCell.querySelector('.employee-name')?.textContent || '';
                    const employeeRole = employeeCell.querySelector('.employee-role')?.textContent || '';
                    ganttData.employees.push({ name: employeeName, role: employeeRole });
                }
            });
            
            // Save to localStorage
            localStorage.setItem('ganttDraft', JSON.stringify(ganttData));
        }, 30000);
    }
    
    // LOGIC: Conflict detection for overlaps
    function detectConflicts() {
        const rows = document.querySelectorAll('.gantt-row');
        const conflicts = [];
        
        rows.forEach(row => {
            const shiftBars = Array.from(row.querySelectorAll('.gantt-shift-bar'));
            const employeeId = row.dataset.employeeId;
            
            // Check for overlapping shifts
            for (let i = 0; i < shiftBars.length; i++) {
                for (let j = i + 1; j < shiftBars.length; j++) {
                    const bar1 = shiftBars[i];
                    const bar2 = shiftBars[j];
                    
                    const date1 = bar1.dataset.date;
                    const date2 = bar2.dataset.date;
                    
                    if (date1 === date2) {
                        const left1 = parseInt(bar1.style.left) || 0;
                        const width1 = parseInt(bar1.style.width) || 0;
                        const left2 = parseInt(bar2.style.left) || 0;
                        const width2 = parseInt(bar2.style.width) || 0;
                        
                        // Check if bars overlap
                        if (!(left1 + width1 <= left2 || left2 + width2 <= left1)) {
                            conflicts.push({
                                employeeId: employeeId,
                                date: date1,
                                shift1: bar1.dataset.shiftId,
                                shift2: bar2.dataset.shiftId
                            });
                        }
                    }
                }
            }
        });
        
        if (conflicts.length > 0) {
            console.warn('Shift conflicts detected:', conflicts);
            // Show warning to user
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.textContent = `Warning: ${conflicts.length} shift conflict(s) detected`;
            errorMsg.style.position = 'fixed';
            errorMsg.style.top = '20px';
            errorMsg.style.right = '20px';
            errorMsg.style.zIndex = '10001';
            document.body.appendChild(errorMsg);
            
            setTimeout(() => {
                errorMsg.remove();
            }, 5000);
        }
        
        return conflicts;
    }
    
    // Run conflict detection periodically
    setInterval(detectConflicts, 60000); // Check every minute
});

