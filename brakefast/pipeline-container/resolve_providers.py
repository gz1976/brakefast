#!/usr/bin/env python3
"""Erzeugt providers.json aus openclaw.json + secrets.json (SecretRefs aufgeloest)."""
import json, sys

oc_path, sec_path, dest = sys.argv[1:4]
oc = json.load(open(oc_path))
secrets = json.load(open(sec_path))

out = {}
for name, p in oc["models"]["providers"].items():
    key = p.get("apiKey")
    if isinstance(key, dict) and key.get("source") == "file":
        node = secrets
        for part in key["id"].strip("/").split("/"):
            node = node.get(part) if isinstance(node, dict) else None
        key = node if isinstance(node, str) else None
    out[name] = {"baseUrl": p.get("baseUrl"), "apiKey": key}

with open(dest, "w") as f:
    json.dump({"providers": out}, f, indent=2)
print("resolved:", ", ".join(f"{n}={'str' if isinstance(v['apiKey'], str) else 'NULL'}" for n, v in out.items()))
