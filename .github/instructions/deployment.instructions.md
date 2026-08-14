---
description: Deployment rules for Casa Tabor
---

# Deployment Rules

## Mandatory Design System & Quality Gate (No Bypassing)

**CRITICAL: No Agent may deploy any change that does not strictly pass the Casa Tabor Design System and automated test suite.**

Before committing or pushing to any deployment target:
1. `npm run tokens:check` — zero token desyncs.
2. `npm run style:check` — zero style regressions (no raw hex colors, no sub-44px buttons, no arbitrary font sizes, no raw button recreations).
3. `npm run certify:experience` — experience certification must pass (primitive adoption >= 90%).
4. `npm test` — all 1,345+ test invariants must pass.

The unified deploy script (`npm run deploy` / `bash scripts/deploy.sh`) automatically enforces these gates and halts immediately if any check fails.

## Always deploy to BOTH targets

Whenever deploying, **always run both commands** — never just one:

```bash
# 1. Push to GitHub (triggers Vercel auto-deploy AND keeps git in sync)
git push origin main
git push deploy main

# 2. Direct Vercel production deploy (immediate, doesn't wait for git hook)
npx vercel --prod
```

Preferred one-command workflow (enforces both deploys + Pi refresh + verification):

```bash
bash pi/deploy-prod-and-refresh-pi.sh
```

## Mandatory Pi refresh after frontend changes (before asking user to test)

If the deployment includes frontend/client changes that affect runtime behavior, **always refresh the Pi kiosk session yourself before asking the user to test**.

Use this exact sequence:

```bash
ssh jake@192.168.86.118 'bash -lc "
for pid in $(pgrep -f \"/home/jake/start-casa.sh\" 2>/dev/null); do kill $pid 2>/dev/null || true; done
for pid in $(pgrep -f \"/usr/lib/chromium/chromium --\" 2>/dev/null); do kill $pid 2>/dev/null || true; done
sleep 4
export DISPLAY=:0 XAUTHORITY=/home/jake/.Xauthority XDG_RUNTIME_DIR=/run/user/1000
nohup /home/jake/start-casa.sh > /home/jake/casa.log 2>&1 < /dev/null & disown
"'
```

Then verify Chromium is running before handing back to the user:

```bash
ssh jake@192.168.86.118 'ps -eo pid,args | grep \"[/]usr/lib/chromium/chromium --\"'
```

If the launcher lock is stale, clear lock holders first (the script does this automatically):

```bash
ssh jake@192.168.86.118 'for pid in $(lsof -t /tmp/casa-kiosk-launch.lock 2>/dev/null | sort -u); do kill $pid 2>/dev/null || true; done; rm -f /tmp/casa-kiosk-launch.lock'
```

## Supabase edge functions

Deploy individual edge functions with:
```bash
npx supabase functions deploy FUNCTION_NAME --project-ref sjiejymuuuqzqukyeagk
```

Never use the base64 management API approach to deploy functions.

## Project refs
- Vercel project: `casa-projects/casa-tabor`
- Supabase project ref: `sjiejymuuuqzqukyeagk`
