#!/bin/sh

# add the node user to the docker group on the host
DOCKER_GROUP=$(stat -c '%g' /var/run/docker.sock)
groupadd --non-unique --gid "${DOCKER_GROUP}" dockeronhost
usermod -aG dockeronhost node

# compatibility: initial volume setup
mkdir -p /superpaper/services/clsi/cache && chown node:node /superpaper/services/clsi/cache
mkdir -p /superpaper/services/clsi/compiles && chown node:node /superpaper/services/clsi/compiles
mkdir -p /superpaper/services/clsi/output && chown node:node /superpaper/services/clsi/output
mkdir -p /superpaper/services/clsi/uploads && chown node:node /superpaper/services/clsi/uploads

exec runuser -u node -- "$@"
