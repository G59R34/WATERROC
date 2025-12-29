// Crew Scheduling Script for Virtual Airlines (Route-Based)
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin' && userRole !== 'crew_scheduler') {
        window.location.href = 'index.html';
        return;
    }

    let currentWeekStart = getMonday(new Date());
    let employees = [];
    let routes = [];
    let trips = [];
    let airlines = [];

    // Navigation
    document.getElementById('backToDashboard').addEventListener('click', function() {
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }
        window.location.href = userRole === 'admin' ? 'admin.html' : 'index.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
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

    // Check Supabase connection
    if (typeof supabaseService !== 'undefined' && supabaseService.isReady()) {
        const session = await supabaseService.getSession();
        if (!session) {
            sessionStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        await supabaseService.loadCurrentUser();
        const isAdmin = supabaseService.isAdmin();
        const currentUserRole = sessionStorage.getItem('userRole');
        
        if (!isAdmin && currentUserRole !== 'crew_scheduler') {
            alert('Access denied. Crew scheduler privileges required.');
            window.location.href = 'index.html';
            return;
        }
    } else {
        alert('Crew Scheduling requires Supabase connection');
        window.location.href = 'index.html';
        return;
    }

    // Week navigation
    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        loadRoutes();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        loadRoutes();
    });

    // Route Modal
    const routeModal = document.getElementById('routeModal');
    const routeForm = document.getElementById('routeForm');
    const closeModal = routeModal.querySelector('.close');
    const cancelBtn = document.getElementById('cancelRouteBtn');
    const addRouteBtn = document.getElementById('addRouteBtn');

    addRouteBtn.addEventListener('click', () => {
        openRouteModal();
    });

    closeModal.addEventListener('click', () => {
        routeModal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        routeModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === routeModal) {
            routeModal.style.display = 'none';
        }
    });

    // Assign Crew Modal
    const assignCrewModal = document.getElementById('assignCrewModal');
    const assignCrewForm = document.getElementById('assignCrewForm');
    const assignCrewBtn = document.getElementById('assignCrewBtn');
    const closeAssignCrewModal = document.getElementById('closeAssignCrewModal');
    const cancelAssignCrewBtn = document.getElementById('cancelAssignCrewBtn');

    assignCrewBtn.addEventListener('click', () => {
        openAssignCrewModal();
    });

    closeAssignCrewModal.addEventListener('click', () => {
        assignCrewModal.style.display = 'none';
    });

    cancelAssignCrewBtn.addEventListener('click', () => {
        assignCrewModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === assignCrewModal) {
            assignCrewModal.style.display = 'none';
        }
    });

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

    function formatDateDisplay(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function getDayName(dayOfWeek) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[dayOfWeek];
    }

    async function loadRoutes() {
        const routesList = document.getElementById('routesList');
        routesList.innerHTML = '<div class="loading-message">Loading routes...</div>';

        try {
            // Load data
            employees = await supabaseService.getEmployees();
            airlines = await supabaseService.getAirlines();
            routes = await supabaseService.getRoutes();
            
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            trips = await supabaseService.getAllTrips(
                formatDate(currentWeekStart),
                formatDate(weekEnd)
            );

            // Update week display
            document.getElementById('weekDisplay').textContent = 
                `${formatDateDisplay(currentWeekStart)} - ${formatDateDisplay(weekEnd)}`;

            // Render routes
            renderRoutes();

        } catch (error) {
            console.error('Error loading routes:', error);
            routesList.innerHTML = '<div class="loading-message">Error loading routes: ' + error.message + '</div>';
        }
    }

    function renderRoutes() {
        const routesList = document.getElementById('routesList');

        if (!routes || routes.length === 0) {
            routesList.innerHTML = '<div class="loading-message">No routes configured. Click "Add Route" to create one.</div>';
            return;
        }

        // Create trip map for quick lookup
        const tripMap = {};
        if (trips) {
            trips.forEach(trip => {
                const dateStr = trip.trip_date;
                if (!tripMap[dateStr]) {
                    tripMap[dateStr] = {};
                }
                if (!tripMap[dateStr][trip.route_id]) {
                    tripMap[dateStr][trip.route_id] = [];
                }
                tripMap[dateStr][trip.route_id].push(trip);
            });
        }

        let html = '';
        routes.forEach(route => {
            const airline = route.airlines;
            const schedules = route.route_schedules || [];
            const activeSchedules = schedules.filter(s => s.is_active);
            
            // Get trips for this route in current week
            const weekTrips = [];
            for (let i = 0; i < 7; i++) {
                const day = new Date(currentWeekStart);
                day.setDate(day.getDate() + i);
                const dateStr = formatDate(day);
                const dayTrips = tripMap[dateStr]?.[route.id] || [];
                weekTrips.push({ date: dateStr, trips: dayTrips });
            }

            html += `
                <div class="route-card">
                    <div class="route-header">
                        <div>
                            <h3 style="margin: 0;">${escapeHtml(airline?.code || '')} ${escapeHtml(route.route_number)}</h3>
                            <div style="color: var(--text-secondary, #666); font-size: 14px;">${escapeHtml(airline?.name || 'Unknown Airline')}</div>
                        </div>
                        <button class="btn-secondary" onclick="deleteRoute(${route.id})" style="padding: 6px 12px; font-size: 12px;">Delete</button>
                    </div>
                    
                    <div class="route-route">
                        ${escapeHtml(route.origin_airport)} → ${escapeHtml(route.destination_airport)}
                    </div>
                    
                    <div class="route-info">
                        <div>
                            <strong>Default Departure:</strong> ${route.default_departure_time.substring(0,5)}
                        </div>
                        <div>
                            <strong>Duration:</strong> ${route.flight_duration_minutes} minutes
                        </div>
                        ${route.aircraft_type ? `
                        <div>
                            <strong>Aircraft:</strong> ${escapeHtml(route.aircraft_type)}
                        </div>
                        ` : ''}
                    </div>
                    
                    ${activeSchedules.length > 0 ? `
                    <div class="route-schedule">
                        <strong>Operating Days:</strong>
                        <div class="schedule-days">
                            ${activeSchedules.map(s => `<span class="schedule-day">${getDayName(s.day_of_week)} ${s.departure_time.substring(0,5)}</span>`).join('')}
                        </div>
                    </div>
                    ` : '<div style="color: #f59e0b; margin-top: 10px;">⚠️ No operating schedule configured</div>'}
                    
                    ${route.route_description ? `
                    <div style="margin-top: 10px; padding: 10px; background: var(--bg-secondary, #f5f5f5); border-radius: 6px; font-size: 14px;">
                        ${escapeHtml(route.route_description)}
                    </div>
                    ` : ''}
                    
                    <div class="trip-assignments">
                        <strong>This Week's Assignments:</strong>
                        ${weekTrips.some(d => d.trips.length > 0) ? 
                            weekTrips.map(day => day.trips.length > 0 ? `
                                <div style="margin-top: 10px;">
                                    <strong>${formatDateDisplay(new Date(day.date))}:</strong>
                                    ${day.trips.map(trip => `
                                        <div class="trip-item">
                                            <span>${escapeHtml(trip.employees?.name || 'Unknown')} - ${escapeHtml(trip.position)} (${trip.departure_time.substring(0,5)} - ${trip.arrival_time.substring(0,5)})</span>
                                            <button class="btn-secondary" onclick="removeTrip(${trip.id})" style="padding: 4px 8px; font-size: 11px;">Remove</button>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '').join('') :
                            '<div style="margin-top: 10px; color: var(--text-secondary, #666);">No assignments for this week</div>'
                        }
                    </div>
                </div>
            `;
        });

        routesList.innerHTML = html;
    }

    // Make functions available globally for onclick handlers
    window.deleteRoute = async function(routeId) {
        if (!confirm('Are you sure you want to delete this route? This will also delete all associated trips.')) {
            return;
        }
        const result = await supabaseService.deleteRoute(routeId);
        if (result) {
            alert('✅ Route deleted successfully');
            await loadRoutes();
        } else {
            alert('❌ Failed to delete route');
        }
    };

    window.removeTrip = async function(tripId) {
        if (!confirm('Remove this crew assignment?')) {
            return;
        }
        const result = await supabaseService.removeCrewAssignment(tripId);
        if (result) {
            await loadRoutes();
        } else {
            alert('❌ Failed to remove assignment');
        }
    };

    function openRouteModal() {
        // Populate airline dropdown
        const airlineSelect = document.getElementById('routeAirline');
        airlineSelect.innerHTML = '<option value="">Select Airline...</option>' +
            (airlines || []).map(airline => 
                `<option value="${airline.id}">${escapeHtml(airline.name)} (${escapeHtml(airline.code)})</option>`
            ).join('');

        // Set default departure time
        document.getElementById('routeDepartureTime').value = '08:00';
        document.getElementById('routeDuration').value = '120';
        
        // Reset other fields
        document.getElementById('routeNumber').value = '';
        document.getElementById('routeOrigin').value = '';
        document.getElementById('routeDestination').value = '';
        document.getElementById('routeAircraft').value = '';
        document.getElementById('routeDescription').value = '';
        document.querySelectorAll('.route-day').forEach(cb => cb.checked = false);

        routeModal.style.display = 'block';
    }

    // Save route
    routeForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const selectedDays = Array.from(document.querySelectorAll('.route-day:checked')).map(cb => cb.value);
        
        if (selectedDays.length === 0) {
            alert('Please select at least one operating day');
            return;
        }

        const routeData = {
            airline_id: parseInt(document.getElementById('routeAirline').value),
            route_number: document.getElementById('routeNumber').value.trim(),
            origin_airport: document.getElementById('routeOrigin').value.trim().toUpperCase(),
            destination_airport: document.getElementById('routeDestination').value.trim().toUpperCase(),
            default_departure_time: document.getElementById('routeDepartureTime').value + ':00',
            flight_duration_minutes: parseInt(document.getElementById('routeDuration').value),
            aircraft_type: document.getElementById('routeAircraft').value.trim() || null,
            route_description: document.getElementById('routeDescription').value.trim() || null,
            scheduleDays: selectedDays
        };

        if (!routeData.airline_id || !routeData.route_number || !routeData.origin_airport || !routeData.destination_airport) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const result = await supabaseService.createRoute(routeData);
            
            if (result) {
                alert('✅ Route created successfully!');
                routeModal.style.display = 'none';
                await loadRoutes();
            } else {
                alert('❌ Failed to create route. Please try again.');
            }
        } catch (error) {
            console.error('Error saving route:', error);
            alert('❌ Error saving route: ' + error.message);
        }
    });

    function openAssignCrewModal() {
        // Populate route dropdown
        const routeSelect = document.getElementById('assignCrewRoute');
        routeSelect.innerHTML = '<option value="">Select Route...</option>' +
            (routes || []).map(route => {
                const airlineCode = route.airlines?.code || '';
                return `<option value="${route.id}" data-departure="${route.default_departure_time}">${escapeHtml(airlineCode)} ${escapeHtml(route.route_number)} - ${escapeHtml(route.origin_airport)} → ${escapeHtml(route.destination_airport)}</option>`;
            }).join('');

        // Populate employee dropdown
        const employeeSelect = document.getElementById('assignCrewEmployee');
        employeeSelect.innerHTML = '<option value="">Select Employee...</option>' +
            (employees || []).map(emp => 
                `<option value="${emp.id}">${escapeHtml(emp.name)}</option>`
            ).join('');

        // Set default date to today
        document.getElementById('assignCrewDate').value = formatDate(new Date());

        // Reset fields
        document.getElementById('assignCrewPosition').value = '';
        document.getElementById('assignCrewNotes').value = '';

        assignCrewModal.style.display = 'block';
    }

    // Assign crew
    assignCrewForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const routeId = parseInt(document.getElementById('assignCrewRoute').value);
        const selectedRoute = routes.find(r => r.id === routeId);
        const departureTime = selectedRoute?.default_departure_time || '08:00:00';

        const tripData = {
            employee_id: parseInt(document.getElementById('assignCrewEmployee').value),
            route_id: routeId,
            trip_date: document.getElementById('assignCrewDate').value,
            departure_time: departureTime,
            position: document.getElementById('assignCrewPosition').value,
            notes: document.getElementById('assignCrewNotes').value.trim() || null,
            status: 'assigned'
        };

        if (!tripData.employee_id || !tripData.route_id || !tripData.position || !tripData.trip_date) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const result = await supabaseService.assignCrewToRoute(tripData);
            
            if (result) {
                alert('✅ Crew assigned successfully!');
                assignCrewModal.style.display = 'none';
                await loadRoutes();
            } else {
                alert('❌ Failed to assign crew. Please try again.');
            }
        } catch (error) {
            console.error('Error assigning crew:', error);
            alert('❌ Error assigning crew: ' + error.message);
        }
    });

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initial load
    await loadRoutes();
});
