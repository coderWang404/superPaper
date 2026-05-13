#!/bin/bash
set -euo pipefail

switch_apt_sources() {
  local mirror="${DEBIAN_MIRROR:-https://ftp.debian.org/debian}"
  local security_mirror="${DEBIAN_SECURITY_MIRROR:-https://security.debian.org/debian-security}"

  if [[ -f /etc/apt/sources.list.d/debian.sources ]]; then
    sed -i \
      -e "s#http://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#https://deb.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://security.debian.org/debian-security#${security_mirror}#g" \
      -e "s#http://deb.debian.org/debian#${mirror}#g" \
      -e "s#https://deb.debian.org/debian#${mirror}#g" \
      /etc/apt/sources.list.d/debian.sources
  fi

  if [[ -f /etc/apt/sources.list ]]; then
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
  local attempt=1
  local max_attempts=5
  while true; do
    "$@" && return 0
    local status=$?
    if (( attempt >= max_attempts )); then
      return "${status}"
    fi
    apt-get clean || true
    rm -rf /var/lib/apt/lists/*
    sleep $((attempt * 10))
    attempt=$((attempt + 1))
  done
}

switch_apt_sources
retry apt-get update
retry apt-get install -y --no-install-recommends \
  poppler-utils \
  ghostscript

rm -rf /var/lib/apt/lists/*

# Allow ImageMagick to process PDF files. This is for tests only, but since we
# use the production images for tests, this will apply to production as well.
patch /etc/ImageMagick-6/policy.xml <<EOF
--- old.xml	2022-03-23 09:16:03.985433900 -0400
+++ new.xml	2022-03-23 09:16:18.625471992 -0400
@@ -91,6 +91,5 @@
   <policy domain="coder" rights="none" pattern="PS2" />
   <policy domain="coder" rights="none" pattern="PS3" />
   <policy domain="coder" rights="none" pattern="EPS" />
-  <policy domain="coder" rights="none" pattern="PDF" />
   <policy domain="coder" rights="none" pattern="XPS" />
 </policymap>
EOF
