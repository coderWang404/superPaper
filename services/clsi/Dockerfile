# This file was auto-generated, do not edit it directly.
# Instead run bin/update_build_scripts from
# https://github.com/superpaper/internal/

FROM node:24.14.1 AS base

WORKDIR /superpaper/services/clsi
ENV PATH="/superpaper/node_modules/.bin:$PATH"
RUN corepack enable
COPY services/clsi/install_deps.sh /superpaper/services/clsi/
RUN chmod 0755 ./install_deps.sh && ./install_deps.sh
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
COPY services/clsi/entrypoint.sh /

# Google Cloud Storage needs a writable $HOME/.config for resumable uploads
# (see https://googleapis.dev/nodejs/storage/latest/File.html#createWriteStream)
RUN mkdir /home/node/.config && chown node:node /home/node/.config

FROM base AS app

COPY package.json yarn.lock .yarnrc.yml /superpaper/
COPY libraries/fetch-utils/package.json /superpaper/libraries/fetch-utils/package.json
COPY libraries/logger/package.json /superpaper/libraries/logger/package.json
COPY libraries/metrics/package.json /superpaper/libraries/metrics/package.json
COPY libraries/o-error/package.json /superpaper/libraries/o-error/package.json
COPY libraries/superpaper-editor-core/package.json /superpaper/libraries/superpaper-editor-core/package.json
COPY libraries/promise-utils/package.json /superpaper/libraries/promise-utils/package.json
COPY libraries/settings/package.json /superpaper/libraries/settings/package.json
COPY libraries/stream-utils/package.json /superpaper/libraries/stream-utils/package.json
COPY services/clsi/package.json /superpaper/services/clsi/package.json
COPY .yarn/patches/ /superpaper/.yarn/patches/
COPY .yarn/releases/ /superpaper/.yarn/releases/
RUN chmod 0755 /superpaper/.yarn/releases/yarn-4.14.1.cjs && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarn && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarnpkg

RUN cd /superpaper && yarn workspaces focus @superpaper/clsi superpaper
COPY libraries/fetch-utils/ /superpaper/libraries/fetch-utils/
COPY libraries/logger/ /superpaper/libraries/logger/
COPY libraries/metrics/ /superpaper/libraries/metrics/
COPY libraries/o-error/ /superpaper/libraries/o-error/
COPY libraries/superpaper-editor-core/ /superpaper/libraries/superpaper-editor-core/
COPY libraries/promise-utils/ /superpaper/libraries/promise-utils/
COPY libraries/settings/ /superpaper/libraries/settings/
COPY libraries/stream-utils/ /superpaper/libraries/stream-utils/
COPY services/clsi/ /superpaper/services/clsi/

FROM app AS with-texlive

ARG DEBIAN_MIRROR=https://ftp.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://security.debian.org/debian-security

RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80retry
RUN set -eu; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i \
        -e "s#http://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#https://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#http://security.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
        -e "s#https://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
        /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        -e "s#http://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#https://deb.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#http://security.debian.org/debian-security#${DEBIAN_SECURITY_MIRROR}#g" \
        -e "s#http://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
        -e "s#https://deb.debian.org/debian#${DEBIAN_MIRROR}#g" \
        /etc/apt/sources.list; \
    fi; \
    retry() { \
      attempt=1; \
      max_attempts=5; \
      while true; do \
        "$@" && return 0; \
        status=$?; \
        if [ "$attempt" -ge "$max_attempts" ]; then \
          return "$status"; \
        fi; \
        apt-get clean || true; \
        rm -rf /var/lib/apt/lists/*; \
        sleep $((attempt * 10)); \
        attempt=$((attempt + 1)); \
      done; \
    }; \
    retry apt-get update; \
    texlive_packages="$(apt-cache depends texlive-full | grep 'Depends: ' | grep -v -- '-doc' | grep -v -- '-lang-' | sed 's/Depends: //' | sort -u | tr '\n' ' ')"; \
    retry apt-get install -y --no-install-recommends ${texlive_packages} fontconfig inkscape python3-pygments qpdf; \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p cache compiles output \
&&  chown node:node cache compiles output

CMD ["node", "--expose-gc", "app.js"]

FROM app
RUN mkdir -p cache compiles output \
&&  chown node:node cache compiles output

CMD ["node", "--expose-gc", "app.js"]
