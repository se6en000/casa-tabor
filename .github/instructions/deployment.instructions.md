---
description: Deployment rules for Casa Tabor
---

# Deployment Rules

## Always deploy to BOTH targets

Whenever deploying, **always run both commands** — never just one:

```bash
# 1. Push to GitHub (triggers Vercel auto-deploy AND keeps git in sync)
git push origin main

# 2. Direct Vercel production deploy (immediate, doesn't wait for git hook)
npx vercel --prod
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

## Supabase edge functions

Deploy individual edge functions with:
```bash
npx supabase functions deploy FUNCTION_NAME --project-ref sjiejymuuuqzqukyeagk
```

Never use the base64 management API approach to deploy functions.

## Project refs
- Vercel project: `casa-projects/casa-tabor`
- Supabase project ref: `sjiejymuuuqzqukyeagk`
