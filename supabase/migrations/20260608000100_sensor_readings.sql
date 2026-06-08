-- Single-row live sensor reading pushed by the Pi bridge every ~3s.
-- The bridge upserts into id='latest'; the UI reads this row via anon key.

CREATE TABLE IF NOT EXISTS sensor_readings (
  id          TEXT PRIMARY KEY DEFAULT 'latest',
  cct         FLOAT,
  lux         FLOAT,
  zone        TEXT,
  brightness  INT,
  rgb         INT[],
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- Anyone (anon, authenticated) can read the live reading
CREATE POLICY "public read sensor_readings"
  ON sensor_readings FOR SELECT USING (true);

-- Only service role can write (bridge uses service role key)
-- No INSERT/UPDATE policy → only bypassed by service role
