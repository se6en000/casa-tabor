# BRIEFING — 2026-08-23T11:48:30Z

## Mission
Spec Miner for Milestone 3: Deep-dive into authoritative specifications, patterns, regexes, edge cases, lifecycle state machine rules, courier tracking, and composite keys for Canonical Order Resolver.

## 🔒 My Identity
- Archetype: Specification Miner (Explorer 3)
- Roles: Teamwork specialist, Domain expert
- Working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3
- Original parent: 2796d939-3ba1-4f06-bf95-9c7a74c92eb0
- Milestone: Milestone 3 (Deterministic Entity & Canonical Order Resolver)

## 🔒 Key Constraints
- Read-only on source code — do NOT implement or modify source code files.
- Discover and document ALL features, edge cases, error behaviors, input/output formats.
- Follow 5-component handoff protocol and briefing maintenance.
- Write report to /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md.

## Current Parent
- Conversation ID: 2796d939-3ba1-4f06-bf95-9c7a74c92eb0
- Updated: 2026-08-23T11:48:30Z

## Task Summary
- **What to investigate**:
  1. Multi-vendor order number patterns and canonicalization (Amazon, Walmart, Target, Apple, Nike, Jiffy, HelloFresh, etc.)
  2. Courier tracking formats (UPS, FedEx, USPS, DHL)
  3. Composite thread keys (linking vendor order + courier tracking seamlessly across multi-stage updates)
  4. Lifecycle state machine rules & transitions
  5. Date logic: future arrival date handling, past courier auto-resolution rules
  6. Executive Action Queue filtering rules: `agency_level: 0`, `policy_disclaimer` extraction
- **Success criteria**: Comprehensive, exhaustive specification report with standard feature tables, edge case tables, regex formulations, state machine transition matrices, and composite key rules.
- **Interface contracts**: PROJECT.md § Interface Contracts
- **Code layout**: PROJECT.md § Code Layout & Write Boundaries

## Key Decisions Made
- Completed exhaustive specification report at `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md` covering 25 discovered features and 16 edge cases.
- Completed handoff report at `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/handoff.md`.

## Artifact Index
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md — Comprehensive domain and specification report
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/handoff.md — 5-component handoff report
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/DISPATCH.md — Initial dispatch instructions
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/progress.md — Liveness & status tracking
