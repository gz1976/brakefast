# BrakeFast

Persönliche Morgenzeitung unter https://brakefast.ottobot.net

| Ordner | Rolle |
| --- | --- |
| `brakefast/` | Tägliche Pipeline (Cron 05:30 Europe/Vienna) |
| `brakefast-react/` | React-SPA (Zeitung + `#monitor`) |

Hub, Icons und VPS-Gesamtübersicht bleiben im Otto-Repo:
https://github.com/gz1976/Otto

## Entwickeln

```bash
cd brakefast-react && npm ci && npm test && npm run dev
```

Pipeline-Scripts nach `brakefast/scripts/` deployen:

```bash
./brakefast/deploy-brakefast.sh --dry-run
```

VPS-Ziele unverändert: Scripts → OpenClaw-Workspace `brakefast/scripts`,
SPA → `/docker/brakefast/react/dist/`.
