#!/usr/bin/env bash
set -euo pipefail

if [[ "${SUPERPAPER_IS_SERVER_PRO:-null}" == "true" ]]; then
  environment="server-pro"
else
  environment="server-ce"
fi

echo "Running migrations for $environment"
cd /superpaper/tools/migrations

if [[ "${SUPERPAPER_RUN_ALL_MIGRATIONS:-false}" == "true" ]]; then
  /sbin/setuser www-data yarn run migrations migrate -t "$environment"
else
  mapfile -t migrations < <(
    find . -maxdepth 1 -type f \( -name '*.js' -o -name '*.mjs' \) |
      sed 's#^\./##; s/\.[^.]*$//' |
      sort |
      awk '$0 <= "20250519101127_drop_deletedFiles"'
  )
  /sbin/setuser www-data yarn run migrations migrate -t "$environment" "${migrations[@]}"
fi
echo "Finished migrations"
