#!/usr/bin/env python3
"""Kill stuck BrakeFast processes and remove lock file."""
import os
import signal
import subprocess

# Find python processes holding the lock
result = subprocess.run(
    ["ps", "aux"],
    capture_output=True, text=True
)
for line in result.stdout.splitlines():
    if "article_briefing_engine" in line:
        parts = line.split()
        pid = int(parts[1])
        print(f"Killing PID {pid}: {' '.join(parts[-3:])}")
        os.kill(pid, signal.SIGKILL)

# Remove lock file
lock_path = "/data/.openclaw/workspace/brakefast/output/brakefast-daily.lock"
if os.path.exists(lock_path):
    os.remove(lock_path)
    print(f"Removed lock: {lock_path}")
else:
    print("No lock file found")

# Verify
result2 = subprocess.run(
    ["ps", "aux"],
    capture_output=True, text=True
)
still_running = [l for l in result2.stdout.splitlines() if "article_briefing_engine" in l]
if still_running:
    print(f"WARNING: Still running: {still_running}")
else:
    print("All BrakeFast processes killed successfully")

subprocess.run(["ls", "-la", lock_path], capture_output=True)
print(f"Lock file exists: {os.path.exists(lock_path)}")
