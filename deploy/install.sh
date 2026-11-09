#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# This script targets the already inspected moted EC2; no existing app is stopped.
[ -f backend/.env ] || { echo 'Server-only backend/.env is required'; exit 1; }
NODE_OPTIONS=--max-old-space-size=384 pnpm install --frozen-lockfile --ignore-scripts --network-concurrency=2 --child-concurrency=1
pnpm --dir backend prisma:generate
mkdir -p /home/ubuntu/interview-rewards-data
[ -f /home/ubuntu/interview-rewards-data/interview.db ] || touch /home/ubuntu/interview-rewards-data/interview.db
pnpm --dir backend db:migrate
pm2 startOrRestart deploy/ecosystem.config.cjs --update-env
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3411/api/health && curl -fsS http://172.18.0.1:3410/ >/dev/null; then exit 0; fi
  sleep 1
done
exit 1
