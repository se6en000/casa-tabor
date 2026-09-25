# AGENTS.md - System Boundaries & Operational Rules

## Active program: The Family Wall
Read `FAMILY_WALL_PLAN.md` before starting homepage, kiosk, logistics, or test/ship-speed work. It is the shared checklist every agent updates: claim an item (`[~]`), check it off (`[x]`) only when every "Done means" line is true and the Evidence line is filled in, and update the file in the same commit as the work. Never lower an item's bar to check it off.

## Test-first & Verification Protocol
1. **Test first:** write a test that imports and runs the code for the change (not a source-text/regex check), and watch it fail.
2. **Build:** write the code until the test passes; run the full suite and gates.
3. **Prove it live:** ship with `bash scripts/ship.sh`, then verify the real result on production and, for anything the wall shows, on the Pi kiosk at 1920×1080. Re-run the exact repro for bug fixes.
4. **Record evidence:** commit SHA, test names, and what was verified live, in `FAMILY_WALL_PLAN.md` when the work is a plan item.
5. **Keep going:** no stopping for review between steps. Stop only for product decisions, design approvals the plan requires, or a real blocker. Report regressions immediately, even ones already fixed.
