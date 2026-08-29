# BrakeFast — Betrieb

| Was | Wert |
| --- | --- |
| Seite | https://brakefast.ottobot.net |
| Monitor | https://brakefast.ottobot.net/#monitor |
| Cron | `/etc/cron.d/brakefast-direct` — `30 5 * * *` Europe/Vienna |
| Scripts auf dem Host | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts/` |
| React-Dist | `/docker/brakefast/react/dist/` |
| Editionen | `/docker/openclaw-xfcd/data/brakefast-public/` |
| Deploy Scripts | `brakefast/deploy-brakefast.sh` |
| Frontend-Build | `cd brakefast-react && npm run build` dann rsync nach `/docker/brakefast/react/dist/` |

Kanonische VPS-Übersicht: https://github.com/gz1976/Otto/blob/main/docs/VPS-INFRASTRUCTURE.md
