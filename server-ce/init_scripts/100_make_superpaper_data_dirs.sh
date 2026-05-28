#!/bin/bash
set -e

mkdir -p /var/log/superpaper
chown www-data:www-data /var/log/superpaper

mkdir -p /var/lib/superpaper/data
chown www-data:www-data /var/lib/superpaper/data

mkdir -p /var/lib/superpaper/data/compiles
chown www-data:www-data /var/lib/superpaper/data/compiles

mkdir -p /var/lib/superpaper/data/output
chown www-data:www-data /var/lib/superpaper/data/output

mkdir -p /var/lib/superpaper/data/cache
chown www-data:www-data /var/lib/superpaper/data/cache

mkdir -p /var/lib/superpaper/data/template_files
chown www-data:www-data /var/lib/superpaper/data/template_files

mkdir -p /var/lib/superpaper/data/history
chown www-data:www-data /var/lib/superpaper/data/history

mkdir -p /var/lib/superpaper/tmp/projectHistories
chown www-data:www-data /var/lib/superpaper/tmp/projectHistories

mkdir -p /var/lib/superpaper/tmp/dumpFolder
chown www-data:www-data /var/lib/superpaper/tmp/dumpFolder

mkdir -p /var/lib/superpaper/tmp
chown www-data:www-data /var/lib/superpaper/tmp

mkdir -p /var/lib/superpaper/tmp/uploads
chown www-data:www-data /var/lib/superpaper/tmp/uploads

mkdir -p /var/lib/superpaper/tmp/dumpFolder
chown www-data:www-data /var/lib/superpaper/tmp/dumpFolder
