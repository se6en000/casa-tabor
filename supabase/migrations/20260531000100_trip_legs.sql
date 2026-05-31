-- Add leg fields to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS leg_type TEXT; -- 'flight_outbound' | 'flight_return' | 'flight_leg' | 'hotel' | 'car_rental'
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS flight_number TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS confirmation_number TEXT;

CREATE INDEX IF NOT EXISTS idx_events_trip_id ON public.events(trip_id);
CREATE INDEX IF NOT EXISTS idx_events_flight_number ON public.events(flight_number);
CREATE INDEX IF NOT EXISTS idx_events_confirmation ON public.events(confirmation_number);
