#!/usr/bin/env python3
"""Fetch today's Google Calendar events for BrakeFast.

Outputs JSON array of events to stdout.
Requires: google-api-python-client, google-auth-oauthlib

Usage:
    python3 fetch-calendar.py [token.json] [credentials.json]
"""
import json
import sys
import os
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

def main():
    token_file = sys.argv[1] if len(sys.argv) > 1 else '/data/.openclaw/workspace/brakefast/config/gcal_token.json'
    creds_file = sys.argv[2] if len(sys.argv) > 2 else '/data/.openclaw/workspace/brakefast/config/gcal_credentials.json'

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
    except ImportError:
        print("[]")
        sys.exit(0)

    if not os.path.exists(token_file):
        print("[]")
        sys.exit(0)

    with open(token_file) as f:
        token_data = json.load(f)

    creds = Credentials(
        token=token_data.get('token'),
        refresh_token=token_data['refresh_token'],
        token_uri=token_data['token_uri'],
        client_id=token_data['client_id'],
        client_secret=token_data['client_secret'],
        scopes=token_data.get('scopes', ['https://www.googleapis.com/auth/calendar.readonly'])
    )

    # Refresh token if expired
    if creds.expired or not creds.valid:
        creds.refresh(Request())
        # Save refreshed token
        token_data['token'] = creds.token
        with open(token_file, 'w') as f:
            json.dump(token_data, f, indent=2)

    service = build('calendar', 'v3', credentials=creds)

    # Vienna timezone: auto-detect CET (UTC+1) / CEST (UTC+2)
    vienna_tz = ZoneInfo('Europe/Vienna')
    now_vienna = datetime.now(vienna_tz)
    today_start = now_vienna.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = now_vienna.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

    events_result = service.events().list(
        calendarId='primary',
        timeMin=today_start,
        timeMax=today_end,
        singleEvents=True,
        orderBy='startTime',
        maxResults=10
    ).execute()

    items = events_result.get('items', [])
    calendar_events = []

    for event in items:
        start = event['start'].get('dateTime', event['start'].get('date', ''))
        # Extract time (HH:MM) or "ganztags"
        if 'T' in start:
            time_str = start.split('T')[1][:5]
        else:
            time_str = None  # all-day event

        title = event.get('summary', '(kein Titel)')

        # Skip all-day events like "homeOffice" for the dashboard
        if time_str is None:
            continue

        calendar_events.append({
            "time": time_str,
            "title": title
        })

    print(json.dumps(calendar_events, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
