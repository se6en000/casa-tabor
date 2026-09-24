#!/usr/bin/env bash
# Thin wrapper around the Supabase CLI that sources this repo's .env.local first.
#
# Why this exists: `npx supabase login` does not work in this environment -- it
# reports success but writes no credential file (confirmed 2026-09-23, --debug
# shows it just does a GET /v1/profile and reports success regardless). The real
# auth path is SUPABASE_ACCESS_TOKEN, kept in .env.local (gitignored) rather than
# a shell profile. Use this script instead of `npx supabase` directly so nobody
# has to remember to `source .env.local` by hand every session.
#
# Usage: bash scripts/supabase-cli.sh functions deploy ai-assistant --project-ref sjiejymuuuqzqukyeagk
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env.local ]; then
  echo "scripts/supabase-cli.sh: .env.local not found -- see CLAUDE.md's Supabase CLI auth note." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "scripts/supabase-cli.sh: SUPABASE_ACCESS_TOKEN is not set in .env.local." >&2
  echo "Generate one at https://supabase.com/dashboard/account/tokens and add it as:" >&2
  echo "  SUPABASE_ACCESS_TOKEN=<token>" >&2
  exit 1
fi

exec npx supabase "$@"
