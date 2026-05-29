-- Travel Intelligence: trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
  traveler_name TEXT NOT NULL,
  trip_title TEXT,

  -- Destination
  destination_city TEXT,
  destination_state TEXT,
  destination_country TEXT DEFAULT 'US',

  -- Outbound flight
  outbound_flight_number TEXT,
  outbound_airline TEXT,
  outbound_origin_airport TEXT,
  outbound_dest_airport TEXT,
  outbound_departs_at TIMESTAMPTZ,
  outbound_arrives_at TIMESTAMPTZ,
  outbound_seat TEXT,
  outbound_terminal TEXT,
  outbound_confirmation TEXT,

  -- Layover (first connection, if any)
  layover_airport TEXT,
  layover_duration_min INT,
  layover_flight_number TEXT,
  layover_airline TEXT,
  layover_departs_at TIMESTAMPTZ,
  layover_arrives_at TIMESTAMPTZ,

  -- Hotel
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_checkin_date DATE,
  hotel_checkout_date DATE,
  hotel_checkin_time TEXT DEFAULT '3:00 PM',
  hotel_checkout_time TEXT DEFAULT '11:00 AM',
  hotel_confirmation TEXT,
  hotel_phone TEXT,

  -- Return flight
  return_flight_number TEXT,
  return_airline TEXT,
  return_origin_airport TEXT,
  return_dest_airport TEXT,
  return_departs_at TIMESTAMPTZ,
  return_arrives_at TIMESTAMPTZ,
  return_seat TEXT,
  return_terminal TEXT,
  return_confirmation TEXT,

  -- Computed logistics
  leave_home_by TIMESTAMPTZ,
  leave_hotel_by TIMESTAMPTZ,
  drive_to_airport_min INT DEFAULT 60,
  drive_from_airport_min INT DEFAULT 30,

  -- AI-generated content
  destination_weather JSONB DEFAULT '[]'::JSONB,
  packing_suggestions JSONB DEFAULT '[]'::JSONB,
  ai_notes TEXT,
  home_coverage_notes TEXT,

  -- Metadata
  gmail_message_ids JSONB DEFAULT '[]'::JSONB,
  trip_start_date DATE,
  trip_end_date DATE,
  status TEXT DEFAULT 'confirmed',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips_all" ON trips FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_trips_start ON trips(trip_start_date);
CREATE INDEX IF NOT EXISTS idx_trips_member ON trips(family_member_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
