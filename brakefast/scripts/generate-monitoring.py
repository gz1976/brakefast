#!/usr/bin/env python3
"""
Otto Monitoring Data Pipeline
Parst OpenClaw Session-Logs und generiert monitoring.json fuer das Dashboard.
"""

import json
import os
import glob
import subprocess
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from zoneinfo import ZoneInfo

BASE = '/data/.openclaw'
AGENTS_DIR = os.path.join(BASE, 'agents')
COST_FILE = os.path.join(BASE, 'workspace/logs/cost-tracking.json')
OUTPUT_FILE = '/data/brakefast-public/monitoring.json'
LOCAL_TZ = ZoneInfo('Europe/Vienna')


def heartbeat_is_enabled():
    """Return False when OpenClaw explicitly disables its heartbeat."""
    try:
        with open(os.path.join(BASE, 'openclaw.json'), 'r') as f:
            config = json.load(f)
        every = str(
            config.get('agents', {}).get('defaults', {}).get('heartbeat', {}).get('every', '')
        ).strip().lower()
        if every and every in {'0', '0m', '0h', 'off', 'disabled', 'false'}:
            return False
    except Exception:
        pass
    return True


def load_cron_jobs():
    """Read current cron state through the supported OpenClaw CLI."""
    try:
        result = subprocess.run(
            ['openclaw', 'cron', 'list', '--json'],
            capture_output=True,
            text=True,
            timeout=15,
        )
        payload = json.loads(result.stdout) if result.returncode == 0 else {}
        jobs = payload.get('jobs', payload) if isinstance(payload, dict) else payload
        return jobs if isinstance(jobs, list) else []
    except Exception:
        return []


def utc_iso_from_millis(timestamp_ms):
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z')

def count_sessions(agent_dir):
    """Zaehle JSONL Session-Dateien pro Agent"""
    sessions_dir = os.path.join(agent_dir, 'sessions')
    if not os.path.isdir(sessions_dir):
        return 0
    return len([f for f in os.listdir(sessions_dir) if f.endswith('.jsonl')])

def parse_session_logs(agent_id, agent_dir, days=7):
    """Parse Session-Logs und extrahiere Metriken"""
    sessions_dir = os.path.join(agent_dir, 'sessions')
    if not os.path.isdir(sessions_dir):
        return []
    
    cutoff = datetime.now() - timedelta(days=days)
    events = []
    
    for fname in os.listdir(sessions_dir):
        if not fname.endswith('.jsonl'):
            continue
        fpath = os.path.join(sessions_dir, fname)
        try:
            with open(fpath, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        ts_str = entry.get('timestamp', '')
                        if ts_str:
                            ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                            if ts.replace(tzinfo=None) >= cutoff:
                                events.append({
                                    'agent': agent_id,
                                    'type': entry.get('type', 'unknown'),
                                    'timestamp': ts_str,
                                    'data': entry
                                })
                    except (json.JSONDecodeError, ValueError):
                        continue
        except (IOError, PermissionError):
            continue
    
    return events

FALLBACK_MODEL_NAMES = {
    'moonshot/kimi-k2.5': 'Kimi K2.5',
    'openrouter/google/gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
    'openrouter/google/gemini-2.5-flash': 'Gemini 2.5 Flash',
    'openrouter/anthropic/claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'openrouter/anthropic/claude-haiku': 'Claude Haiku',
    'openrouter/deepseek/deepseek-v3.2': 'DeepSeek V3.2',
    'openrouter/openai/gpt-5-mini': 'GPT-5 Mini (OR)',
    'openai/gpt-5-mini': 'OpenAI GPT-5 Mini',
    'openai/gpt-5.2': 'OpenAI GPT-5.2',
    'openai/gpt-5.3-chat-latest': 'GPT-5.3 Instant',
    'nexos/69cf4ed2': 'Nexos GPT-5 4',
    'nexos/de63443f': 'Nexos GPT-5 4 Mini',
    'nexos/e25fa582': 'Nexos GPT-5 4 Nano',
    'nexos/19a8ad9a': 'Nexos (main)',
}


def _resolve_model_name(model_id, alias_map):
    if not model_id:
        return ''
    if model_id in alias_map:
        return alias_map[model_id]
    for prefix, name in FALLBACK_MODEL_NAMES.items():
        if model_id.startswith(prefix):
            return name
    return model_id


def get_agent_model(agent_id):
    """Resolve an agent's model id to a human-readable name.

    Reads openclaw.json's agents.models alias table first (authoritative),
    then falls back to FALLBACK_MODEL_NAMES for entries without an alias.
    Handles both legacy string-shaped `model` and new dict-shaped
    `model: {primary, fallbacks}`.
    """
    config_file = os.path.join(BASE, 'openclaw.json')
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
    except Exception:
        return 'Unknown'

    alias_map = {}
    for mid, mdef in (config.get('agents', {}).get('models') or {}).items():
        if isinstance(mdef, dict) and mdef.get('alias'):
            alias_map[mid] = mdef['alias']

    agents_section = config.get('agents', {})
    agent_model = None
    for agent in agents_section.get('list', []):
        if agent.get('id') == agent_id:
            agent_model = agent.get('model')
            break

    if not agent_model:
        agent_model = agents_section.get('defaults', {}).get('model')

    if isinstance(agent_model, dict):
        agent_model = agent_model.get('primary', '')

    resolved = _resolve_model_name(agent_model, alias_map) if isinstance(agent_model, str) else ''
    return resolved or 'Unknown'

def get_system_info():
    """Sammle System-Metriken"""
    # Disk
    try:
        result = subprocess.run(['df', '-h', '/'], capture_output=True, text=True)
        lines = result.stdout.strip().split('\n')
        if len(lines) >= 2:
            parts = lines[1].split()
            disk_pct = int(parts[4].replace('%', ''))
        else:
            disk_pct = 0
    except:
        disk_pct = 0
    
    # Uptime
    try:
        with open('/proc/uptime', 'r') as f:
            secs = float(f.read().split()[0])
        days = int(secs // 86400)
        hours = int((secs % 86400) // 3600)
        uptime = f'{days}d {hours}h'
    except:
        uptime = '—'
    
    # Docker is intentionally unavailable in the container. The host cron
    # injects its trusted count; manual runs degrade honestly to 0.
    raw_host_count = os.environ.get('BRAKEFAST_HOST_CONTAINER_COUNT', '').strip()
    if raw_host_count.isdigit():
        containers = int(raw_host_count)
    else:
        try:
            result = subprocess.run(
                ['docker', 'ps', '-q'], capture_output=True, text=True, timeout=3,
            )
            containers = len([line for line in result.stdout.splitlines() if line.strip()])
        except Exception:
            containers = 0

    return {
        'disk_percent': disk_pct,
        'uptime': uptime,
        'containers': containers,
    }

def build_activity_7d(all_events):
    """Erstelle Aktivitaets-Daten pro Tag und Agent"""
    today = datetime.now(LOCAL_TZ).date()
    activity = []
    
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.isoformat()
        counts = {'main': 0, 'worker': 0, 'expert': 0}
        
        for event in all_events:
            if event['type'] == 'session':
                try:
                    ts = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    if ts.astimezone(LOCAL_TZ).date() == day:
                        agent = event['agent']
                        if agent in counts:
                            counts[agent] += 1
                except:
                    continue
        
        activity.append({
            'date': day_str,
            'main': counts['main'],
            'worker': counts['worker'],
            'expert': counts['expert'],
        })
    
    return activity

def load_costs():
    """Lade Kosten-Daten"""
    try:
        with open(COST_FILE, 'r') as f:
            return json.load(f)
    except:
        return {
            'budget': {'daily_limit_usd': 5.0, 'monthly_limit_usd': 100.0},
            'daily_totals': {},
            'monthly_total_usd': 0.0,
        }

def build_recent_events(all_events, limit=15):
    """Erstelle Liste der letzten Ereignisse"""
    recent = []
    
    for event in all_events:
        evt_type = event['type']
        if evt_type in ('session', 'message', 'model_change'):
            data = event.get('data', {})
            summary = ''
            display_type = evt_type
            
            if evt_type == 'session':
                display_type = 'session'
                summary = f'Neue Session gestartet'
            elif evt_type == 'message':
                msg = data.get('message', {})
                role = msg.get('role', '')
                if role == 'user':
                    content = msg.get('content', '')
                    if isinstance(content, list):
                        text_parts = [p.get('text', '') for p in content if isinstance(p, dict)]
                        content = ' '.join(text_parts)
                    # Kuerzen
                    if 'HEARTBEAT' in content.upper():
                        display_type = 'heartbeat'
                        summary = 'Heartbeat Check'
                    elif 'BrakeFast' in content or 'brakefast' in content:
                        display_type = 'cron'
                        summary = 'BrakeFast Morgenzeitung'
                    elif 'security' in content.lower() or 'audit' in content.lower():
                        display_type = 'cron'
                        summary = 'Security Audit'
                    else:
                        display_type = 'telegram'
                        summary = content[:80] + ('...' if len(content) > 80 else '')
                else:
                    continue  # Nur user messages
            
            if summary:
                recent.append({
                    'timestamp': event['timestamp'],
                    'type': display_type,
                    'agent': event['agent'],
                    'summary': summary,
                })
    
    # Sortiere nach Timestamp (neueste zuerst)
    recent.sort(key=lambda x: x['timestamp'], reverse=True)
    return recent[:limit]

def main():
    now_utc = datetime.now(timezone.utc)
    now = now_utc.astimezone(LOCAL_TZ)
    
    # Agenten auflisten
    agent_ids = ['main', 'worker', 'expert']
    agents_info = {}
    all_events = []
    
    for agent_id in agent_ids:
        agent_dir = os.path.join(AGENTS_DIR, agent_id)
        model = get_agent_model(agent_id)
        sessions_count = count_sessions(agent_dir)
        events = parse_session_logs(agent_id, agent_dir, days=7)
        all_events.extend(events)
        
        agents_info[agent_id] = {
            'model': model,
            'status': 'active',
            'sessions_total': sessions_count,
        }
    
    # System-Info
    system = get_system_info()
    
    # Letzten Heartbeat finden und Alter klassifizieren
    heartbeat_events = [e for e in all_events if e['agent'] == 'worker']
    if not heartbeat_is_enabled():
        system['last_heartbeat'] = ''
        system['heartbeat_status'] = 'disabled'
    elif heartbeat_events:
        last_hb = max(heartbeat_events, key=lambda x: x['timestamp'])
        system['last_heartbeat'] = last_hb['timestamp']
        try:
            hb_ts = datetime.fromisoformat(last_hb['timestamp'].replace('Z', '+00:00'))
            now_tz = datetime.now(hb_ts.tzinfo) if hb_ts.tzinfo else datetime.now()
            age_h = (now_tz - hb_ts).total_seconds() / 3600
            if age_h < 2:
                system['heartbeat_status'] = 'healthy'
            elif age_h < 48:
                system['heartbeat_status'] = 'warn'
            else:
                system['heartbeat_status'] = 'stale'
        except Exception:
            system['heartbeat_status'] = 'unknown'
    else:
        system['last_heartbeat'] = ''
        system['heartbeat_status'] = 'unknown'

    # Letzter Audit: aus der aktuellen OpenClaw-Cron-API lesen.
    system['last_audit'] = ''
    for job in load_cron_jobs():
        name = (job.get('name') or '').lower()
        if 'audit' in name or 'security' in name:
            ts_ms = job.get('state', {}).get('lastRunAtMs')
            if ts_ms:
                system['last_audit'] = utc_iso_from_millis(ts_ms)
            break
    
    # Kosten laden
    cost_data = load_costs()
    today_str = now.strftime('%Y-%m-%d')
    today_costs = cost_data.get('daily_totals', {}).get(today_str, {})
    
    # Kosten-History (7 Tage)
    cost_history = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime('%Y-%m-%d')
        day_data = cost_data.get('daily_totals', {}).get(day, {})
        cost_history.append({
            'date': day,
            'total_usd': day_data.get('total_usd', 0.0),
            'calls': day_data.get('calls', 0),
            'by_model': day_data.get('by_model', {}),
        })
    
    # Routing-Verteilung
    session_counts = defaultdict(int)
    for event in all_events:
        if event['type'] == 'session':
            agent = event['agent']
            agent_key = 'self' if agent == 'main' else agent
            session_counts[agent_key] += 1
    
    # Fallback wenn keine Sessions
    if not session_counts:
        session_counts = {'self': agents_info.get('main', {}).get('sessions_total', 0),
                          'worker': agents_info.get('worker', {}).get('sessions_total', 0),
                          'expert': agents_info.get('expert', {}).get('sessions_total', 0)}
    
    routing = [{'agent': k, 'count': v} for k, v in session_counts.items()]
    
    # Modell-Stats
    models = []
    for agent_id in agent_ids:
        model = agents_info[agent_id]['model']
        tier = {'main': 'Tier 2', 'worker': 'Tier 1', 'expert': 'Tier 3'}.get(agent_id, '?')
        sessions = agents_info[agent_id]['sessions_total']
        cost = 0.0 if 'Nexos' in model or 'Gemini' in model or 'Claude' in model else cost_data.get('monthly_total_usd', 0)
        
        models.append({
            'model': model,
            'tier': tier,
            'calls': sessions,
            'avg_latency_ms': 0,  # Koennte aus Session-Logs berechnet werden
            'errors': 0,
            # No reliable outcome field exists in the current session log.
            # Zero is rendered as n/a by the frontend, not as a fake 100%.
            'success_rate': 0,
            'estimated_cost_usd': cost,
        })
    
    # Output zusammenbauen
    monitoring = {
        'generated': now_utc.isoformat().replace('+00:00', 'Z'),
        'period': 'Letzte 7 Tage',
        'agents': agents_info,
        'activity_7d': build_activity_7d(all_events),
        'costs': {
            'today_usd': today_costs.get('total_usd', 0.0),
            'month_usd': cost_data.get('monthly_total_usd', 0.0),
            'daily_limit_usd': cost_data.get('budget', {}).get('daily_limit_usd', 5.0),
            'monthly_limit_usd': cost_data.get('budget', {}).get('monthly_limit_usd', 100.0),
            'history_7d': cost_history,
        },
        'routing': routing,
        'models': models,
        'system': system,
        'recent_events': build_recent_events(all_events),
    }
    
    # Schreibe Output
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(monitoring, f, indent=2, ensure_ascii=False)
    
    print(f'Monitoring data generated: {OUTPUT_FILE}')
    print(f'Agents: {list(agents_info.keys())}')
    print(f'Total events parsed: {len(all_events)}')

if __name__ == '__main__':
    main()
