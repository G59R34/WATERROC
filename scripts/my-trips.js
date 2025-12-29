// My Trips Script - Employee view of flight assignments
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    const userRole = sessionStorage.getItem('userRole');
    if (!userRole) {
        window.location.href = 'index.html';
        return;
    }

    let currentWeekStart = getMonday(new Date());
    let currentEmployee = null;
    let trips = [];

    // Navigation
    document.getElementById('backToDashboard').addEventListener('click', function() {
        if (typeof showPageLoadScreen !== 'undefined') {
            showPageLoadScreen();
        }
        window.location.href = 'employee.html';
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
        
        // Get current employee
        const userId = sessionStorage.getItem('userId');
        if (userId) {
            const employees = await supabaseService.getEmployees();
            currentEmployee = employees?.find(emp => emp.user_id === userId);
        }
        
        if (!currentEmployee) {
            alert('Employee profile not found. Please contact an administrator.');
            window.location.href = 'employee.html';
            return;
        }
    } else {
        alert('My Trips requires Supabase connection');
        window.location.href = 'employee.html';
        return;
    }

    // Week navigation
    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        loadTrips();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        loadTrips();
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

    function formatDateTime(dateStr, timeStr) {
        const date = new Date(dateStr + 'T' + timeStr);
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    async function loadTrips() {
        const tripsList = document.getElementById('tripsList');
        tripsList.innerHTML = '<div class="loading-message">Loading your trips...</div>';

        try {
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            
            trips = await supabaseService.getEmployeeTrips(
                currentEmployee.id,
                formatDate(currentWeekStart),
                formatDate(weekEnd)
            );

            // Update week display
            document.getElementById('weekDisplay').textContent = 
                `${formatDateDisplay(currentWeekStart)} - ${formatDateDisplay(weekEnd)}`;

            // Render trips
            renderTrips();

        } catch (error) {
            console.error('Error loading trips:', error);
            tripsList.innerHTML = '<div class="loading-message">Error loading trips: ' + error.message + '</div>';
        }
    }

    function renderTrips() {
        const tripsList = document.getElementById('tripsList');

        if (!trips || trips.length === 0) {
            tripsList.innerHTML = '<div class="loading-message">No flight assignments for this week.</div>';
            return;
        }

        // Sort trips by date/time
        const sortedTrips = [...trips].sort((a, b) => {
            const dateA = new Date(a.trip_date + 'T' + a.departure_time);
            const dateB = new Date(b.trip_date + 'T' + b.departure_time);
            return dateA - dateB;
        });

        let html = '';
        sortedTrips.forEach(trip => {
            const route = trip.routes;
            const airline = route?.airlines;
            const statusClass = trip.status;
            
            const statusLabels = {
                'assigned': 'Assigned',
                'confirmed': 'Confirmed',
                'completed': 'Completed',
                'cancelled': 'Cancelled',
                'no-show': 'No Show'
            };

            html += `
                <div class="trip-card">
                    <div class="trip-card-header">
                        <div class="trip-airline">
                            ${escapeHtml(airline?.name || 'Unknown Airline')} (${escapeHtml(airline?.code || '')})
                        </div>
                        <span class="trip-status ${statusClass}">${statusLabels[trip.status] || trip.status}</span>
                    </div>
                    
                    <div class="trip-route">
                        <span>${escapeHtml(route?.origin_airport || '')}</span>
                        <span>→</span>
                        <span>${escapeHtml(route?.destination_airport || '')}</span>
                    </div>
                    
                    <div class="trip-details">
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Route Number</span>
                            <span class="trip-detail-value">${escapeHtml(airline?.code || '')} ${escapeHtml(route?.route_number || '')}</span>
                        </div>
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Position</span>
                            <span class="trip-position">${escapeHtml(trip.position)}</span>
                        </div>
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Date</span>
                            <span class="trip-detail-value">${formatDateDisplay(new Date(trip.trip_date))}</span>
                        </div>
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Departure</span>
                            <span class="trip-detail-value">${trip.departure_time.substring(0,5)}</span>
                        </div>
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Arrival</span>
                            <span class="trip-detail-value">${trip.arrival_time.substring(0,5)}</span>
                        </div>
                        ${route?.aircraft_type ? `
                        <div class="trip-detail-item">
                            <span class="trip-detail-label">Aircraft</span>
                            <span class="trip-detail-value">${escapeHtml(route.aircraft_type)}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    ${trip.notes ? `
                    <div style="margin-top: 15px; padding: 10px; background: var(--bg-secondary, #f5f5f5); border-radius: 6px;">
                        <strong>Notes:</strong> ${escapeHtml(trip.notes)}
                    </div>
                    ` : ''}
                    
                    ${route?.route_description ? `
                    <div style="margin-top: 10px; padding: 10px; background: var(--bg-secondary, #f5f5f5); border-radius: 6px; font-size: 14px;">
                        <strong>Route:</strong> ${escapeHtml(route.route_description)}
                    </div>
                    ` : ''}
                </div>
            `;
        });

        tripsList.innerHTML = html;
    }

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initial load
    await loadTrips();
});

