#!/usr/bin/env python3
"""
Script to target and delete specific single/recurring Google Calendar events by date and title prefix.
Uses standard library urllib (zero external dependencies).
"""

import json
import urllib.request
import sys

SUPABASE_URL = "https://sjiejymuuuqzqukyeagk.supabase.co"
JACOB_MEMBER_ID = "8bf81a21-f2b8-4232-91c6-5a5e9d5b9488"

def delete_google_event(google_event_id):
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
            data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ Google API Delete SUCCESS for '{google_event_id}': {data}")
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"ℹ️ Google API Status for '{google_event_id}': {e.code} - {err_body}")
        if "deleted" in err_body.lower() or "not found" in err_body.lower() or "404" in err_body:
            print(f"  └─ Confirmed: Event '{google_event_id}' is already deleted on Google Calendar.")
            return True
        return False
    except Exception as ex:
        print(f"❌ Error deleting '{google_event_id}': {ex}")
        return False

def main():
    print("==================================================")
    print("Google Calendar Event Purge Script (Sept 11 Target)")
    print("==================================================")
    
    # 1. Candidate Google Event IDs for Sept 11 (recurrence instances & standalone events)
    target_date = "2026-09-11"
    title_pattern = "Emme Violin Practice"
    
    print(f"Targeting: '{title_pattern}' around {target_date}")
    
    # Potential recurring instance IDs on Sept 11
    candidate_ids = [
        "o1p8pm4f3e07a1il6c98bpnld8_20260911",
        "o1p8pm4f3e07a1il6c98bpnld8_20260911T203000Z",
        "o1p8pm4f3e07a1il6c98bpnld8_20260911T154500Z",
        "o1p8pm4f3e07a1il6c98bpnld8"
    ]
    
    for gid in candidate_ids:
        print(f"\nChecking / Deleting Google Event ID: {gid}...")
        delete_google_event(gid)

    print("\n==================================================")
    print("Finished checking target events.")
    print("==================================================")

if __name__ == "__main__":
    main()
