# BrakeFast

Persönliche Morgenzeitung: KI-kuratierte Artikel, Widgets und Monitor.
Live unter **https://brakefast.ottobot.net** (öffentlich, kein Login).

Dieses Repo ist eigenständig. Hub, nginx-Referenz und Icons liegen in
[Otto](https://github.com/gz1976/Otto). Du brauchst Otto nicht, um hier zu
entwickeln oder zu deployen.

| Ordner | Rolle |
| --- | --- |
| `brakefast/` | Tägliche Pipeline (Cron 05:30 Europe/Vienna) |
| `brakefast-react/` | React-SPA (Zeitung + `#monitor`) |

Kurz-Cheat-Sheet: [OPERATIONS.md](OPERATIONS.md). Frontend-Details:
[brakefast-react/README.md](brakefast-react/README.md).

## Geschwister-Repos

| Was | Repo | Lokal |
| --- | --- | --- |
| Hub + VPS-Docs | https://github.com/gz1976/Otto | `~/Projects/Otto` |
| Tesla Analytics + Preise | https://github.com/gz1976/tesla-apps | `~/Projects/Tesla-Apps` |
| KI-Modellübersicht | https://github.com/gz1976/model-desk | `~/Projects/ModelDesk` |

---

## VPS-Zugang

Gemeinsamer Hostinger-VPS `srv1420757` (Ubuntu 24.04). User `gerhard`,
nur Public-Key, passwortloses `sudo`.

| Was | Wert |
| --- | --- |
| SSH (empfohlen) | `ssh otto-vps` |
| IPv4 | `72.62.42.80` |
| IPv6 | `2a02:4780:79:f187::1` |
| Tailscale | `ssh gerhard@100.91.220.39` |
| ControlMaster-Socket | `~/.ssh/sockets/otto-vps` (60 min) |

**Nicht für SSH verwenden:** `clogzoehrer.ddns.net` und `desktop.ottobot.net`.
Die DDNS kann falsch routen; `desktop.ottobot.net` ist Guacamole, kein SSH-Ziel.
IPv4 Port 22 ist rate-limited — deshalb IPv6 im Alias.

### Einmalig: `~/.ssh/config`

```sshconfig
Host otto-vps
    HostName 2a02:4780:79:f187::1
    User gerhard
    IdentityFile ~/.ssh/id_ed25519
    ControlMaster auto
    ControlPath ~/.ssh/sockets/otto-vps
    ControlPersist 60m
```

```bash
mkdir -p ~/.ssh/sockets
ssh otto-vps
```

Wenn IPv6 nicht geht: `HostName 72.62.42.80` oder Tailscale. Master neu
öffnen: `ssh -O exit otto-vps; ssh otto-vps`.

rsync/scp nutzen denselben Alias: `rsync … otto-vps:/pfad`.

---

## How-to

### 1. Klonen und Frontend lokal

```bash
git clone https://github.com/gz1976/brakefast.git ~/Projects/BrakeFast
cd ~/Projects/BrakeFast/brakefast-react
npm ci
npm test
npm run dev
```

Dev lädt `/local-data.json` bzw. `/sample-data.json` aus `public/`.
Live-Ausgabe zum Entwickeln holen:

```bash
npm run sync-data
```

### 2. Pipeline lokal prüfen (ohne Deploy)

```bash
cd ~/Projects/BrakeFast
python3 -m py_compile brakefast/scripts/*.py
bash -n brakefast/scripts/*.sh
python3 -m pytest brakefast/scripts/*_test.py -q
```

Secrets und `sources.json`-Produktivwerte liegen nur auf dem Server
(`brakefast/config/` wird nicht aus Git deployed).

### 3. Scripts auf den VPS (Zeitung-Pipeline)

Ziel auf dem Host (Volume-Mount in den OpenClaw-Container):

`/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts/`

```bash
cd ~/Projects/BrakeFast
./brakefast/deploy-brakefast.sh --dry-run
./brakefast/deploy-brakefast.sh              # nur Scripts
./brakefast/deploy-brakefast.sh --sources    # plus sources.json
```

Das Script prüft Syntax, legt ein datiertes Backup unter
`…/brakefast/deploy-backups/` an, kopiert nach dem Host-Pfad und setzt
Owner `1000:1000` (Container-User `node`).

Falls `chown` mit Glob fehlschlägt (Verzeichnis für `gerhard` nicht
listbar, Glob bleibt literal):

```bash
ssh otto-vps "sudo find /docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts \
  -maxdepth 1 \( -name '*.py' -o -name '*.sh' \) -exec chown 1000:1000 {} +"
```

**Goldene Regel:** nie direkt im Container editieren.

### 4. React-SPA deployen

Ziel: `/docker/brakefast/react/dist/`

```bash
cd ~/Projects/BrakeFast/brakefast-react
npm test && npm run build

# Dry-run
rsync -anvi --delete --rsync-path='sudo rsync' -e ssh \
  dist/ otto-vps:/docker/brakefast/react/dist/

# Live (nach Backup auf dem Server)
rsync -azi --delete --rsync-path='sudo rsync' -e ssh \
  dist/ otto-vps:/docker/brakefast/react/dist/
```

`--delete` ist nötig, sonst bleiben alte content-gehashte Bundles liegen.

### 5. Pipeline manuell anstoßen

```bash
ssh otto-vps \
  "sudo docker exec openclaw-xfcd-openclaw-1 \
    su -s /bin/bash node -c \
    'bash /data/.openclaw/workspace/brakefast/scripts/brakefast-daily.sh'"
```

Cron: `/etc/cron.d/brakefast-direct` — `30 5 * * *` Europe/Vienna, Timeout 2400s.

### 6. Smoke nach Deploy

```bash
curl -sI https://brakefast.ottobot.net | head -1          # 200
curl -s https://brakefast.ottobot.net/latest/data.json | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d.get("meta",{}).get("date"), d.get("totalArticles"))'
```

Zeitung: https://brakefast.ottobot.net  
Monitor: https://brakefast.ottobot.net/#monitor  
Archiv: https://brakefast.ottobot.net/?edition=YYYY-MM-DD

---

## Pfade auf dem VPS

| Was | Host-Pfad |
| --- | --- |
| Scripts | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/scripts/` |
| Sources | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/sources.json` |
| Config / Secrets | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/config/` |
| Pipeline-Log | `/docker/openclaw-xfcd/data/.openclaw/workspace/brakefast/output/brakefast.log` |
| Publizierte Editionen | `/docker/openclaw-xfcd/data/brakefast-public/editions/YYYY/MM/DD/data.json` |
| Latest | `/docker/openclaw-xfcd/data/brakefast-public/data.json` (`/latest/data.json` ist nginx-Alias) |
| React-Dist | `/docker/brakefast/react/dist/` |
| Container | `openclaw-xfcd-openclaw-1` (User `node`, uid 1000) |

Im Container entsprechen die Workspace-Pfade `/data/.openclaw/workspace/brakefast/…`.

---

## Nicht tun

- nginx oder Cron von hier aus umbauen — das bleibt im Otto-Repo (`vps-reference/`).
- `output/` oder Secrets committen.
- Frontend-rsync ohne `--delete`.
- Auf dem Server Dateien als root liegen lassen (Pipeline braucht uid 1000).
