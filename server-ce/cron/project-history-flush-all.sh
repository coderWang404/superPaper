#!/usr/bin/env bash

set -eu

echo "---------------------------------"
echo "Flush all project-history changes"
echo "---------------------------------"
date

source /etc/container_environment.sh
source /etc/superpaper/env.sh
cd /superpaper/services/project-history && /sbin/setuser www-data node scripts/flush_all.js

echo "Done flushing all project-history changes"
