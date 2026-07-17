-- Opt-in AI memory observations + structured bug tracking

CREATE TABLE IF NOT EXISTS public.ai_memory_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT,
  category TEXT NOT NULL DEFAULT 'habit',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'assistant',
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (category IN ('habit', 'preference', 'family_pattern', 'operational')),
  CHECK (status IN ('active', 'review', 'archived')),
  CHECK (source IN ('assistant', 'user', 'system'))
);

CREATE INDEX IF NOT EXISTS ai_memory_observations_observed_at_idx
  ON public.ai_memory_observations (observed_at DESC);

CREATE INDEX IF NOT EXISTS ai_memory_observations_status_idx
  ON public.ai_memory_observations (status);

CREATE TABLE IF NOT EXISTS public.ai_bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  details TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'user',
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'wont_fix')),
  CHECK (source IN ('user', 'assistant', 'system'))
);

CREATE INDEX IF NOT EXISTS ai_bug_reports_discovered_at_idx
  ON public.ai_bug_reports (discovered_at DESC);

CREATE INDEX IF NOT EXISTS ai_bug_reports_status_idx
  ON public.ai_bug_reports (status);

CREATE OR REPLACE FUNCTION public.touch_ai_memory_observations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_ai_bug_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_memory_observations_touch_updated_at ON public.ai_memory_observations;
CREATE TRIGGER trg_ai_memory_observations_touch_updated_at
BEFORE UPDATE ON public.ai_memory_observations
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_memory_observations_updated_at();

DROP TRIGGER IF EXISTS trg_ai_bug_reports_touch_updated_at ON public.ai_bug_reports;
CREATE TRIGGER trg_ai_bug_reports_touch_updated_at
BEFORE UPDATE ON public.ai_bug_reports
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_bug_reports_updated_at();

ALTER TABLE public.ai_memory_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bug_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_memory_observations'
      AND policyname = 'ai_memory_observations_all'
  ) THEN
    CREATE POLICY ai_memory_observations_all
      ON public.ai_memory_observations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_bug_reports'
      AND policyname = 'ai_bug_reports_all'
  ) THEN
    CREATE POLICY ai_bug_reports_all
      ON public.ai_bug_reports
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;
