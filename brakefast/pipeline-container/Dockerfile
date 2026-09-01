# BrakeFast Pipeline — eigenständige Laufzeit (Migration Phase 1)
#
# Ersetzt den OpenClaw-Container als Ausführungsumgebung der täglichen
# Pipeline. Versionen entsprechen dem Ist-Stand im OpenClaw-Container
# (Python 3.14.4, Node 24, Chromium/Debian trixie, Stand 2026-09-01).
#
# Der Container ist reine Laufzeit: Code und Daten kommen per Bind-Mount,
# getriggert wird per `docker exec` vom Host-Cron. Die Pfade im Container
# spiegeln bewusst die alten OpenClaw-Pfade, damit kein Script angepasst
# werden muss:
#   /data/.openclaw/workspace/brakefast  <- Repo-Checkout (brakefast/)
#   /data/brakefast-public               <- Ausgabe (nginx-Root)

FROM python:3.14-slim-trixie

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Europe/Vienna

RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        curl \
        jq \
        git \
        ca-certificates \
        tzdata \
        util-linux \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        requests \
        trafilatura \
        lxml \
        icalendar \
        recurring_ical_events \
        python-dateutil \
        charset-normalizer

WORKDIR /data/.openclaw/workspace/brakefast

CMD ["sleep", "infinity"]
