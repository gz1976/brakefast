# BrakeFast — Betrieb

| Was | Wert |
| --- | --- |
| Seite | https://brakefast.ottobot.net |
| Monitor | https://brakefast.ottobot.net/#monitor |
| Archiv | https://brakefast.ottobot.net/?edition=YYYY-MM-DD |
| SSH | `ssh otto-vps` (nicht `clogzoehrer.ddns.net`) |
| Cron | `/etc/cron.d/brakefast-direct` — `30 5 * * *` Europe/Vienna |
| Container | `openclaw-xfcd-openclaw-1` / User `node` (uid 1000) |
| Scripts auf dem Host | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts/` |
| React-Dist | `/docker/brakefast/react/dist/` |
| Editionen | `/docker/openclaw-xfcd/data/brakefast-public/` |
| Deploy Scripts | `./brakefast/deploy-brakefast.sh` (`--dry-run`, `--sources`) |
| Frontend-Build | `cd brakefast-react && npm run build` → rsync nach Dist |

How-to und SSH-Config: [README.md](README.md).

Gesamt-VPS (nginx, Authelia, andere Apps):
https://github.com/gz1976/Otto/blob/main/docs/VPS-INFRASTRUCTURE.md
