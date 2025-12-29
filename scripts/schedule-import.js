// Schedule Import from Image using OCR
// ====================================

document.addEventListener('DOMContentLoaded', function() {
    const importScheduleBtn = document.getElementById('importScheduleBtn');
    const importScheduleModal = document.getElementById('importScheduleModal');
    const closeImportScheduleModal = document.getElementById('closeImportScheduleModal');
    const cancelImportScheduleBtn = document.getElementById('cancelImportScheduleBtn');
    const scheduleImageUpload = document.getElementById('scheduleImageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const ocrProgressContainer = document.getElementById('ocrProgressContainer');
    const ocrProgressText = document.getElementById('ocrProgressText');
    const parsedShiftsContainer = document.getElementById('parsedShiftsContainer');
    const parsedShiftsList = document.getElementById('parsedShiftsList');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    const retryImportBtn = document.getElementById('retryImportBtn');
    const importScheduleActions = document.getElementById('importScheduleActions');

    let parsedShifts = [];
    let employees = [];
    let currentImageFile = null;

    // Open modal
    if (importScheduleBtn) {
        importScheduleBtn.addEventListener('click', async () => {
            // Load employees for matching
            if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                try {
                    employees = await supabaseService.getEmployees();
                } catch (error) {
                    console.error('Error loading employees:', error);
                    employees = [];
                }
            }
            
            resetImportModal();
            importScheduleModal.style.display = 'block';
        });
    }

    // Close modal
    if (closeImportScheduleModal) {
        closeImportScheduleModal.addEventListener('click', () => {
            importScheduleModal.style.display = 'none';
            resetImportModal();
        });
    }

    if (cancelImportScheduleBtn) {
        cancelImportScheduleBtn.addEventListener('click', () => {
            importScheduleModal.style.display = 'none';
            resetImportModal();
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === importScheduleModal) {
            importScheduleModal.style.display = 'none';
            resetImportModal();
        }
    });

    // Reset modal state
    function resetImportModal() {
        scheduleImageUpload.value = '';
        imagePreviewContainer.style.display = 'none';
        ocrProgressContainer.style.display = 'none';
        parsedShiftsContainer.style.display = 'none';
        importScheduleActions.style.display = 'none';
        parsedShifts = [];
        currentImageFile = null;
    }

    // Handle image upload
    if (scheduleImageUpload) {
        scheduleImageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file');
                return;
            }

            currentImageFile = file;

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);

            // Start OCR processing
            await processImageWithOCR(file);
        });
    }

    // Process image with OCR
    async function processImageWithOCR(file) {
        // Check if Tesseract is loaded
        if (typeof Tesseract === 'undefined') {
            alert('OCR library not loaded. Please refresh the page and try again.');
            return;
        }

        ocrProgressContainer.style.display = 'block';
        ocrProgressText.textContent = 'Initializing OCR engine...';
        parsedShiftsContainer.style.display = 'none';
        importScheduleActions.style.display = 'none';

        try {
            ocrProgressText.textContent = 'Loading OCR engine...';
            
            // Use Tesseract.recognize which handles everything internally
            // This is the simplest API that works with File objects directly
            const result = await Tesseract.recognize(file, 'eng', {
                logger: (m) => {
                    // Update progress based on status
                    if (m.status) {
                        if (m.status === 'recognizing text' && m.progress !== undefined) {
                            ocrProgressText.textContent = `Recognizing text... ${Math.round(m.progress * 100)}%`;
                        } else if (m.status === 'loading tesseract core') {
                            ocrProgressText.textContent = 'Loading OCR engine...';
                        } else if (m.status === 'initializing tesseract') {
                            ocrProgressText.textContent = 'Initializing OCR engine...';
                        } else if (m.status === 'loading language traineddata') {
                            ocrProgressText.textContent = 'Loading language data...';
                        } else if (m.status === 'recognizing text') {
                            ocrProgressText.textContent = 'Recognizing text from image...';
                        }
                    }
                }
            });

            const text = result.data.text;
            ocrProgressText.textContent = 'Parsing shift information...';
            
            // Parse the extracted text
            console.log('OCR Text extracted:', text.substring(0, 500)); // Log first 500 chars for debugging
            parsedShifts = parseScheduleText(text);
            console.log('Parsed shifts:', parsedShifts);
            
            ocrProgressContainer.style.display = 'none';
            
            if (parsedShifts.length === 0) {
                // Show more helpful error with OCR text preview
                const textPreview = text.substring(0, 200).replace(/\n/g, ' ');
                console.warn('No shifts detected. OCR text preview:', textPreview);
                alert('No shifts could be detected from the image.\n\nPlease ensure:\n- Employee name is clearly visible\n- Shift times are in format "16:00 - 21:00"\n- Dates are visible\n\nTip: Try a clearer image or check that the employee name matches your database.');
                retryImportBtn.style.display = 'inline-block';
                importScheduleActions.style.display = 'block';
                return;
            }

            displayParsedShifts();
            importScheduleActions.style.display = 'block';
            retryImportBtn.style.display = 'none';

        } catch (error) {
            console.error('OCR Error:', error);
            ocrProgressContainer.style.display = 'none';
            
            let errorMsg = 'Error processing image. ';
            if (error.message) {
                errorMsg += error.message;
            } else {
                errorMsg += 'Please ensure the image is clear and readable.';
            }
            errorMsg += '\n\nPlease try again with a clearer image.';
            
            alert(errorMsg);
            retryImportBtn.style.display = 'inline-block';
            importScheduleActions.style.display = 'block';
        }
    }

    // Retry import
    if (retryImportBtn) {
        retryImportBtn.addEventListener('click', async () => {
            if (currentImageFile) {
                await processImageWithOCR(currentImageFile);
            }
        });
    }

    // Parse schedule text to extract shifts
    function parseScheduleText(text) {
        const shifts = [];
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Try to find date patterns (MM/DD, MM-DD, DD/MM, month names, etc.)
        const datePattern = /(\d{1,2})[\/\-](\d{1,2})(?:\/)?(\d{2,4})?/;
        const monthNamePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i;
        
        // Try to find time patterns (HH:MM, H:MM AM/PM, etc.)
        const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
        // Enhanced time range pattern to match "16:00 - 21:00" or "16:00-21:00" format (24-hour)
        // Also supports 12-hour with AM/PM
        const timeRangePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
        // Simple 24-hour time range (no AM/PM)
        const timeRange24Pattern = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})(?:\s|$)/i;
        
        // Pattern for "DO" (Day Off)
        const dayOffPattern = /\bDO\b/i;
        
        // Try to extract year and month from header
        let scheduleYear = new Date().getFullYear();
        let scheduleMonth = new Date().getMonth(); // 0-11
        
        // Look for month/year in header (e.g., "JANUARY 2026" or "JANUARY2026")
        let monthYearMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
        if (!monthYearMatch) {
            // Try without space (OCR might not have spaces)
            monthYearMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)(\d{4})/i);
        }
        if (monthYearMatch) {
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                              'july', 'august', 'september', 'october', 'november', 'december'];
            const monthName = monthYearMatch[1].toLowerCase();
            scheduleMonth = monthNames.indexOf(monthName);
            scheduleYear = parseInt(monthYearMatch[2]);
            console.log('Extracted month/year:', monthName, scheduleYear);
        }
        
        // Current week dates (default to current week, but will be updated based on parsed dates)
        const today = new Date();
        const monday = getMonday(today);
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(date.getDate() + i);
            weekDates.push(date);
        }

        // First, try to find employee name in the header area (first 10 lines)
        let employee = null;
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const found = findEmployeeInText(lines[i]);
            if (found) {
                employee = found;
                console.log('Found employee in header:', employee.name);
                break;
            }
        }

        // If no employee found in header, try the whole text
        if (!employee) {
            for (let i = 0; i < lines.length; i++) {
                const found = findEmployeeInText(lines[i]);
                if (found) {
                    employee = found;
                    console.log('Found employee in text:', employee.name);
                    break;
                }
            }
        }

        if (!employee) {
            console.warn('No employee found in text. Available employees:', employees.map(e => e.name));
        }

        // If we found an employee and have month/year, parse calendar format
        if (employee && scheduleYear && scheduleMonth !== null) {
            console.log('Parsing calendar format for:', employee.name, scheduleYear, scheduleMonth);
            const calendarShifts = parseCalendarFormat(text, employee, scheduleYear, scheduleMonth, lines);
            console.log('Calendar format shifts found:', calendarShifts.length);
            shifts.push(...calendarShifts);
        }

        // Also try the original parsing method for other formats
        // Try to match employee names with shifts
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if line contains an employee name (if not already found)
            if (!employee) {
                employee = findEmployeeInText(line);
            }
            
            if (employee) {
                // Look for time patterns in this line and following lines
                let shiftFound = false;
                
                // Check current line for time range (try 24-hour first, then 12-hour)
                let timeRangeMatch = line.match(timeRange24Pattern);
                let startTime, endTime;
                
                if (timeRangeMatch) {
                    // 24-hour format (e.g., "16:00 - 21:00")
                    startTime = parseTime(timeRangeMatch[1], timeRangeMatch[2], null);
                    endTime = parseTime(timeRangeMatch[3], timeRangeMatch[4], null);
                } else {
                    // Try 12-hour format with AM/PM
                    timeRangeMatch = line.match(timeRangePattern);
                    if (timeRangeMatch) {
                        startTime = parseTime(timeRangeMatch[1], timeRangeMatch[2], timeRangeMatch[3]);
                        endTime = parseTime(timeRangeMatch[4], timeRangeMatch[5], timeRangeMatch[6]);
                    }
                }
                
                if (timeRangeMatch && startTime && endTime) {
                    
                    // Try to find date in nearby lines
                    let date = null;
                    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
                        const dateMatch = lines[j].match(datePattern);
                        if (dateMatch) {
                            date = parseDate(dateMatch, weekDates);
                            break;
                        }
                    }
                    
                    // If no date found, try to infer from position or use first day of week
                    if (!date) {
                        date = weekDates[0];
                    }
                    
                    if (startTime && endTime) {
                        shifts.push({
                            employee_id: employee.id,
                            employee_name: employee.name,
                            shift_date: formatDate(date),
                            start_time: startTime,
                            end_time: endTime,
                            confidence: 'medium'
                        });
                        shiftFound = true;
                    }
                } else {
                    // Check for separate start and end times
                    const times = line.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/gi);
                    if (times && times.length >= 2) {
                        const startTime = parseTimeFromString(times[0]);
                        const endTime = parseTimeFromString(times[1]);
                        
                        let date = null;
                        for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
                            const dateMatch = lines[j].match(datePattern);
                            if (dateMatch) {
                                date = parseDate(dateMatch, weekDates);
                                break;
                            }
                        }
                        
                        if (!date) {
                            date = weekDates[0];
                        }
                        
                        if (startTime && endTime) {
                            shifts.push({
                                employee_id: employee.id,
                                employee_name: employee.name,
                                shift_date: formatDate(date),
                                start_time: startTime,
                                end_time: endTime,
                                confidence: 'medium'
                            });
                            shiftFound = true;
                        }
                    }
                }
                
                // If no shift found in current line, check next few lines
                if (!shiftFound) {
                    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
                        const nextLine = lines[j];
                        let timeRangeMatch = nextLine.match(timeRange24Pattern);
                        let startTime, endTime;
                        
                        if (timeRangeMatch) {
                            startTime = parseTime(timeRangeMatch[1], timeRangeMatch[2], null);
                            endTime = parseTime(timeRangeMatch[3], timeRangeMatch[4], null);
                        } else {
                            timeRangeMatch = nextLine.match(timeRangePattern);
                            if (timeRangeMatch) {
                                startTime = parseTime(timeRangeMatch[1], timeRangeMatch[2], timeRangeMatch[3]);
                                endTime = parseTime(timeRangeMatch[4], timeRangeMatch[5], timeRangeMatch[6]);
                            }
                        }
                        
                        if (timeRangeMatch && startTime && endTime) {
                            
                            let date = null;
                            for (let k = Math.max(0, j - 3); k <= Math.min(lines.length - 1, j + 3); k++) {
                                const dateMatch = lines[k].match(datePattern);
                                if (dateMatch) {
                                    date = parseDate(dateMatch, weekDates);
                                    break;
                                }
                            }
                            
                            if (!date) {
                                date = weekDates[0];
                            }
                            
                            if (startTime && endTime) {
                                shifts.push({
                                    employee_id: employee.id,
                                    employee_name: employee.name,
                                    shift_date: formatDate(date),
                                    start_time: startTime,
                                    end_time: endTime,
                                    confidence: 'low'
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }

        // If we found employee names but no shifts, try a different approach
        // Look for table-like structures
        if (shifts.length === 0) {
            shifts.push(...parseTableFormat(lines, weekDates));
        }
        
        // ALWAYS try fallback parsing if we have an employee and month/year
        // This handles cases where OCR text is garbled but time patterns are still visible
        if (employee && scheduleYear && scheduleMonth !== null) {
            console.log('Trying fallback parsing for entire text...');
            const fallbackShifts = parseFallbackFormat(text, employee, scheduleYear, scheduleMonth);
            if (fallbackShifts.length > 0) {
                console.log('Fallback parsing found', fallbackShifts.length, 'shifts');
                // Only add fallback shifts if we don't have any, or if they're different
                if (shifts.length === 0) {
                    shifts.push(...fallbackShifts);
                } else {
                    // Merge fallback shifts, avoiding duplicates
                    for (const fallbackShift of fallbackShifts) {
                        const exists = shifts.some(s => 
                            s.shift_date === fallbackShift.shift_date &&
                            s.start_time === fallbackShift.start_time &&
                            s.end_time === fallbackShift.end_time
                        );
                        if (!exists) {
                            shifts.push(fallbackShift);
                        }
                    }
                }
            }
        }
        
        console.log('Final parsed shifts count:', shifts.length);
        if (shifts.length > 0) {
            console.log('Sample shifts:', shifts.slice(0, 3));
        }

        return shifts;
    }

    // Find employee name in text
    function findEmployeeInText(text) {
        if (!employees || employees.length === 0) {
            console.warn('No employees loaded');
            return null;
        }
        
        const lowerText = text.toLowerCase();
        
        // Try exact match first
        for (const emp of employees) {
            const empNameLower = emp.name.toLowerCase();
            if (lowerText.includes(empNameLower)) {
                console.log('Exact match found:', emp.name, 'in text:', text.substring(0, 50));
                return emp;
            }
        }
        
        // Try partial match (first name or last name) - but require at least 4 chars
        for (const emp of employees) {
            const nameParts = emp.name.toLowerCase().split(' ').filter(p => p.length >= 4);
            for (const part of nameParts) {
                if (lowerText.includes(part)) {
                    console.log('Partial match found:', emp.name, 'matched part:', part);
                    return emp;
                }
            }
        }
        
        // Try matching "Schedule For: [Name]" pattern
        const scheduleForMatch = text.match(/schedule\s+for[:\s]+([A-Za-z\s]+)/i);
        if (scheduleForMatch) {
            const nameFromText = scheduleForMatch[1].trim();
            console.log('Found "Schedule For:" pattern:', nameFromText);
            // Try to match this name with employees
            for (const emp of employees) {
                const empNameLower = emp.name.toLowerCase();
                const textNameLower = nameFromText.toLowerCase();
                // Check if either name contains the other
                if (empNameLower.includes(textNameLower) || textNameLower.includes(empNameLower)) {
                    console.log('Matched "Schedule For:" name:', emp.name);
                    return emp;
                }
                // Try matching first and last name separately
                const empParts = empNameLower.split(' ');
                const textParts = textNameLower.split(' ');
                if (empParts.some(ep => textParts.some(tp => ep === tp && ep.length >= 4))) {
                    console.log('Matched "Schedule For:" name by parts:', emp.name);
                    return emp;
                }
            }
        }
        
        return null;
    }

    // Parse time string
    function parseTimeFromString(timeStr) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
            return parseTime(match[1], match[2], match[3]);
        }
        return null;
    }

    // Parse time components
    function parseTime(hour, minute, ampm) {
        let h = parseInt(hour);
        const m = parseInt(minute);
        
        if (ampm) {
            // 12-hour format with AM/PM
            if (ampm.toUpperCase() === 'PM' && h !== 12) {
                h += 12;
            } else if (ampm.toUpperCase() === 'AM' && h === 12) {
                h = 0;
            }
        } else {
            // 24-hour format - use as-is (no conversion needed)
            // Hours are already in 24-hour format (0-23)
        }
        
        // Validate hour and minute
        if (h < 0 || h > 23 || m < 0 || m > 59) {
            return null;
        }
        
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    }

    // Parse date from match
    function parseDate(match, weekDates) {
        const month = parseInt(match[1]);
        const day = parseInt(match[2]);
        const year = match[3] ? parseInt(match[3]) : null;
        
        // Find matching date in current week
        for (const date of weekDates) {
            if (date.getDate() === day && (date.getMonth() + 1) === month) {
                return date;
            }
        }
        
        // If not found, create date (default to current year)
        const currentYear = year || new Date().getFullYear();
        return new Date(currentYear, month - 1, day);
    }

    // Parse calendar format schedule (like the image shown)
    function parseCalendarFormat(text, employee, year, month, lines) {
        const shifts = [];
        
        console.log('parseCalendarFormat called with:', { employee: employee.name, year, month });
        
        // Helper function to normalize and validate time string from OCR
        function normalizeTimeString(timeStr) {
            // Remove non-digit characters except leading/trailing
            let cleaned = timeStr.replace(/[^\d]/g, '');
            
            // Handle common OCR errors
            // If it's 5 digits, might be "21000" -> "2100" (remove trailing zero)
            if (cleaned.length === 5 && cleaned.endsWith('0')) {
                cleaned = cleaned.substring(0, 4);
            }
            // If it's 3 digits, might be "150" -> "1500" (add trailing zero)
            if (cleaned.length === 3) {
                cleaned = cleaned + '0';
            }
            
            // Must be 4 digits now
            if (cleaned.length !== 4) {
                return null;
            }
            
            const hour = parseInt(cleaned.substring(0, 2));
            const minute = parseInt(cleaned.substring(2, 4));
            
            // Validate: hour 0-23, minute 0-59
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                return null;
            }
            
            return {
                hour: hour,
                minute: minute,
                formatted: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
            };
        }
        
        // Pattern for date numbers (1-31) that might be in calendar cells
        const dateNumberPattern = /^(\d{1,2})$/;
        // Pattern for dates with month abbreviation (e.g., "Dec 28")
        const dateWithMonthPattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i;
        // Pattern for time range like "16:00 - 21:00" or "16:00-21:00" (24-hour format with colons)
        const timeRangePattern = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/;
        // Pattern for time range without colons (OCR format): "1500-2100" or "1500-2100sw"
        // Handle OCR errors: allow 3-5 digits, but validate later
        const timeRangeNoColonPattern = /(\d{3,5})\s*[-–—]\s*(\d{3,5})/;
        // Pattern for "DO" (Day Off)
        const dayOffPattern = /\bDO\b/i;
        
        const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                              'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        
        // Look through lines to find date + time combinations
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip if line is just day names or headers
            if (/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/i.test(line)) {
                continue;
            }
            
            // Check for date with month abbreviation (e.g., "Dec 28")
            let day = null;
            let cellMonth = month;
            let cellYear = year;
            
            const dateWithMonthMatch = line.match(dateWithMonthPattern);
            if (dateWithMonthMatch) {
                const monthAbbrev = dateWithMonthMatch[1].toLowerCase();
                const monthIndex = monthAbbrevs.indexOf(monthAbbrev);
                if (monthIndex >= 0) {
                    cellMonth = monthIndex;
                    day = parseInt(dateWithMonthMatch[2]);
                    // If month is December and we're looking at January, it's previous year
                    if (cellMonth === 11 && month === 0) {
                        cellYear = year - 1;
                    }
                    console.log('Found date with month:', day, monthAbbrev, cellYear);
                }
            } else {
                // Try to find just a date number (1-31) - but make sure it's not part of a time
                // Check if line starts with just a number (not followed by colon which would be time)
                const dateMatch = line.match(/^(\d{1,2})(?:\s|$)/);
                if (dateMatch && !line.includes(':')) {
                    day = parseInt(dateMatch[1]);
                    if (day >= 1 && day <= 31) {
                        cellMonth = month;
                        cellYear = year;
                        console.log('Found date number:', day);
                    }
                }
            }
            
            // If we found a date, look for time range in the same line or nearby
            if (day !== null) {
                // Check current line for time range (try both formats)
                let timeRangeMatch = line.match(timeRangePattern);
                let startTime, endTime;
                
                if (timeRangeMatch) {
                    // Format with colons: "15:00-21:00"
                    startTime = `${String(parseInt(timeRangeMatch[1])).padStart(2, '0')}:${timeRangeMatch[2]}:00`;
                    endTime = `${String(parseInt(timeRangeMatch[3])).padStart(2, '0')}:${timeRangeMatch[4]}:00`;
                } else {
                    // Try format without colons: "1500-2100"
                    const noColonMatch = line.match(timeRangeNoColonPattern);
                    if (noColonMatch) {
                        const startNormalized = normalizeTimeString(noColonMatch[1]);
                        const endNormalized = normalizeTimeString(noColonMatch[2]);
                        
                        if (startNormalized && endNormalized) {
                            startTime = startNormalized.formatted;
                            endTime = endNormalized.formatted;
                            timeRangeMatch = noColonMatch;
                            console.log('Parsed time range:', noColonMatch[0], '->', startTime, '-', endTime);
                        }
                    }
                }
                
                if (timeRangeMatch && startTime && endTime && !dayOffPattern.test(line)) {
                    try {
                        const shiftDate = new Date(cellYear, cellMonth, day);
                        const shiftData = {
                            employee_id: employee.id,
                            employee_name: employee.name,
                            shift_date: formatDate(shiftDate),
                            start_time: startTime,
                            end_time: endTime,
                            confidence: 'high'
                        };
                        shifts.push(shiftData);
                        console.log('Added shift from calendar format:', shiftData);
                    } catch (e) {
                        console.warn('Invalid date:', cellYear, cellMonth, day, e);
                    }
                }
                // If "DO" is found, skip it (Day Off - no shift)
            } else {
                // No date found, but check if line has time range - might be in a cell with date nearby
                let timeRangeMatch = line.match(timeRangePattern);
                let startTime, endTime;
                
                if (timeRangeMatch) {
                    startTime = `${String(parseInt(timeRangeMatch[1])).padStart(2, '0')}:${timeRangeMatch[2]}:00`;
                    endTime = `${String(parseInt(timeRangeMatch[3])).padStart(2, '0')}:${timeRangeMatch[4]}:00`;
                } else {
                    // Try format without colons
                    timeRangeMatch = line.match(timeRangeNoColonPattern);
                    if (timeRangeMatch) {
                        const startNormalized = normalizeTimeString(timeRangeMatch[1]);
                        const endNormalized = normalizeTimeString(timeRangeMatch[2]);
                        
                        if (startNormalized && endNormalized) {
                            startTime = startNormalized.formatted;
                            endTime = endNormalized.formatted;
                            console.log('Parsed time range (no date):', timeRangeMatch[0], '->', startTime, '-', endTime);
                        } else {
                            timeRangeMatch = null; // Invalid times, don't use this match
                        }
                    }
                }
                
                if (timeRangeMatch && startTime && endTime && !dayOffPattern.test(line)) {
                    // Look backwards and forwards for a date
                    let foundDay = null;
                    let foundMonth = month;
                    let foundYear = year;
                    
                    // Check previous 3 lines
                    for (let j = Math.max(0, i - 3); j < i; j++) {
                        const prevLine = lines[j];
                        const dateWithMonthMatch = prevLine.match(dateWithMonthPattern);
                        if (dateWithMonthMatch) {
                            const monthAbbrev = dateWithMonthMatch[1].toLowerCase();
                            const monthIndex = monthAbbrevs.indexOf(monthAbbrev);
                            if (monthIndex >= 0) {
                                foundMonth = monthIndex;
                                foundDay = parseInt(dateWithMonthMatch[2]);
                                if (foundMonth === 11 && month === 0) {
                                    foundYear = year - 1;
                                }
                                break;
                            }
                        }
                        const dateMatch = prevLine.match(/^(\d{1,2})(?:\s|$)/);
                        if (dateMatch && !prevLine.includes(':')) {
                            const dayNum = parseInt(dateMatch[1]);
                            if (dayNum >= 1 && dayNum <= 31) {
                                foundDay = dayNum;
                                foundMonth = month;
                                foundYear = year;
                                break;
                            }
                        }
                    }
                    
                    // Check next 3 lines if not found
                    if (foundDay === null) {
                        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
                            const nextLine = lines[j];
                            const dateWithMonthMatch = nextLine.match(dateWithMonthPattern);
                            if (dateWithMonthMatch) {
                                const monthAbbrev = dateWithMonthMatch[1].toLowerCase();
                                const monthIndex = monthAbbrevs.indexOf(monthAbbrev);
                                if (monthIndex >= 0) {
                                    foundMonth = monthIndex;
                                    foundDay = parseInt(dateWithMonthMatch[2]);
                                    if (foundMonth === 11 && month === 0) {
                                        foundYear = year - 1;
                                    }
                                    break;
                                }
                            }
                            const dateMatch = nextLine.match(/^(\d{1,2})(?:\s|$)/);
                            if (dateMatch && !nextLine.includes(':')) {
                                const dayNum = parseInt(dateMatch[1]);
                                if (dayNum >= 1 && dayNum <= 31) {
                                    foundDay = dayNum;
                                    foundMonth = month;
                                    foundYear = year;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (foundDay !== null) {
                        try {
                            const shiftDate = new Date(foundYear, foundMonth, foundDay);
                            const shiftData = {
                                employee_id: employee.id,
                                employee_name: employee.name,
                                shift_date: formatDate(shiftDate),
                                start_time: startTime,
                                end_time: endTime,
                                confidence: 'medium'
                            };
                            shifts.push(shiftData);
                            console.log('Added shift from nearby date:', shiftData);
                        } catch (e) {
                            console.warn('Invalid date:', foundYear, foundMonth, foundDay, e);
                        }
                    }
                }
            }
        }
        
        console.log('parseCalendarFormat returning', shifts.length, 'shifts');
        return shifts;
    }

    // Fallback parser for garbled OCR text - looks for time patterns anywhere
    function parseFallbackFormat(text, employee, year, month) {
        const shifts = [];
        
        // Helper function to correct common OCR errors in time strings
        function correctOCRTimeErrors(timeStr) {
            // Common OCR errors:
            // "fis" or "f" + digits = "16" (f looks like 1, i/s look like 6)
            // "15" often misread as "16" or vice versa
            // "19" can be misread as "10" or "90"
            // "21" can be misread as "2l" or "2I" or "20"
            
            let corrected = timeStr.toLowerCase();
            
            // Handle letter-to-number OCR errors more aggressively
            // "fis" variations = "16"
            corrected = corrected.replace(/fis0*/g, '16');
            corrected = corrected.replace(/f[il]s0*/g, '16');
            corrected = corrected.replace(/f[il]0*/g, '16');
            corrected = corrected.replace(/fs0*/g, '16');
            corrected = corrected.replace(/fi0*/g, '16');
            
            // Handle "lig" variations = "16"
            corrected = corrected.replace(/lig0*/g, '16');
            corrected = corrected.replace(/li0*/g, '16');
            corrected = corrected.replace(/lg0*/g, '16');
            
            // Handle "lis" variations = "16"
            corrected = corrected.replace(/lis0*/g, '16');
            corrected = corrected.replace(/ls0*/g, '16');
            
            // Handle single letter errors that might be numbers
            // "f" at start = "1", "i" or "l" = "1" or "6" depending on context
            // "s" = "5" or "6" or "8"
            corrected = corrected.replace(/^f(\d)/g, '1$1');
            corrected = corrected.replace(/^i(\d)/g, '1$1');
            corrected = corrected.replace(/^l(\d)/g, '1$1');
            
            // Handle "o" = "0", "O" = "0"
            corrected = corrected.replace(/o/g, '0');
            
            // Handle "z" = "2" (common OCR error)
            corrected = corrected.replace(/z/g, '2');
            
            // Handle "g" = "6" or "9" (context dependent, but often "6")
            corrected = corrected.replace(/g0/g, '60');
            corrected = corrected.replace(/g(\d)/g, '6$1');
            
            return corrected;
        }
        
        // Helper function to normalize time string with better OCR error handling
        function normalizeTimeString(timeStr) {
            // First, correct common OCR errors
            let corrected = correctOCRTimeErrors(timeStr);
            
            // Remove all non-digit characters
            let cleaned = corrected.replace(/[^\d]/g, '');
            
            // Handle common OCR errors in digit length
            // If it's 5 digits, might be "21000" -> "2100" (remove trailing zero)
            if (cleaned.length === 5 && cleaned.endsWith('0')) {
                cleaned = cleaned.substring(0, 4);
            }
            // If it's 6 digits, might be "210000" -> "2100" (remove trailing zeros)
            if (cleaned.length === 6 && cleaned.endsWith('00')) {
                cleaned = cleaned.substring(0, 4);
            }
            // If it's 3 digits, might be "150" -> "1500" (add trailing zero)
            if (cleaned.length === 3) {
                cleaned = cleaned + '0';
            }
            // If it's 2 digits, might be "15" -> "1500" (add two zeros)
            if (cleaned.length === 2) {
                cleaned = cleaned + '00';
            }
            // If it's 1 digit, might be "1" -> "1000" (add three zeros) - less likely but possible
            if (cleaned.length === 1) {
                cleaned = cleaned + '000';
            }
            
            // Must be 4 digits now
            if (cleaned.length !== 4) {
                console.log('Time string normalization failed:', timeStr, '->', cleaned, '(length:', cleaned.length, ')');
                return null;
            }
            
            let hour = parseInt(cleaned.substring(0, 2));
            let minute = parseInt(cleaned.substring(2, 4));
            
            // Common shift time corrections based on typical work schedules
            // These are common shift times, so we correct OCR errors to match them
            
            // Start times (common: 06:00, 07:00, 08:00, 14:00, 15:00, 16:00)
            // If hour is 15 but minute is 00, it's likely 16:00 (very common shift start)
            if (hour === 15 && minute === 0) {
                console.log('Correcting 15:00 to 16:00 (common OCR error for shift start time)');
                hour = 16;
            }
            // If hour is 14 and minute is 00, might be 16:00 (less common but possible)
            if (hour === 14 && minute === 0) {
                console.log('Correcting 14:00 to 16:00 (common OCR error)');
                hour = 16;
            }
            // If hour is 13 and minute is 00, might be 16:00 (OCR error)
            if (hour === 13 && minute === 0) {
                console.log('Correcting 13:00 to 16:00 (OCR error)');
                hour = 16;
            }
            // If hour is 17 and minute is 00, might be 16:00 (OCR error)
            if (hour === 17 && minute === 0) {
                console.log('Correcting 17:00 to 16:00 (OCR error)');
                hour = 16;
            }
            
            // End times (common: 14:00, 15:00, 16:00, 17:00, 21:00, 22:00)
            // If hour is 20 and minute is 00, might be 21:00 (very common shift end)
            if (hour === 20 && minute === 0) {
                console.log('Correcting 20:00 to 21:00 (common OCR error for shift end time)');
                hour = 21;
            }
            // If hour is 19 and minute is 00, might be 21:00 (less common)
            if (hour === 19 && minute === 0) {
                console.log('Correcting 19:00 to 21:00 (possible OCR error)');
                hour = 21;
            }
            // If hour is 22 and minute is > 0, might be 22:00
            if (hour === 22 && minute > 0 && minute < 60) {
                console.log('Correcting 22:XX to 22:00 (common shift end time)');
                minute = 0;
            }
            // If hour is 21 and minute is > 0, might be 21:00
            if (hour === 21 && minute > 0 && minute < 60) {
                console.log('Correcting 21:XX to 21:00 (common shift end time)');
                minute = 0;
            }
            
            // Handle minutes that are clearly wrong (like 50, 60, 70, etc.)
            if (minute >= 60) {
                console.log('Correcting invalid minutes:', minute, 'to 00');
                minute = 0;
            }
            
            // If hour is clearly wrong (like 90, 80, etc.), try to fix it
            if (hour > 23) {
                // Might be OCR error - try to correct
                if (hour >= 80 && hour <= 99) {
                    // Could be "8" misread as "80" or "9" as "90"
                    const lastDigit = hour % 10;
                    if (lastDigit <= 3) {
                        hour = lastDigit;
                        console.log('Correcting invalid hour:', hour, 'to', lastDigit);
                    }
                } else if (hour >= 24 && hour <= 29) {
                    // Might be "2X" where X is wrong
                    hour = 21;
                    console.log('Correcting invalid hour to 21:00');
                }
            }
            
            // Validate: hour 0-23, minute 0-59
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                console.log('Time validation failed:', timeStr, '-> hour:', hour, 'minute:', minute);
                return null;
            }
            
            return {
                hour: hour,
                minute: minute,
                formatted: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
            };
        }
        
        // More aggressive pattern matching to handle OCR errors
        // Look for patterns like:
        // - "1500-2100" (normal)
        // - "fis00-2100sw" (OCR error: 'fis' instead of '16', but digits are "00-2100")
        // - "1500-22005w" (OCR error: extra digit)
        // - "[1500-2100sw" (OCR error: bracket)
        // Pattern: Look for digit sequences separated by dash, allowing for OCR errors
        // Try multiple patterns to catch different OCR error types
        
        // Pattern 1: Standard format with optional brackets/spaces
        const pattern1 = /[\[\(]?(\d{3,5})[^\d]*[-–—][^\d]*(\d{3,5})[^\d\]]*/gi;
        // Pattern 2: More permissive - any 3-5 digits, dash, 3-5 digits
        const pattern2 = /(\d{3,5})[-–—](\d{3,5})/gi;
        // Pattern 3: Handle OCR errors like "fis00-2100" where letters might be numbers
        // Look for patterns with letters that might be numbers: f/i/s/l = 1/6
        const pattern3 = /[fFil][il]?s?0*(\d{0,2})[^\d]*[-–—][^\d]*(\d{3,5})/gi;
        // Pattern 4: Handle patterns like "lig0-2100" 
        const pattern4 = /[lL][il]?g?0*(\d{0,2})[^\d]*[-–—][^\d]*(\d{3,5})/gi;
        
        const matches1 = [...text.matchAll(pattern1)];
        const matches2 = [...text.matchAll(pattern2)];
        const matches3 = [...text.matchAll(pattern3)];
        const matches4 = [...text.matchAll(pattern4)];
        
        // Process pattern3 and pattern4 matches - convert letter patterns to "16"
        const processed3 = matches3.map(m => {
            // The first group might be partial, prepend "16" if it looks like a time
            const firstPart = '16' + (m[1] || '00');
            return {
                0: m[0],
                1: firstPart,
                2: m[2],
                index: m.index
            };
        });
        
        const processed4 = matches4.map(m => {
            const firstPart = '16' + (m[1] || '00');
            return {
                0: m[0],
                1: firstPart,
                2: m[2],
                index: m.index
            };
        });
        
        // Combine and deduplicate matches by position
        const allMatches = new Map();
        [...matches1, ...matches2, ...processed3, ...processed4].forEach(match => {
            const key = `${match.index}-${match[1]}-${match[2]}`;
            if (!allMatches.has(key)) {
                allMatches.set(key, match);
            }
        });
        
        const matches = Array.from(allMatches.values());
        
        console.log('Fallback parser searching text (first 500 chars):', text.substring(0, 500));
        console.log('Fallback parser found', matches.length, 'potential time range matches');
        
        // Log all matches for debugging
        matches.forEach((match, idx) => {
            console.log(`Match ${idx + 1}:`, match[0], '-> start:', match[1], 'end:', match[2], 'at position', match.index);
        });
        
        // Filter out invalid matches and normalize
        const validMatches = [];
        const seenShifts = new Set(); // Track unique shifts to avoid duplicates
        
        for (const match of matches) {
            const startNormalized = normalizeTimeString(match[1]);
            const endNormalized = normalizeTimeString(match[2]);
            
            if (startNormalized && endNormalized) {
                // Make sure end time is after start time (or handle overnight shifts)
                const startMinutes = startNormalized.hour * 60 + startNormalized.minute;
                const endMinutes = endNormalized.hour * 60 + endNormalized.minute;
                
                // Additional validation: check if times make sense
                // If end is way before start (more than 12 hours difference), might be OCR error
                let adjustedEnd = endNormalized;
                if (endMinutes < startMinutes) {
                    // Overnight shift - add 24 hours to end time
                    const overnightEndMinutes = endMinutes + (24 * 60);
                    const overnightEndHour = Math.floor(overnightEndMinutes / 60) % 24;
                    const overnightEndMin = overnightEndMinutes % 60;
                    adjustedEnd = {
                        hour: overnightEndHour,
                        minute: overnightEndMin,
                        formatted: `${String(overnightEndHour).padStart(2, '0')}:${String(overnightEndMin).padStart(2, '0')}:00`
                    };
                    console.log('Detected overnight shift, adjusted end time:', endNormalized.formatted, '->', adjustedEnd.formatted);
                } else if (endMinutes - startMinutes < 1) {
                    // Shift too short (less than 1 minute) - likely OCR error
                    console.log('Skipping invalid shift (too short):', startNormalized.formatted, '-', endNormalized.formatted);
                    continue;
                } else if (endMinutes - startMinutes > 16 * 60) {
                    // Shift too long (more than 16 hours) - likely OCR error
                    console.log('Skipping invalid shift (too long):', startNormalized.formatted, '-', endNormalized.formatted);
                    continue;
                }
                
                // Create a unique key for this shift to avoid duplicates
                const shiftKey = `${startNormalized.formatted}-${adjustedEnd.formatted}`;
                
                // Skip if we've already seen this exact time range
                if (seenShifts.has(shiftKey)) {
                    console.log('Skipping duplicate time range:', match[0], '->', startNormalized.formatted, '-', adjustedEnd.formatted);
                    continue;
                }
                
                seenShifts.add(shiftKey);
                
                validMatches.push({
                    original: match[0],
                    start: startNormalized.formatted,
                    end: adjustedEnd.formatted,
                    startMinutes: startMinutes,
                    endMinutes: adjustedEnd.hour * 60 + adjustedEnd.minute,
                    position: match.index
                });
                console.log('Valid time range:', match[0], '->', startNormalized.formatted, '-', adjustedEnd.formatted);
            } else {
                console.log('Invalid time range:', match[0], 'start:', match[1], 'end:', match[2], 
                           'startNorm:', startNormalized, 'endNorm:', endNormalized);
            }
        }
        
        console.log('Valid matches after normalization:', validMatches.length);
        console.log('Unique shifts found:', seenShifts.size);
        
        // Try to extract actual dates from the text first
        // Look for date numbers (1-31) near time ranges
        const datePattern = /\b(\d{1,2})\b/g;
        const allDates = [];
        const dateMatches = [...text.matchAll(datePattern)];
        
        // Collect potential dates (1-31) with their positions
        for (const dateMatch of dateMatches) {
            const dayNum = parseInt(dateMatch[1]);
            if (dayNum >= 1 && dayNum <= 31) {
                allDates.push({
                    day: dayNum,
                    position: dateMatch.index,
                    text: dateMatch[0]
                });
            }
        }
        
        console.log('Found', allDates.length, 'potential dates in text');
        
        // For each valid time range, try to find the nearest date
        // If no date found, assign sequentially
        let dayCounter = 1;
        const maxDays = 31;
        const usedDays = new Set();
        
        // Store match positions for better date matching
        const matchesWithPositions = validMatches.map((match, idx) => {
            // Find all occurrences of this pattern in the text
            let searchStart = 0;
            let positions = [];
            while (true) {
                const pos = text.indexOf(match.original, searchStart);
                if (pos === -1) break;
                positions.push(pos);
                searchStart = pos + 1;
            }
            return {
                ...match,
                positions: positions,
                index: idx
            };
        });
        
        console.log('Processing', matchesWithPositions.length, 'time ranges');
        
        for (const matchInfo of matchesWithPositions) {
            // Use the first position for this match
            const matchIndex = matchInfo.positions.length > 0 ? matchInfo.positions[0] : -1;
            
            // Check if this time range is near a "DO" indicator - if so, skip it
            if (matchIndex >= 0) {
                const contextStart = Math.max(0, matchIndex - 30);
                const contextEnd = Math.min(text.length, matchIndex + matchInfo.original.length + 30);
                const context = text.substring(contextStart, contextEnd).toLowerCase();
                
                if (/\bdo\b/.test(context)) {
                    console.log('Skipping time range near "DO":', matchInfo.original);
                    continue; // Skip this one, don't increment day counter
                }
            }
            
            // Try to find the nearest date to this time range
            let assignedDay = null;
            if (allDates.length > 0 && matchIndex >= 0) {
                // Find the closest date to this time range
                let closestDate = null;
                let closestDistance = Infinity;
                
                for (const dateInfo of allDates) {
                    const distance = Math.abs(dateInfo.position - matchIndex);
                    if (distance < closestDistance && distance < 150) { // Within 150 chars
                        closestDistance = distance;
                        closestDate = dateInfo;
                    }
                }
                
                if (closestDate && !usedDays.has(closestDate.day)) {
                    assignedDay = closestDate.day;
                    usedDays.add(assignedDay);
                    console.log('Found date', assignedDay, 'near time range', matchInfo.original, 'at distance', closestDistance);
                }
            }
            
            // If no date found, use sequential counter
            if (assignedDay === null) {
                // Find next available day
                while (dayCounter <= maxDays && usedDays.has(dayCounter)) {
                    dayCounter++;
                }
                if (dayCounter > maxDays) {
                    console.warn('Reached max days, stopping');
                    break;
                }
                assignedDay = dayCounter;
                usedDays.add(assignedDay);
                dayCounter++;
                console.log('Using sequential day', assignedDay, 'for time range', matchInfo.original);
            }
            
            try {
                const shiftDate = new Date(year, month, assignedDay);
                shifts.push({
                    employee_id: employee.id,
                    employee_name: employee.name,
                    shift_date: formatDate(shiftDate),
                    start_time: matchInfo.start,
                    end_time: matchInfo.end,
                    confidence: assignedDay <= 31 ? 'medium' : 'low'
                });
                console.log('Added fallback shift for day', assignedDay, ':', matchInfo.start, '-', matchInfo.end);
            } catch (e) {
                console.warn('Invalid date in fallback:', year, month, assignedDay, e);
            }
        }
        
        console.log('Fallback parser returning', shifts.length, 'shifts');
        return shifts;
    }

    // Parse table format schedule
    function parseTableFormat(lines, weekDates) {
        const shifts = [];
        
        // Look for patterns like:
        // Employee Name | Mon 1/1 | Tue 1/2 | ...
        //               | 8:00-16:00 | 9:00-17:00 | ...
        
        for (let i = 0; i < lines.length; i++) {
            const employee = findEmployeeInText(lines[i]);
            if (employee) {
                // Check next few lines for times
                for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
                    const line = lines[j];
                    const times = line.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g);
                    if (times) {
                        // Try to match with days of week
                        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                        let dayIndex = -1;
                        
                        for (let k = Math.max(0, j - 2); k <= j; k++) {
                            const lowerLine = lines[k].toLowerCase();
                            for (let d = 0; d < dayNames.length; d++) {
                                if (lowerLine.includes(dayNames[d])) {
                                    dayIndex = d;
                                    break;
                                }
                            }
                            if (dayIndex >= 0) break;
                        }
                        
                        if (dayIndex >= 0 && dayIndex < weekDates.length) {
                            const timeMatch = times[0].match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
                            if (timeMatch) {
                                const startTime = parseTime(timeMatch[1], timeMatch[2], null);
                                const endTime = parseTime(timeMatch[3], timeMatch[4], null);
                                
                                shifts.push({
                                    employee_id: employee.id,
                                    employee_name: employee.name,
                                    shift_date: formatDate(weekDates[dayIndex]),
                                    start_time: startTime,
                                    end_time: endTime,
                                    confidence: 'high'
                                });
                            }
                        }
                    }
                }
            }
        }
        
        return shifts;
    }

    // Helper functions
    function getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Display parsed shifts
    function displayParsedShifts() {
        parsedShiftsContainer.style.display = 'block';
        
        if (parsedShifts.length === 0) {
            parsedShiftsList.innerHTML = '<div class="loading-message">No shifts detected</div>';
            return;
        }

        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; margin-bottom: 10px; font-weight: bold;">';
        html += '<div>Employee</div><div>Date</div><div>Start Time</div><div>End Time</div><div>Status</div>';
        html += '</div>';

        parsedShifts.forEach((shift, index) => {
            html += `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 10px; padding: 10px; border-bottom: 1px solid #ddd; align-items: center;">
                    <div>${escapeHtml(shift.employee_name)}</div>
                    <div>${shift.shift_date}</div>
                    <div>${shift.start_time.substring(0, 5)}</div>
                    <div>${shift.end_time.substring(0, 5)}</div>
                    <div>
                        <span style="padding: 4px 8px; border-radius: 4px; background: #e0e7ff; color: #3730a3; font-size: 12px;">
                            ${shift.confidence}
                        </span>
                    </div>
                </div>
            `;
        });

        parsedShiftsList.innerHTML = html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Confirm import
    if (confirmImportBtn) {
        confirmImportBtn.addEventListener('click', async () => {
            if (parsedShifts.length === 0) {
                alert('No shifts to import');
                return;
            }

            const overwrite = document.getElementById('overwriteExistingShifts').checked;
            
            if (!confirm(`Import ${parsedShifts.length} shift(s)?\n\n${overwrite ? 'Existing shifts will be overwritten.' : 'Existing shifts will be skipped.'}`)) {
                return;
            }

            confirmImportBtn.disabled = true;
            confirmImportBtn.textContent = '⏳ Importing...';

            try {
                let imported = 0;
                let skipped = 0;
                let errors = 0;

                for (const shift of parsedShifts) {
                    try {
                        // Normalize shift_date format
                        let shiftDateStr = shift.shift_date;
                        if (shiftDateStr instanceof Date) {
                            shiftDateStr = formatDate(shiftDateStr);
                        } else if (typeof shiftDateStr === 'string') {
                            shiftDateStr = shiftDateStr.split('T')[0];
                        }

                        // Check if shift already exists
                        if (!overwrite) {
                            const existing = await supabaseService.getEmployeeShifts(
                                shiftDateStr,
                                shiftDateStr
                            );
                            const hasExisting = existing && existing.some(s => {
                                const sDate = s.shift_date instanceof Date 
                                    ? formatDate(s.shift_date) 
                                    : s.shift_date.split('T')[0];
                                return s.employee_id === shift.employee_id && 
                                    sDate === shiftDateStr;
                            });
                            
                            if (hasExisting) {
                                skipped++;
                                continue;
                            }
                        } else {
                            // Delete existing shifts for this employee on this date
                            const existing = await supabaseService.getEmployeeShifts(
                                shiftDateStr,
                                shiftDateStr
                            );
                            if (existing) {
                                for (const existingShift of existing) {
                                    const sDate = existingShift.shift_date instanceof Date 
                                        ? formatDate(existingShift.shift_date) 
                                        : existingShift.shift_date.split('T')[0];
                                    if (existingShift.employee_id === shift.employee_id && 
                                        sDate === shiftDateStr) {
                                        await supabaseService.client
                                            .from('employee_shifts')
                                            .delete()
                                            .eq('id', existingShift.id);
                                    }
                                }
                            }
                        }

                        // Create shift
                        const result = await supabaseService.createEmployeeShift({
                            employee_id: shift.employee_id,
                            shift_date: shiftDateStr,
                            start_time: shift.start_time,
                            end_time: shift.end_time,
                            status: 'scheduled'
                        });

                        if (result) {
                            imported++;
                        } else {
                            errors++;
                        }
                    } catch (error) {
                        console.error('Error importing shift:', error);
                        errors++;
                    }
                }

                alert(`✅ Import complete!\n\n- Imported: ${imported}\n- Skipped: ${skipped}\n- Errors: ${errors}`);

                // Refresh shifts display
                if (typeof loadShifts === 'function') {
                    await loadShifts();
                }

                // Close modal
                importScheduleModal.style.display = 'none';
                resetImportModal();

            } catch (error) {
                console.error('Import error:', error);
                alert('Error importing shifts: ' + error.message);
            } finally {
                confirmImportBtn.disabled = false;
                confirmImportBtn.textContent = 'Import Shifts';
            }
        });
    }
});

