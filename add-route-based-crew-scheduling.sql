-- Route-Based Crew Scheduling System for Virtual Airlines
-- ========================================================
-- Run this in Supabase SQL Editor to replace the flight-based system with routes

-- ==========================================
-- DROP OLD TABLES (if they exist)
-- ==========================================

DROP TABLE IF EXISTS public.trips CASCADE;
DROP TABLE IF EXISTS public.flights CASCADE;

-- ==========================================
-- ROUTES TABLE (Route definitions)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.routes (
    id BIGSERIAL PRIMARY KEY,
    airline_id BIGINT NOT NULL REFERENCES public.airlines(id) ON DELETE CASCADE,
    route_number VARCHAR(20) NOT NULL, -- e.g., 'SWA100', 'ASA200'
    origin_airport VARCHAR(10) NOT NULL, -- ICAO or IATA code
    destination_airport VARCHAR(10) NOT NULL,
    aircraft_type VARCHAR(50), -- e.g., 'B737-800', 'A320'
    route_description TEXT,
    default_departure_time TIME NOT NULL, -- Default departure time (can be overridden per day)
    flight_duration_minutes INTEGER NOT NULL, -- Duration in minutes
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique route number per airline
    UNIQUE(airline_id, route_number)
);

-- ==========================================
-- ROUTE SCHEDULES TABLE (Days/times routes operate)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.route_schedules (
    id BIGSERIAL PRIMARY KEY,
    route_id BIGINT NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday, etc.
    departure_time TIME NOT NULL, -- Can override default for specific days
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One schedule per route per day
    UNIQUE(route_id, day_of_week)
);

-- ==========================================
-- TRIPS TABLE (Employee assignments to routes on specific dates)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.trips (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    route_id BIGINT NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
    trip_date DATE NOT NULL,
    departure_time TIME NOT NULL, -- Actual departure time for this trip
    arrival_time TIME NOT NULL, -- Calculated arrival time
    position VARCHAR(50) NOT NULL CHECK (position IN ('Captain', 'First Officer', 'Flight Attendant', 'Purser', 'Observer')),
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'completed', 'cancelled', 'no-show')),
    notes TEXT,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One position per employee per route per date
    UNIQUE(employee_id, route_id, trip_date, position)
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_routes_airline_id ON public.routes(airline_id);
CREATE INDEX IF NOT EXISTS idx_routes_active ON public.routes(is_active);
CREATE INDEX IF NOT EXISTS idx_routes_airline_number ON public.routes(airline_id, route_number);

CREATE INDEX IF NOT EXISTS idx_route_schedules_route_id ON public.route_schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_route_schedules_day ON public.route_schedules(day_of_week);
CREATE INDEX IF NOT EXISTS idx_route_schedules_active ON public.route_schedules(is_active);

CREATE INDEX IF NOT EXISTS idx_trips_employee_id ON public.trips(employee_id);
CREATE INDEX IF NOT EXISTS idx_trips_route_id ON public.trips(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_date ON public.trips(trip_date);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_employee_date ON public.trips(employee_id, trip_date);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Routes: Everyone can view active routes
CREATE POLICY "Anyone can view active routes"
    ON public.routes FOR SELECT
    USING (is_active = TRUE);

-- Routes: Only admins and crew schedulers can manage
CREATE POLICY "Admins and crew schedulers can manage routes"
    ON public.routes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_id = auth.uid()
            AND (u.is_admin = TRUE OR u.role = 'crew_scheduler')
        )
    );

-- Route Schedules: Same as routes
CREATE POLICY "Anyone can view active route schedules"
    ON public.route_schedules FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Admins and crew schedulers can manage route schedules"
    ON public.route_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_id = auth.uid()
            AND (u.is_admin = TRUE OR u.role = 'crew_scheduler')
        )
    );

-- Trips: Employees can view their own trips
CREATE POLICY "Employees can view their own trips"
    ON public.trips FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            JOIN public.users u ON e.user_id = u.id
            WHERE e.id = trips.employee_id
            AND u.auth_id = auth.uid()
        )
    );

-- Trips: Admins and crew schedulers can view all trips
CREATE POLICY "Admins and crew schedulers can view all trips"
    ON public.trips FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_id = auth.uid()
            AND (u.is_admin = TRUE OR u.role = 'crew_scheduler')
        )
    );

-- Trips: Only admins and crew schedulers can manage
CREATE POLICY "Admins and crew schedulers can manage trips"
    ON public.trips FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_id = auth.uid()
            AND (u.is_admin = TRUE OR u.role = 'crew_scheduler')
        )
    );

-- ==========================================
-- FUNCTION: Calculate arrival time
-- ==========================================

CREATE OR REPLACE FUNCTION calculate_arrival_time(
    departure_time_param TIME,
    duration_minutes_param INTEGER
)
RETURNS TIME AS $$
DECLARE
    departure_epoch INTEGER;
    arrival_epoch INTEGER;
    arrival_time TIME;
BEGIN
    -- Convert time to seconds since midnight
    departure_epoch := EXTRACT(EPOCH FROM departure_time_param)::INTEGER;
    -- Add duration in seconds
    arrival_epoch := departure_epoch + (duration_minutes_param * 60);
    -- Convert back to TIME (handles overflow to next day)
    arrival_time := (arrival_epoch % 86400)::INTEGER::TIME;
    RETURN arrival_time;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE public.routes IS 'Route definitions for virtual airlines';
COMMENT ON TABLE public.route_schedules IS 'Weekly schedule for when routes operate';
COMMENT ON TABLE public.trips IS 'Employee assignments to routes on specific dates';

