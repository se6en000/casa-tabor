# Tier 3 Incident Checklist

Load this reference only for production incidents, destructive data work,
migrations, authentication, recurrence/synchronization, or comparable risk.

## Evidence

- Record the exact user-visible symptom and expected state.
- Correlate identifiers, timestamps, payloads, logs, and stored rows.
- Trace write -> storage -> read -> display/external projection.
- Identify the first point incorrect state is created.

## Blast radius

- Find parallel writers, readers, jobs, projections, and display surfaces.
- Confirm source-of-truth ownership and retry/idempotency semantics.
- Check existing bad data, queued work, external copies, and device clients.
- Define explicit non-goals.

## Decision gate

Obtain explicit confirmation before:

- destructive mutation;
- migration or backfill;
- changing source-of-truth or synchronization semantics;
- resolving ambiguous user-facing behavior;
- materially expanding scope.

## Remediation

- Stop new bad writes at the source.
- Shield existing data only when it can remain visible before repair.
- Guard migrations with reviewed counts, ownership, revisions, and rollback data.
- Preserve identity, idempotency, and optimistic-concurrency boundaries.

## Verification

- Prove the broken case and valid non-regression.
- Run the Tier 3 validation strategy.
- Verify exact post-mutation invariants and healthy queues.
- Deploy only affected targets according to repository rules.
- Confirm the expected revision and real runtime behavior.

## Handoff

- Root cause.
- Source fix.
- Existing-data/UX remediation.
- Validation and production invariants.
- Rollback artifact or strategy.
- Unrelated residual debt, clearly separated.
