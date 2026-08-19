#!/usr/bin/env python3
"""
Parses exported .ics file, extracts all Google Event UIDs for matching 'Emme Violin' events,
and deletes them using delete-google-event endpoint.
"""

import json
import re
import sys
import urllib.request
import time

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
            return True, data
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        if "404" in body or "not found" in body.lower() or "deleted" in body.lower():
            return True, {"status": 404, "note": "already deleted"}
        return False, {"status": e.code, "error": body}
    except Exception as ex:
        return False, {"error": str(ex)}

def parse_ics(ics_path, title_query):
    with open(ics_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    blocks = content.split("BEGIN:VEVENT")
    matches = []

    for block in blocks[1:]:
        summary_m = re.search(r"SUMMARY:(.*)", block)
        uid_m = re.search(r"UID:(.*)", block)
        dtstart_m = re.search(r"DTSTART.*:(.*)", block)

        summary = summary_m.group(1).strip() if summary_m else ""
        uid = uid_m.group(1).strip() if uid_m else ""
        dtstart = dtstart_m.group(1).strip() if dtstart_m else ""

        # Clean Google iCal UID (Google Calendar UIDs end with @google.com)
        clean_uid = uid.replace("@google.com", "")

        if title_query.lower() in summary.lower():
            matches.append({
                "summary": summary,
                "raw_uid": uid,
                "clean_uid": clean_uid,
                "start": dtstart
            })

    return matches

def main():
    ics_file = sys.argv[1] if len(sys.argv) > 1 else "scratch_ical/Jacob Tabor_jacobrtabor@gmail.com.ics"
    query = sys.argv[2] if len(sys.argv) > 2 else "Violin"

    print("==================================================")
    print(f"Parsing ICS file: '{ics_file}' for query: '{query}'")
    print("==================================================")

    matches = parse_ics(ics_file, query)
    print(f"Found {len(matches)} matching events in .ics file:\n")

    if not matches:
        print("No matching events found in the .ics export.")
        return

    for idx, m in enumerate(matches, 1):
        print(f"[{idx}/{len(matches)}] {m['start']} | \"{m['summary']}\" | ID: {m['clean_uid']}")

    print("\n--------------------------------------------------")
    print(f"Executing Google Calendar API deletion for {len(matches)} events...")
    print("--------------------------------------------------")

    success_count = 0
    fail_count = 0

    for idx, m in enumerate(matches, 1):
        event_id = m['clean_uid']
        ok, res = delete_google_event(event_id)
        if ok:
            success_count += 1
            print(f"✅ [{idx}/{len(matches)}] Deleted '{event_id}' ({m['start']} - {m['summary']})")
        else:
            fail_count += 1
            print(f"❌ [{idx}/{len(matches)}] Failed '{event_id}': {res}")

        time.sleep(0.1)

    print("\n==================================================")
    print(f"Purge Summary: {success_count} succeeded, {fail_count} failed.")
    print("==================================================")

if __name__ == "__main__":
    main()
