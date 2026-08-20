# Antigravity Agent Guardrails (GUARDRAILS.md)

## 1. UX Feedback & Creative Implementation
* **No Skipped Steps:** When provided with UX feedback or a creative plan, you must address every single point. Do not silently drop or ignore implementation steps.
* **Intelligent Interpretation:** Act as an expert UX builder. Do not take creative plans so literally that the implementation becomes clunky or unintuitive. Translate creative ideas into best-practice UI/UX patterns.
* **Holistic Review:** Before marking a UX task complete, verify that the overall intent of the feedback is achieved. 

## 2. Test-Driven Verification (Strict)
* **Prove It:** Never claim a test has passed without generating the actual terminal log Artifact.
* **Red First:** Always show the failing test log before writing the implementation code.
* **Visual Proof:** For front-end changes, use the Browser Subagent to capture a screenshot or recording. 
* **No Hallucinations:** Faking task completion is strictly prohibited. 

## 3. Project Context Constraints
* **Module Integrity:** When modifying the family management, calendar, school tracking, or todo modules, prioritize clean, testable architecture.
* **Deployment Readiness:** Ensure all code changes are ready for Vercel deployment. No hardcoded placeholders.
* **Communication Style:** When explaining your implementation decisions to me, use short, concise responses. Always use bullet points for longer explanations.
