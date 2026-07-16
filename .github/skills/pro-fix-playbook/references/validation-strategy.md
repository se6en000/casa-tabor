# Risk-Based Validation Strategy

Load this reference when choosing checks or when a focused check fails.

## Tier 0

- Review the diff.
- Run an existing documentation or generated-content check only if the changed
  content participates in one.

## Tier 1

- Add or update the smallest regression test that captures changed behavior.
- Run that focused test.
- Lint changed files when supported.
- Run the narrowest relevant type-check.

Escalate to Tier 2 when a shared contract, exported type, common helper, or
multiple consumer is affected.

## Tier 2

- Run focused regression and nearby non-regression tests while iterating.
- Run repository type-check and the relevant build before release.
- Run the full suite once after implementation stabilizes.
- Exercise the changed UI/API path locally when automated tests cannot prove the
  interaction.

Escalate to Tier 3 when production state, schema, identity, authorization,
external synchronization, or destructive behavior is involved.

## Tier 3

- Capture a baseline or reproduction before mutation.
- Test the broken case, valid non-regression, and critical edge/failure states.
- Run focused checks during iteration.
- Run full tests, type-check, lint/certification required by the repository, and
  production build once before release.
- Use a guarded runtime fixture or dry run where available.
- Verify migrations/backfills with exact preconditions and postconditions.
- After deployment, verify target revision, queue/service health, and the real
  affected path.

## Escalation rules

Expand validation when:

- a focused test fails outside the expected assertion;
- shared code has consumers not covered by focused tests;
- generated artifacts or bundling may differ from type-check behavior;
- the change crosses client/server or database/external-service boundaries;
- repository release rules mandate a broader gate.

Do not expand merely because a broader command exists.

## Failure handling

- Distinguish pre-existing failures from change-caused failures with evidence.
- Fix directly coupled failures.
- Report unrelated failures without broadening the patch.
- Never suppress, skip, or weaken an existing gate to make the change pass.
