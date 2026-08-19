#!/usr/bin/env python3
"""
Python script to trigger a direct Google Calendar search and mass purge of single/recurring events matching a text query.
"""

import json
import sys
import urllib.request

SUPABASE_URL = "https://sjiejymuuuqzqukyeagk.supabase.co"
JACOB_MEMBER_ID = "8bf81a21-f2b8-4232-91c6-5a5e9d5b9488"

def mass_purge_google_events(query):
    endpoint = f"{SUPABASE_URL}/functions/v1/delete-google-event"
    payload = json.dumps({
        "search_q": query,
        "source_member_id": JACOB_MEMBER_ID
    }).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    print(f"==================================================")
    print(f"Initiating Google Calendar Mass Purge for query: '{query}'")
    print(f"==================================================")

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print("✅ Mass Purge Response:")
            print(json.dumps(data, indent=2))
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"❌ Mass Purge Failed (Status {e.code}): {body}")
        return None
    except Exception as ex:
        print(f"❌ Exception: {ex}")
        return None

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "Emme Violin Practice"
    mass_purge_google_events(query)
