---
description: Critical operational notes for Casa ↔ iOS Reminders terminal sync on Mac
---

# iOS Reminders Sync (Mac terminal scripts) — Critical Build Dependency

Casa grocery sync with Apple Reminders is not only an edge-function feature; it also depends on local Mac scripts + launchd jobs.

## Source-of-truth runtime scripts (Mac)

- `~/.casa-sync/sync-shopping.sh` (Casa → iOS Reminders)
- `~/.casa-sync/sync-ios-to-casa.sh` (iOS Reminders → Casa)
- Config: `~/.casa-sync.env` (includes `REMINDERS_LIST`)

## LaunchAgents that must be loaded

- `~/Library/LaunchAgents/com.casa.sync.shopping.plist`
- `~/Library/LaunchAgents/com.casa.sync.ios-to-casa.plist`

Expected check:

```bash
launchctl list | grep -E 'com\.casa\.sync\.(shopping|ios-to-casa)'
```

## Health checks (required before blaming app code)

1. Verify Casa→iOS log:
   - `~/.casa-sync/launchd.log` (launchd stderr/stdout)
   - `~/.casa-sync/sync.log` (successful Casa→iOS runs)
2. Verify iOS→Casa log:
   - `~/.casa-sync/ios_to_casa_launchd.log`
   - `~/.casa-sync/ios_to_casa.log`
3. Validate target Reminders list exists and is correct:
   - `osascript -e 'tell application "Reminders" to get name of every list'`
   - ensure `REMINDERS_LIST` matches (currently `Shopping` in env)

## Known failure mode

- If `com.casa.sync.shopping` shows non-zero exit / repeated AppleScript `-1728` errors (e.g. “Can’t get item N of every reminder…”), Casa→iOS sync is broken even if edge functions are healthy.
- In this state, Grocery page may show sync deltas, but Shopping list will not update reliably.

