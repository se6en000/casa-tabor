# Original User Request

## 2026-08-23T11:40:20Z

Build an autonomous, evidence-grounded household email intelligence system for Casa Tabor. Start with a phased discovery pipeline that extracts, anonymizes, and semantically clusters 1,000+ real historical emails across linked family Gmail accounts into the 6 household archetypes, produces an empirical pattern report and benchmark holdout dataset, and implements a self-learning ingestion engine with dynamic few-shot exemplar memory and strict omnichannel kiosk UX guarantees.

Working directory: /Users/taboj/casa-tabor
Integrity mode: development

## Requirements

### R1. Historical Corpus Harvester & Semantic Clusterer
Build an extraction and clustering pipeline that pulls historical messages (1,000+ emails across Primary, Updates, and Promotions) from connected family Gmail accounts, deduplicates and anonymizes PII, and groups them into the 6 core household semantic archetypes:
1. **Logistics & Parcels** (e-commerce, groceries, couriers, meal kits)
2. **Executive Action Tasks** (permission slips, waivers, bills/invoices, registrations)
3. **Temporal Appointments** (doctor, school, travel, sports)
4. **Lifecycle State Updates** (flight schedule changes, order edits, delivery delays)
5. **Estate Context & Knowledge** (newsletters, HOA, maintenance)
6. **Promotional Noise** (marketing, sales, automated digests)

### R2. Empirical Evidence Report & Ground-Truth Benchmark
Deliver a comprehensive, evidence-grounded empirical report documenting real email patterns, common edge cases, failure modes of naive keyword matching, and a validated 200+ email ground-truth holdout benchmark dataset with labeled expected routing, extracted fields, and agency levels.

### R3. Deterministic Entity & Canonical Order Resolver
Implement multi-vendor canonical identity resolution that normalizes order numbers (Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh) and tracking numbers (UPS, FedEx, USPS, DHL) into unified composite thread keys, ensuring hyphenated/unhyphenated and multi-stage updates consolidate seamlessly.

### R4. Autonomous Active-Learning Ingestion Engine
Build a 3-tier ingestion engine featuring:
- **Compound Decomposer**: Breaks complex newsletters and attached PDF flyers into discrete action tasks and calendar appointments.
- **Dynamic Few-Shot Exemplar Store**: Retrieves and injects the most relevant historical golden examples for that domain/vendor at runtime.
- **Active Feedback Loop**: Learns from user interactions (fast dismissals, completions, title/date corrections, and voice directives) to dynamically update \`household_capture_rules\` without requiring manual code changes.

### R5. Verification Harness & Omnichannel Kiosk Integration
Build an automated evaluation runner that tests the entire ingestion pipeline against the ground-truth benchmark and existing project test suites (1,698+ tests), guaranteeing zero noise leakage into the Executive Action Queue and maintaining the strict 3-click navigation limit on touch kiosks and mobile displays.

## Acceptance Criteria

### Empirical Corpus & Benchmark
- [ ] Automated extraction and semantic clustering completed for 1,000+ family emails across linked accounts.
- [ ] Ground-truth holdout benchmark dataset (200+ curated test cases) created and checked into \`tests/fixtures/email-benchmark.json\`.
- [ ] Empirical evidence report generated detailing discovered patterns, vendor format nuances, and classification accuracy.

### Ingestion Accuracy & Lifecycle Tracking
- [ ] Ingestion pipeline achieves >= 98% accuracy across all 6 archetypes on the benchmark holdout set.
- [ ] 0% false leakage of passive return/claim policy disclaimers or shipping tracking into the Executive Action Queue.
- [ ] Multi-email lifecycle progression (Order Placed -> Being Prepared -> Out for Delivery -> Delivered) validated with zero premature next-day auto-resolutions.

### Self-Learning & Adaptation
- [ ] User dismissal or voice instruction (e.g. "tennis updates are informational") automatically synthesizes and persists a learned rule in \`household_capture_rules\`.
- [ ] Subsequent emails from that domain are routed according to the learned directive without application restarts or code edits.

### Test & Regression Safety
- [ ] Full regression suite (\`npm test\`) passes with 0 failures across all 1,698+ existing test cases.
