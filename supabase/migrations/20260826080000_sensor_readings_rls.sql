-- Migration to allow Pi bridge and clients to upsert live sensor readings to sensor_readings table

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'sensor_readings' AND policyname = 'allow all on sensor_readings'
  ) THEN
    DROP POLICY "allow all on sensor_readings" ON public.sensor_readings;
  END IF;
END $$;

CREATE POLICY "allow all on sensor_readings"
  ON public.sensor_readings
  FOR ALL
  TO public, anon, authenticated
  USING (true)
  WITH CHECK (true);
