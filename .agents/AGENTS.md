# AGENTS.md - System Boundaries & Operational Rules

## TDD & Verification Protocol
1. **RED:** Write the test for the requested feature first. Run it in the terminal. You MUST output the failing test log as an Artifact.
2. **STOP:** Pause and request my review. Do not write feature code yet.
3. **GREEN:** Write the feature code. Run the test again. Output the passing test log as an Artifact.
4. **PROOF:** For front-end changes, use the Browser Subagent to open localhost and generate a screenshot or browser recording Artifact of the working UI.
5. **RULE:** Never mark a task as complete without providing terminal logs or visual Artifacts as proof.
