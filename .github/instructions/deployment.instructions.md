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

## Supabase edge functions

Deploy individual edge functions with:
```bash
npx supabase functions deploy FUNCTION_NAME --project-ref sjiejymuuuqzqukyeagk
```

Never use the base64 management API approach to deploy functions.

## Project refs
- Vercel project: `casa-projects/casa-tabor`
- Supabase project ref: `sjiejymuuuqzqukyeagk`
