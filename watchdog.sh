#!/bin/bash
# Persistent watchdog — restarts the dev server if it ever dies.
# Runs forever as a child of PID 1 (tini).
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..." >> /home/z/my-project/watchdog.log
  node /home/z/my-project/node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Dev server exited (code $EXIT_CODE). Restarting in 3s..." >> /home/z/my-project/watchdog.log
  sleep 3
done
