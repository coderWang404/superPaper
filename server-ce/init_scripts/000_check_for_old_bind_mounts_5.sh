#!/bin/bash

set -e

POTENTIAL_OLD_PATHS="
/etc/sharelatex
/var/lib/sharelatex
/var/log/sharelatex
"

OLD_ITEMS=""
for path in ${POTENTIAL_OLD_PATHS}; do
  if [[ -e "$path" ]]; then
    OLD_ITEMS="$OLD_ITEMS $path"
  fi
done

if [[ "$OLD_ITEMS" == "" ]]; then
  exit 0
fi

OLD_ITEMS=$(echo "$OLD_ITEMS" | xargs -n1 | sed 's/^/      - /')
N=$(echo "$OLD_ITEMS" | wc -l)
cat <<EOF
------------------------------------------------------------------------

                   ShareLaTeX to superPaper rebranding
                   ---------------------------------

  Starting with version 5.0, ShareLaTeX branded file system paths are no
   longer supported as we are migrating to the superPaper brand.

  Your configuration still uses $N ShareLaTeX branded paths:
$OLD_ITEMS

  Please update the in-container bind-mount target to refer to the
   superPaper equivalent:
    - /etc/sharelatex     -> /etc/superpaper
    - /var/lib/sharelatex -> /var/lib/superpaper
    - /var/log/sharelatex -> /var/log/superpaper

  superPaper toolkit setups:

    github.com/superpaper/toolkit$ bin/upgrade


  Legacy docker compose setups/Horizontal scaling setups:

    before:

      services:
        sharelatex:
          volumes:
           - /my/docker-host/path:/var/lib/sharelatex

    after:

      services:
        sharelatex:
          volumes:
           - /my/docker-host/path:/var/lib/superpaper


  Other deployment methods:

    Adapt the docker compose example or get in touch with support.


  Server Pro: Please update SANDBOXED_COMPILES_HOST_DIR if needed.


  Refusing to startup, exiting in 10s.

------------------------------------------------------------------------
EOF

sleep 10
exit 101
