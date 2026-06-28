---
name: alexa
description: "Apply Alexa-grade technical architecture and UX standards for Casa Tabor voice assistant reliability, latency, confirmations, multichannel behavior, and production observability. Use when planning/debugging assistant behavior, wake-word flow, STT/LLM latency, follow-up handling, or deterministic voice command design."
---

# Alexa Expert Skill

Use this skill to review, design, and debug Casa Tabor voice assistant behavior
with an Alexa-grade architecture lens.

## What this skill enforces

- Real-time pipeline thinking (wake -> ASR -> intent -> execute -> sync -> feedback)
- Deterministic core command lanes before broad LLM handling
- Strict stage latency budgets and P95/P99 accountability
- Confirmation/cancel safety and state-machine correctness
- Multichannel robustness (Pi kiosk, mobile, web)
- Explicit observability and failure taxonomy

## Default output style

1. Big-picture architecture assessment
2. Gap analysis vs Alexa-grade expectations
3. Priority-ranked implementation plan (incremental pushes)
4. Validation commands and acceptance criteria
