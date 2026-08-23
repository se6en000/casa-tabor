# Context: Casa Tabor Autonomous Household Email Intelligence System

## System Overview
Casa Tabor is an executive household operating system with ambient touch kiosks, mobile interfaces, Supabase database, and agentic intelligence.

## Goals & Boundaries
- Extract & cluster 1,000+ real family emails across 6 archetypes.
- Deliver empirical report + 200+ case ground-truth benchmark (`tests/fixtures/email-benchmark.json`).
- Implement canonical multi-vendor order & tracking normalization.
- Build active-learning ingestion engine (Compound Decomposer, Dynamic Few-Shot Store, Feedback Loop with `household_capture_rules`).
- Maintain >=98% benchmark accuracy, 0% executive action queue leakage, 3-click kiosk UX compliance, and 0 regression test failures across all 1,698+ existing test suite.

## Orchestration Directory Conventions
- Subagent workspaces located under `/Users/taboj/casa-tabor/.agents/<agent_name>/`
- Project root: `/Users/taboj/casa-tabor`
- All source code and test files strictly placed in proper project directories (e.g., `lib/`, `tests/`, `app/`, etc.), never in `.agents/`.
