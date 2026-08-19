#!/usr/bin/env python3
"""
Simple CLI script to delete Google Calendar events via Casa Tabor's delete-google-event endpoint.

Usage:
    python3 scripts/delete_google_event_by_date.py <google_event_id>

Example:
    python3 scripts/delete_google_event_by_date.py o1p8pm4f3e07a1il6c98bpnld8
"""

import json
import sys
import urllib.request

SUPABASE_URL = "https://sjiejymuuuqzqukyeagk.supabase.co"
JACOB_MEMBER_ID = "8bf81a21-f2b8-4232-91c6-5a5e9d5b9488"

def delete_event(google_event_id):
    endpoint = f"{SUPABASE_URL}/functions/v1/delete-google-event"
    payload = json.dumps({
        "google_event_id": google_event_id,
        "event_id": "00000000-0000-0000-0000-000000000000",
        "source_member_id": JACOB_MEMBER_ID
    }).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ Google Calendar Delete Success for '{google_event_id}': {res_data}")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        if "404" in body or "not found" in body.lower() or "deleted" in body.lower():
            print(f"ℹ️ Google Calendar API: Event '{google_event_id}' is already deleted / 404 Not Found.")
            return True
        else:
            print(f"⚠️ Google Calendar API returned status {e.code}: {body}")
            return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/delete_google_event_by_date.py <google_event_id>")
        sys.exit(1)

    target_id = sys.argv[1]
    delete_event(target_id)
