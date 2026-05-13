#!/usr/bin/env bash
set -euo pipefail

if [[ "${SUPERPAPER_IS_SERVER_PRO:-null}" == "true" ]]; then
  environment="server-pro"
else
  environment="server-ce"
fi

echo "Running migrations for $environment"
cd /superpaper/tools/migrations
/sbin/setuser www-data yarn run migrations migrate -t "$environment"
echo "Finished migrations"
