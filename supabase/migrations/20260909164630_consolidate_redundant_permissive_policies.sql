-- Every policy pair here is `qual: true` on both sides for the same roles --
-- the broader ALL-scope policy already covers what the narrower one grants,
-- so Postgres evaluates two identical-outcome permissive policies on every
-- row of every affected query. Dropping the redundant narrower policy is a
-- pure performance fix: it does not change what anon/authenticated/etc. can
-- actually do on these tables (verified via pg_policies before writing this).

DROP POLICY "attention topic rules are readable" ON public.attention_topic_rules;

DROP POLICY "family can read conflicts" ON public.conflicts;
DROP POLICY "family can update conflicts" ON public.conflicts;

DROP POLICY "availability exceptions read" ON public.member_availability_exceptions;

DROP POLICY "availability rules read" ON public.member_availability_rules;

DROP POLICY "personal artwork is readable" ON public.personal_artwork;

DROP POLICY "family can insert prep_item_feedback" ON public.prep_item_feedback;
DROP POLICY "family can read prep_item_feedback" ON public.prep_item_feedback;

DROP POLICY "family can read prep_item_suppressions" ON public.prep_item_suppressions;

DROP POLICY "family can read prep_items" ON public.prep_items;
DROP POLICY "family can update prep_items" ON public.prep_items;

DROP POLICY "public read sensor_readings" ON public.sensor_readings;
