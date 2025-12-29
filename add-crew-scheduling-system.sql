-- Crew Scheduling System for Virtual Airlines
-- ============================================
-- Run this in Supabase SQL Editor to add crew scheduling functionality

-- ==========================================
-- UPDATE USERS TABLE TO INCLUDE CREW_SCHEDULER ROLE
-- ==========================================

-- Drop the existing constraint
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS valid_role;

-- Add new constraint with crew_scheduler role
ALTER TABLE public.users 
ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'employee', 'accountant', 'crew_scheduler'));

-- ==========================================
-- AIRLINES TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.airlines (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL, -- e.g., 'SWA', 'ASA'
    name VARCHAR(255) NOT NULL, -- e.g., 'Southwest Virtual Airlines', 'Alaska Virtual Airlines'
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default airlines
INSERT INTO public.airlines (code, name) VALUES
    ('SWA', 'Southwest Virtual Airlines'),
    ('ASA', 'Alaska Virtual Airlines')
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- FLIGHTS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS public.flights (
    id BIGSERIAL PRIMARY KEY,
    airline_id BIGINT NOT NULL REFERENCES public.airlines(id) ON DELETE CASCADE,
    flight_number VARCHAR(20) NOT NULL, -- e.g., 'SWA1234', 'ASA5678'
    origin_airport VARCHAR(10) NOT NULL, -- ICAO or IATA code
    destination_airport VARCHAR(10) NOT NULL,
    departure_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    arrival_date DATE NOT NULL,
    arrival_time TIME NOT NULL,
    aircraft_type VARCHAR(50), -- e.g., 'B737-800', 'A320'
    route_description TEXT,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'delayed')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique flight number per airline per date
    UNIQUE(airline_id, flight_number, departure_date)
);

-- ==========================================
-- TRIPS TABLE (Employee assignments to flights)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.trips (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    flight_id BIGINT NOT NULL REFERENCES public.flights(id) ON DELETE CASCADE,
    position VARCHAR(50) NOT NULL CHECK (position IN ('Captain', 'First Officer', 'Flight Attendant', 'Purser', 'Observer')),
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'completed', 'cancelled', 'no-show')),
    notes TEXT,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one position per employee per flight
    UNIQUE(employee_id, flight_id, position)
);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_airlines_code ON public.airlines(code);
CREATE INDEX IF NOT EXISTS idx_airlines_active ON public.airlines(is_active);

CREATE INDEX IF NOT EXISTS idx_flights_airline_id ON public.flights(airline_id);
CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON public.flights(departure_date);
CREATE INDEX IF NOT EXISTS idx_flights_status ON public.flights(status);
CREATE INDEX IF NOT EXISTS idx_flights_airline_date ON public.flights(airline_id, departure_date);

CREATE INDEX IF NOT EXISTS idx_trips_employee_id ON public.trips(employee_id);
CREATE INDEX IF NOT EXISTS idx_trips_flight_id ON public.trips(flight_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_employee_date ON public.trips(employee_id, assigned_at);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS
ALTER TABLE public.airlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Airlines: Everyone can read active airlines
CREATE POLICY "Anyone can view active airlines"
    ON public.airlines FOR SELECT
    USING (is_active = TRUE);

-- Airlines: Only admins and crew schedulers can manage
CREATE POLICY "Admins and crew schedulers can manage airlines"
    ON public.airlines FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_id = auth.uid()
            AND (u.is_admin = TRUE OR u.role = 'crew_scheduler')
        )
    );

-- Flights: Everyone can view scheduled flights
CREATE POLICY "Anyone can view flights"
    ON public.flights FOR SELECT
    USING (TRUE);

-- Flights: Only admins and crew schedulers can manage
CREATE POLICY "Admins and crew schedulers can manage flights"
    ON public.flights FOR ALL
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
-- COMMENTS
-- ==========================================

COMMENT ON TABLE public.airlines IS 'Virtual airlines (Southwest, Alaska, etc.)';
COMMENT ON TABLE public.flights IS 'Flight schedules for virtual airlines';
COMMENT ON TABLE public.trips IS 'Employee assignments to flights (crew scheduling)';

