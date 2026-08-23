## 2026-08-23T11:56:53Z

<USER_REQUEST>
You are Explorer 2 for Milestone 1 Iteration 2 (Historical Corpus Harvester & Semantic Clusterer).
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2_it2/
Project Root: /Users/taboj/casa-tabor

MANDATORY INPUTS:
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md
4. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_1/report.md
5. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_2/report.md
6. `supabase/functions/_shared/email-clusterer.mjs`

TASK:
Investigate and design the classification precedence fixes:
1. Retailer Promotional Overlap: In `supabase/functions/_shared/email-clusterer.mjs`, Tier 1 retail domain routing must NOT short-circuit before checking promotional indicators (discounts, `% off`, `sale`, `coupon`, `promo`, `limited time`, `deals`, `save $`, `clearance`, marketing headers `List-Unsubscribe`). Marketing emails from Amazon, Walmart, Chewy, Target, DoorDash, HelloFresh MUST route to `promotional_noise`.
2. Only genuine parcel shipment, delivery confirmation, order placed, tracking updates should route to `logistics_parcels`.
3. Write report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2_it2/report.md` and `handoff.md`.
4. Notify parent with send_message.
</USER_REQUEST>
