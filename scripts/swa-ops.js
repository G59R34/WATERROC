// SWA OPS - SimBrief Integration
// ===============================

document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'employee') {
        window.location.href = 'index.html';
        return;
    }

    // Wait for Supabase to be ready
    let initAttempts = 0;
    async function waitForSupabase() {
        return new Promise((resolve) => {
            const checkSupabase = () => {
                initAttempts++;
                if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
                    console.log('✅ Supabase is ready after', initAttempts, 'attempts');
                    resolve(true);
                } else if (initAttempts >= 50) {
                    console.error('❌ Supabase failed to load after 50 attempts');
                    resolve(false);
                } else {
                    console.log('⏳ Waiting for Supabase... attempt', initAttempts);
                    setTimeout(checkSupabase, 100);
                }
            };
            checkSupabase();
        });
    }

    // Wait for Supabase to initialize
    const supabaseReady = await waitForSupabase();
    if (!supabaseReady) {
        showError('⚠️ Connection error. Please refresh the page.');
        return;
    }

    // Check Supabase authentication
    const session = await supabaseService.getSession();
    if (!session) {
        sessionStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    // Load current user
    await supabaseService.loadCurrentUser();

    // Load saved username
    const savedUsername = localStorage.getItem('simbrief_username');
    if (savedUsername) {
        document.getElementById('simbriefUsername').value = savedUsername;
    }

    // Elements
    const usernameInput = document.getElementById('simbriefUsername');
    const fetchBtn = document.getElementById('fetchFlightBtn');
    const saveUsernameBtn = document.getElementById('saveUsernameBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const flightDataContainer = document.getElementById('flightDataContainer');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const noDataMessage = document.getElementById('noDataMessage');

    // Cache for current employee
    let currentEmployeeData = null;

    // Helper function to get current employee
    async function getCurrentEmployee() {
        if (currentEmployeeData) {
            console.log('Using cached employee data:', currentEmployeeData);
            return currentEmployeeData;
        }

        // Wait for Supabase if not ready
        if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
            console.log('⏳ Supabase not ready, waiting...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (typeof supabaseService === 'undefined' || !supabaseService.isReady()) {
                console.error('❌ SupabaseService is not available');
                return null;
            }
        }

        try {
            console.log('Fetching current user...');
            const currentUser = await supabaseService.getCurrentUser();
            console.log('Current user:', currentUser);
            
            if (!currentUser) {
                console.warn('No current user found - user may not be logged in');
                return null;
            }

            console.log('Fetching employees...');
            const employees = await supabaseService.getEmployees();
            console.log('Employees found:', employees?.length || 0);
            
            if (!employees || employees.length === 0) {
                console.warn('No employees found in database');
                return null;
            }

            console.log('Looking for employee with user_id:', currentUser.id);
            currentEmployeeData = employees.find(e => e.user_id === currentUser.id);
            
            if (!currentEmployeeData) {
                console.warn('No employee record found matching current user. Available employees:', employees.map(e => ({ id: e.id, name: e.name, user_id: e.user_id })));
            } else {
                console.log('Found employee:', currentEmployeeData);
            }
            
            return currentEmployeeData;
        } catch (error) {
            console.error('Error getting current employee:', error);
            return null;
        }
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
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
    }

    // Save username
    if (saveUsernameBtn) {
        saveUsernameBtn.addEventListener('click', function() {
            const username = usernameInput.value.trim();
            if (username) {
                localStorage.setItem('simbrief_username', username);
                showSuccess('Username saved successfully!');
            } else {
                showError('Please enter a valid username');
            }
        });
    }

    // Fetch flight data
    if (fetchBtn) {
        fetchBtn.addEventListener('click', async function() {
            const username = usernameInput.value.trim();
            if (!username) {
                showError('Please enter your SimBrief username');
                return;
            }

            await fetchFlightData(username);
        });
    }

    // Show initial message if no data
    if (!savedUsername) {
        noDataMessage.style.display = 'block';
    }

    async function fetchFlightData(username) {
        hideMessages();
        loadingSpinner.style.display = 'block';
        flightDataContainer.style.display = 'none';
        noDataMessage.style.display = 'none';
        fetchBtn.disabled = true;

        if (typeof showDataLoadingScreen !== 'undefined') {
            showDataLoadingScreen('SimBrief flight data');
        }

        try {
            // SimBrief API endpoint
            const apiUrl = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}&json=1`;
            
            console.log('Fetching SimBrief data from:', apiUrl);
            
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            console.log('SimBrief data received:', data);
            console.log('SimBrief times object:', data.times);
            console.log('SimBrief general object:', data.general);
            console.log('SimBrief params object:', data.params);
            
            // Log all available time-related fields
            if (data.times) {
                console.log('Available time fields:', Object.keys(data.times));
            }
            if (data.general) {
                console.log('Available general fields:', Object.keys(data.general));
            }

            if (data && data.origin && data.destination) {
                displayFlightData(data);
                
                // Calculate estimated times for display message
                const flightDistance = parseFloat(data.general?.route_distance) || 
                                      parseFloat(data.general?.distance) ||
                                      parseFloat(data.params?.distance) ||
                                      0;
                const cruiseSpeed = parseFloat(data.aircraft?.cruise_speed) ||
                                   parseFloat(data.general?.cruise_tas) ||
                                   450;
                let flightMinutes = 0;
                if (flightDistance > 0 && cruiseSpeed > 0) {
                    flightMinutes = Math.round((flightDistance / cruiseSpeed) * 60) + 30;
                } else {
                    flightMinutes = 120;
                }
                
                const now = new Date();
                const depTime = { hours: now.getHours(), minutes: now.getMinutes() };
                const arrTime = addTime(depTime, flightMinutes);
                
                // Show button to create tasks
                const createTasksBtn = document.getElementById('createTasksBtn');
                if (createTasksBtn) {
                    createTasksBtn.style.display = 'inline-block';
                    createTasksBtn.onclick = () => createTasksFromFlightPlan(data);
                }
                
                showSuccess(`Flight information loaded successfully! Estimated times: ${formatTimeForTask(depTime)} - ${formatTimeForTask(arrTime)} (${Math.floor(flightMinutes / 60)}h ${flightMinutes % 60}m). Click "Create Tasks from Flight Plan" to add tasks.`);
            } else {
                throw new Error('Invalid flight data received from SimBrief');
            }
        } catch (error) {
            console.error('Error fetching SimBrief data:', error);
            showError(`Failed to fetch flight data: ${error.message}. Please verify your SimBrief username is correct.`);
            noDataMessage.style.display = 'block';
        } finally {
            loadingSpinner.style.display = 'none';
            fetchBtn.disabled = false;
        }
    }

    async function createTasksFromFlightPlan(flightData) {
        // Show confirmation
        const origin = flightData.origin?.icao_code || flightData.origin?.iata_code || 'N/A';
        const destination = flightData.destination?.icao_code || flightData.destination?.iata_code || 'N/A';
        const flightNumber = flightData.general?.flight_number || `${origin}-${destination}`;
        
        if (!confirm(`Create tasks for flight ${flightNumber} (${origin} → ${destination})?\n\nThis will create:\n- Pre-Flight Briefing (90 min before departure)\n- Flight Operations (during flight)\n- Post-Flight Debriefing (60 min after arrival)`)) {
            return;
        }

        if (typeof showActionLoadingScreen !== 'undefined') {
            showActionLoadingScreen('creating flight tasks');
        }

        try {
            // Get current employee using helper function
            const employee = await getCurrentEmployee();
            
            if (!employee) {
                showError('Unable to find your employee record. Please ensure you are logged in and have an active employee profile.');
                console.error('Employee lookup failed. Current user:', await supabaseService.getCurrentUser());
                return;
            }

            console.log('Found employee:', employee);

            // Calculate estimated times based on current time and flight distance
            console.log('Calculating estimated flight times based on distance...');
            
            // Get flight distance from SimBrief data
            const flightDistance = parseFloat(flightData.general?.route_distance) || 
                                  parseFloat(flightData.general?.distance) ||
                                  parseFloat(flightData.params?.distance) ||
                                  0;
            
            console.log('Flight distance (nm):', flightDistance);
            
            // Get aircraft cruise speed (default to 450 kts if not available)
            const cruiseSpeed = parseFloat(flightData.aircraft?.cruise_speed) ||
                               parseFloat(flightData.general?.cruise_tas) ||
                               450; // Default to 450 knots
            
            console.log('Aircraft cruise speed (kts):', cruiseSpeed);
            
            // Calculate flight time in minutes
            // Flight time = (Distance / Speed) * 60 minutes
            let flightMinutes = 0;
            if (flightDistance > 0 && cruiseSpeed > 0) {
                flightMinutes = Math.round((flightDistance / cruiseSpeed) * 60);
                // Add 30 minutes for taxi, takeoff, landing, approach
                flightMinutes += 30;
            } else {
                // Fallback: estimate 2 hours if no distance data
                flightMinutes = 120;
                console.warn('No distance data available, using default 2-hour flight time');
            }
            
            console.log('Estimated flight time (minutes):', flightMinutes);
            
            // Use current time as departure time
            const now = new Date();
            const departureTime = {
                hours: now.getHours(),
                minutes: now.getMinutes()
            };
            
            // Calculate arrival time
            const arrivalTime = addTime(departureTime, flightMinutes);
            
            // Format times for display (HHMM format)
            const departureTimeStr = formatTimeForTask(departureTime).replace(':', '');
            const arrivalTimeStr = formatTimeForTask(arrivalTime).replace(':', '');
            
            console.log('✅ Estimated departure time:', departureTimeStr);
            console.log('✅ Estimated arrival time:', arrivalTimeStr);
            
            // Use these estimated times
            const finalDepartureTime = departureTimeStr;
            const finalArrivalTime = arrivalTimeStr;
            
            // Use today's date since we're using current time for departure
            const flightDate = new Date().toISOString().split('T')[0];
            console.log('Flight date:', flightDate);

            console.log('Parsed departure time:', departureTime);
            console.log('Parsed arrival time:', arrivalTime);
            console.log('Flight date:', flightDate);

            // If we still don't have times, try to extract from route or other fields
            if (!departureTime || !arrivalTime) {
                // Try to get times from navlog if available
                if (flightData.navlog && flightData.navlog.fix) {
                    const fixes = Array.isArray(flightData.navlog.fix) ? flightData.navlog.fix : [flightData.navlog.fix];
                    if (fixes.length > 0) {
                        const firstFix = fixes[0];
                        const lastFix = fixes[fixes.length - 1];
                        
                        // Try to get times from waypoints
                        const depTimeFromNav = firstFix?.time || firstFix?.eta || firstFix?.etd;
                        const arrTimeFromNav = lastFix?.time || lastFix?.eta || lastFix?.etd;
                        
                        if (depTimeFromNav && !departureTime) {
                            console.log('Using departure time from navlog:', depTimeFromNav);
                            departureTime = depTimeFromNav;
                        }
                        if (arrTimeFromNav && !arrivalTime) {
                            console.log('Using arrival time from navlog:', arrTimeFromNav);
                            arrivalTime = arrTimeFromNav;
                        }
                    }
                }
                
                // If still no times, show manual entry form
                if (!departureTime || !arrivalTime) {
                    console.error('Available time fields in SimBrief data:', {
                        times: flightData.times,
                        general: flightData.general,
                        params: flightData.params
                    });
                    
                    // Show manual time entry form
                    const manualTimeEntry = document.getElementById('manualTimeEntry');
                    if (manualTimeEntry) {
                        manualTimeEntry.style.display = 'block';
                        
                        // Set default date to today
                        const dateInput = document.getElementById('manualFlightDate');
                        if (dateInput) {
                            dateInput.value = flightDate;
                        }
                        
                        // Set up manual time entry button
                        const createTasksWithManualTimesBtn = document.getElementById('createTasksWithManualTimes');
                        if (createTasksWithManualTimesBtn) {
                            createTasksWithManualTimesBtn.onclick = () => {
                                const manualDep = document.getElementById('manualDepartureTime').value;
                                const manualArr = document.getElementById('manualArrivalTime').value;
                                const manualDate = document.getElementById('manualFlightDate').value;
                                
                                if (!manualDep || !manualArr || !manualDate) {
                                    showError('Please fill in all time fields');
                                    return;
                                }
                                
                                // Convert HH:MM to HHMM format
                                const depTime = manualDep.replace(':', '');
                                const arrTime = manualArr.replace(':', '');
                                
                                // Create modified flight data with manual times
                                const modifiedFlightData = {
                                    ...flightData,
                                    times: {
                                        ...flightData.times,
                                        sched_time_out: depTime,
                                        sched_time_in: arrTime
                                    },
                                    general: {
                                        ...flightData.general,
                                        date: manualDate
                                    }
                                };
                                
                                createTasksFromFlightPlan(modifiedFlightData);
                            };
                        }
                    }
                    
                    showError('Flight times not found in SimBrief data. Please enter them manually above.');
                    return;
                }
            }

            // Parse times (now in HHMM format from our calculation)
            const depTime = parseTime(finalDepartureTime);
            const arrTime = parseTime(finalArrivalTime);

            if (!depTime || !arrTime) {
                console.warn('Could not parse flight times, cannot create tasks');
                showError('Unable to calculate flight times. Please use manual time entry.');
                return;
            }

            // Calculate task times
            const preFlightStart = subtractTime(depTime, 90); // 90 minutes before departure
            const preFlightEnd = depTime;
            const flightStart = depTime;
            const flightEnd = arrTime;
            const postFlightStart = arrTime;
            const postFlightEnd = addTime(arrTime, 60); // 60 minutes after arrival

            const origin = flightData.origin?.icao_code || flightData.origin?.iata_code || 'N/A';
            const destination = flightData.destination?.icao_code || flightData.destination?.iata_code || 'N/A';
            const flightNumber = flightData.general?.flight_number || `${origin}-${destination}`;
            const aircraftType = flightData.aircraft?.icao || flightData.aircraft?.name || 'Aircraft';

            // Create tasks
            const tasks = [
                {
                    name: `Pre-Flight Briefing - ${flightNumber}`,
                    start_time: formatTimeForTask(preFlightStart),
                    end_time: formatTimeForTask(preFlightEnd),
                    work_area: 'administrative',
                    description: `Pre-flight briefing for ${origin} → ${destination} on ${aircraftType}`
                },
                {
                    name: `Flight Operations - ${flightNumber} (${origin} → ${destination})`,
                    start_time: formatTimeForTask(flightStart),
                    end_time: formatTimeForTask(flightEnd),
                    work_area: 'other',
                    description: `Flight from ${origin} to ${destination} on ${aircraftType}. Flight time: ${flightData.times?.est_time_enroute || 'N/A'}`
                },
                {
                    name: `Post-Flight Debriefing - ${flightNumber}`,
                    start_time: formatTimeForTask(postFlightStart),
                    end_time: formatTimeForTask(postFlightEnd),
                    work_area: 'administrative',
                    description: `Post-flight debriefing for ${origin} → ${destination}`
                }
            ];

            // Create hourly tasks
            let createdCount = 0;
            for (const task of tasks) {
                try {
                    const taskData = {
                        employee_id: employee.id,
                        task_date: flightDate,
                        name: task.name,
                        start_time: task.start_time,
                        end_time: task.end_time,
                        work_area: task.work_area || 'other',
                        status: 'pending'
                    };

                    const result = await supabaseService.createHourlyTask(taskData);
                    if (result) {
                        createdCount++;
                        console.log(`✅ Created task: ${task.name}`);
                    }
                } catch (error) {
                    console.error(`Error creating task "${task.name}":`, error);
                }
            }

            if (createdCount > 0) {
                showSuccess(`✅ Created ${createdCount} task(s) from flight plan!`);
            } else {
                console.warn('No tasks were created');
            }

        } catch (error) {
            console.error('Error creating tasks from flight plan:', error);
            showError(`Failed to create tasks: ${error.message}`);
        }
    }

    function parseTime(timeString) {
        if (!timeString) return null;
        
        // Handle HHMM format (e.g., "1430")
        if (timeString.length === 4 && /^\d{4}$/.test(timeString)) {
            const hours = parseInt(timeString.substring(0, 2));
            const minutes = parseInt(timeString.substring(2, 4));
            return { hours, minutes };
        }
        
        // Handle HH:MM format (e.g., "14:30")
        if (timeString.includes(':')) {
            const parts = timeString.split(':');
            return {
                hours: parseInt(parts[0]),
                minutes: parseInt(parts[1])
            };
        }
        
        return null;
    }

    function formatTimeForTask(timeObj) {
        if (!timeObj) return '00:00';
        const hours = String(timeObj.hours).padStart(2, '0');
        const minutes = String(timeObj.minutes).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function subtractTime(timeObj, minutesToSubtract) {
        if (!timeObj) return null;
        
        let totalMinutes = timeObj.hours * 60 + timeObj.minutes;
        totalMinutes -= minutesToSubtract;
        
        // Handle negative (previous day)
        if (totalMinutes < 0) {
            totalMinutes += 24 * 60; // Add a day
        }
        
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        
        return { hours, minutes };
    }

    function addTime(timeObj, minutesToAdd) {
        if (!timeObj) return null;
        
        let totalMinutes = timeObj.hours * 60 + timeObj.minutes;
        totalMinutes += minutesToAdd;
        
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        
        return { hours, minutes };
    }

    function displayFlightData(data) {
        flightDataContainer.style.display = 'block';
        noDataMessage.style.display = 'none';

        // Route Display
        const origin = data.origin?.icao_code || data.origin?.iata_code || 'N/A';
        const destination = data.destination?.icao_code || data.destination?.iata_code || 'N/A';
        document.getElementById('routeDisplay').textContent = `${origin} → ${destination}`;

        // Flight Details
        const flightDetails = [
            { label: 'Flight Number', value: data.general?.flight_number || 'N/A' },
            { label: 'Route', value: `${origin} → ${destination}` },
            { label: 'Alternate Airport', value: data.alternate?.icao_code || data.alternate?.iata_code || 'N/A' },
            { label: 'Flight Type', value: data.general?.type || 'N/A' },
            { label: 'Flight Rules', value: data.general?.flight_rules || 'N/A' },
            { label: 'Route Type', value: data.general?.route || 'N/A' }
        ];
        document.getElementById('flightDetails').innerHTML = formatDetails(flightDetails);

        // Aircraft Information
        const aircraftInfo = [
            { label: 'Aircraft Type', value: data.aircraft?.icao || 'N/A' },
            { label: 'Registration', value: data.aircraft?.registration || 'N/A' },
            { label: 'Aircraft Name', value: data.aircraft?.name || 'N/A' },
            { label: 'Max Range', value: data.aircraft?.max_range ? `${data.aircraft.max_range} nm` : 'N/A' },
            { label: 'Cruise Speed', value: data.aircraft?.cruise_speed ? `${data.aircraft.cruise_speed} kts` : 'N/A' },
            { label: 'Service Ceiling', value: data.aircraft?.service_ceiling ? `${data.aircraft.service_ceiling} ft` : 'N/A' }
        ];
        document.getElementById('aircraftInfo').innerHTML = formatDetails(aircraftInfo);

        // Times
        const timesInfo = [
            { label: 'Departure Time', value: formatTime(data.times?.sched_time_out) || 'N/A' },
            { label: 'Arrival Time', value: formatTime(data.times?.sched_time_in) || 'N/A' },
            { label: 'Flight Time', value: data.times?.est_time_enroute || 'N/A' },
            { label: 'Block Time', value: data.times?.est_block_time || 'N/A' },
            { label: 'Taxi Out', value: data.times?.taxi_out || 'N/A' },
            { label: 'Taxi In', value: data.times?.taxi_in || 'N/A' }
        ];
        document.getElementById('timesInfo').innerHTML = formatDetails(timesInfo);

        // Weather
        const originWeather = data.origin?.metar || 'N/A';
        const destWeather = data.destination?.metar || 'N/A';
        const weatherInfo = [
            { label: 'Origin METAR', value: originWeather },
            { label: 'Destination METAR', value: destWeather },
            { label: 'Origin Wind', value: data.origin?.wind ? `${data.origin.wind.speed} kts @ ${data.origin.wind.direction}°` : 'N/A' },
            { label: 'Destination Wind', value: data.destination?.wind ? `${data.destination.wind.speed} kts @ ${data.destination.wind.direction}°` : 'N/A' },
            { label: 'Origin Visibility', value: data.origin?.visibility ? `${data.origin.visibility} SM` : 'N/A' },
            { label: 'Destination Visibility', value: data.destination?.visibility ? `${data.destination.visibility} SM` : 'N/A' }
        ];
        document.getElementById('weatherInfo').innerHTML = formatDetails(weatherInfo);

        // Fuel & Weight
        const fuelWeightInfo = [
            { label: 'Fuel Required', value: data.fuel?.plan_ramp ? `${data.fuel.plan_ramp} lbs` : 'N/A' },
            { label: 'Trip Fuel', value: data.fuel?.plan_trip_fuel ? `${data.fuel.plan_trip_fuel} lbs` : 'N/A' },
            { label: 'Reserve Fuel', value: data.fuel?.plan_contfuel ? `${data.fuel.plan_contfuel} lbs` : 'N/A' },
            { label: 'Zero Fuel Weight', value: data.weights?.est_zfw ? `${data.weights.est_zfw} lbs` : 'N/A' },
            { label: 'Takeoff Weight', value: data.weights?.est_tow ? `${data.weights.est_tow} lbs` : 'N/A' },
            { label: 'Landing Weight', value: data.weights?.est_ldw ? `${data.weights.est_ldw} lbs` : 'N/A' }
        ];
        document.getElementById('fuelWeightInfo').innerHTML = formatDetails(fuelWeightInfo);

        // Performance
        const performanceInfo = [
            { label: 'Cruise Altitude', value: data.general?.cruise_altitude ? `${data.general.cruise_altitude} ft` : 'N/A' },
            { label: 'Cruise Speed', value: data.general?.cruise_tas ? `${data.general.cruise_tas} kts` : 'N/A' },
            { label: 'Distance', value: data.general?.route_distance ? `${data.general.route_distance} nm` : 'N/A' },
            { label: 'Cost Index', value: data.general?.costindex || 'N/A' },
            { label: 'Initial Climb', value: data.general?.initial_altitude ? `${data.general.initial_altitude} ft` : 'N/A' },
            { label: 'Step Climb', value: data.general?.step_climb_string || 'N/A' }
        ];
        document.getElementById('performanceInfo').innerHTML = formatDetails(performanceInfo);

        // Route & Navigation
        let routeHtml = '';
        if (data.navlog && data.navlog.fix) {
            const fixes = Array.isArray(data.navlog.fix) ? data.navlog.fix : [data.navlog.fix];
            routeHtml = '<div style="max-height: 400px; overflow-y: auto;">';
            routeHtml += '<table style="width: 100%; border-collapse: collapse;">';
            routeHtml += '<thead><tr style="background: var(--bg-secondary);"><th style="padding: 10px; text-align: left;">Waypoint</th><th style="padding: 10px; text-align: left;">Distance</th><th style="padding: 10px; text-align: left;">Course</th><th style="padding: 10px; text-align: left;">Altitude</th><th style="padding: 10px; text-align: left;">Wind</th></tr></thead>';
            routeHtml += '<tbody>';
            fixes.forEach(fix => {
                routeHtml += `<tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px;">${fix.ident || 'N/A'}</td>
                    <td style="padding: 8px;">${fix.distance ? `${fix.distance} nm` : 'N/A'}</td>
                    <td style="padding: 8px;">${fix.course || 'N/A'}</td>
                    <td style="padding: 8px;">${fix.altitude || 'N/A'}</td>
                    <td style="padding: 8px;">${fix.wind ? `${fix.wind.speed}@${fix.wind.direction}` : 'N/A'}</td>
                </tr>`;
            });
            routeHtml += '</tbody></table></div>';
        } else {
            routeHtml = '<p style="color: var(--text-muted);">Route information not available</p>';
        }
        document.getElementById('routeInfo').innerHTML = routeHtml;
    }

    function formatDetails(details) {
        return details.map(detail => `
            <div class="flight-detail">
                <span class="flight-detail-label">${detail.label}:</span>
                <span class="flight-detail-value">${detail.value}</span>
            </div>
        `).join('');
    }

    function formatTime(timeString) {
        if (!timeString) return null;
        // SimBrief times are usually in HHMM format
        if (timeString.length === 4) {
            return `${timeString.substring(0, 2)}:${timeString.substring(2, 4)}`;
        }
        return timeString;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.className = 'error-message';
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 10000);
    }

    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.className = 'success-message';
        successMessage.style.display = 'block';
        setTimeout(() => {
            successMessage.style.display = 'none';
        }, 5000);
    }

    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }

    // Auto-fetch on page load if username is saved
    if (savedUsername) {
        // Small delay to let page render
        setTimeout(() => {
            fetchFlightData(savedUsername);
        }, 500);
    }
});

