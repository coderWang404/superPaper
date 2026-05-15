#!/bin/sh

set -ex

switch_apt_sources() {
  mirror="${DEBIAN_MIRROR:-https://mirrors.tuna.tsinghua.edu.cn/debian}"
  security_mirror="${DEBIAN_SECURITY_MIRROR:-https://mirrors.tuna.tsinghua.edu.cn/debian-security}"

  if [ -f /etc/apt/sources.list.d/debian.sources ]; then
    sed -i \
      -e "s#http://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#https://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://security.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://deb.debian.org/debian#${mirror}#g" \
      -e "s#https://deb.debian.org/debian#${mirror}#g" \
      /etc/apt/sources.list.d/debian.sources
  fi

  if [ -f /etc/apt/sources.list ]; then
    sed -i \
      -e "s#http://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#https://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://security.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://deb.debian.org/debian#${mirror}#g" \
      -e "s#https://deb.debian.org/debian#${mirror}#g" \
      /etc/apt/sources.list
  fi
}

retry() {
  attempt=1
  max_attempts=5
  while true; do
    "$@" && return 0
    status=$?
    if [ "$attempt" -ge "$max_attempts" ]; then
      return "$status"
    fi
    apt-get clean || true
    rm -rf /var/lib/apt/lists/*
    sleep $((attempt * 10))
    attempt=$((attempt + 1))
  done
}

switch_apt_sources
retry apt-get update
retry apt-get install jq parallel --yes --no-install-recommends

rm -rf /var/lib/apt/lists/*
