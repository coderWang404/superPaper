# This file was auto-generated, do not edit it directly.
# Instead run internal$ services/web/build_scripts

FROM node:24.14.1 AS base

WORKDIR /superpaper/services/web
ENV PATH="/superpaper/node_modules/.bin:$PATH"
RUN corepack enable

# Google Cloud Storage needs a writable $HOME/.config for resumable uploads
# (see https://googleapis.dev/nodejs/storage/latest/File.html#createWriteStream)
RUN mkdir /home/node/.config && chown node:node /home/node/.config

RUN mkdir -p /superpaper/services/web/data/dumpFolder \
    &&  mkdir -p /superpaper/services/web/data/logs \
    &&  mkdir -p /superpaper/services/web/data/pdf \
    &&  mkdir -p /superpaper/services/web/data/uploads \
    &&  mkdir -p /superpaper/services/web/data/zippedProjects \
    &&  mkdir -p /superpaper/services/web/data/projectHistories \
    &&  chmod -R 0755 /superpaper/services/web/data \
    &&  chown -R node:node /superpaper/services/web/data

# Add intermediate certificate for prism.optica.org
COPY services/web/certs/DigiCertGlobalG2TLSRSASHA2562020CA1-1.crt.pem /usr/local/share/ca-certificates/DigiCertGlobalG2TLSRSASHA2562020CA1-1.crt
RUN update-ca-certificates

# the deps image is used for caching yarn workspaces focus
FROM base AS deps-prod

# Pyodide wheel bundle (~370 MB). Version + SHA-256 are pinned in the fetch
# script; keep that in sync with the pyodide dep in services/web/package.json.
COPY services/web/scripts/fetch-pyodide-packages.mjs /superpaper/services/web/scripts/fetch-pyodide-packages.mjs
RUN cd /superpaper/services/web && node scripts/fetch-pyodide-packages.mjs

COPY package.json yarn.lock .yarnrc.yml /superpaper/
COPY libraries/access-token-encryptor/package.json /superpaper/libraries/access-token-encryptor/package.json
COPY libraries/eslint-plugin/package.json /superpaper/libraries/eslint-plugin/package.json
COPY libraries/fetch-utils/package.json /superpaper/libraries/fetch-utils/package.json
COPY libraries/logger/package.json /superpaper/libraries/logger/package.json
COPY libraries/metrics/package.json /superpaper/libraries/metrics/package.json
COPY libraries/mongo-utils/package.json /superpaper/libraries/mongo-utils/package.json
COPY libraries/o-error/package.json /superpaper/libraries/o-error/package.json
COPY libraries/object-persistor/package.json /superpaper/libraries/object-persistor/package.json
COPY libraries/superpaper-editor-core/package.json /superpaper/libraries/superpaper-editor-core/package.json
COPY libraries/promise-utils/package.json /superpaper/libraries/promise-utils/package.json
COPY libraries/ranges-tracker/package.json /superpaper/libraries/ranges-tracker/package.json
COPY libraries/redis-wrapper/package.json /superpaper/libraries/redis-wrapper/package.json
COPY libraries/settings/package.json /superpaper/libraries/settings/package.json
COPY libraries/stream-utils/package.json /superpaper/libraries/stream-utils/package.json
COPY libraries/validation-tools/package.json /superpaper/libraries/validation-tools/package.json
COPY services/web/package.json /superpaper/services/web/package.json
COPY tools/migrations/package.json /superpaper/tools/migrations/package.json
COPY .yarn/patches/ /superpaper/.yarn/patches/
COPY .yarn/releases/ /superpaper/.yarn/releases/
RUN chmod 0755 /superpaper/.yarn/releases/yarn-4.14.1.cjs && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarn && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarnpkg

RUN cd /superpaper && NODE_ENV=production yarn workspaces focus --production @superpaper/web

FROM deps-prod AS deps

ENV CYPRESS_INSTALL_BINARY=0

COPY tsconfig.backend.json /superpaper/
RUN cd /superpaper && yarn workspaces focus @superpaper/web superpaper


# the dev is suitable for running tests
FROM deps AS dev

ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
COPY libraries/access-token-encryptor/ /superpaper/libraries/access-token-encryptor/
COPY libraries/eslint-plugin/ /superpaper/libraries/eslint-plugin/
COPY libraries/fetch-utils/ /superpaper/libraries/fetch-utils/
COPY libraries/logger/ /superpaper/libraries/logger/
COPY libraries/metrics/ /superpaper/libraries/metrics/
COPY libraries/mongo-utils/ /superpaper/libraries/mongo-utils/
COPY libraries/o-error/ /superpaper/libraries/o-error/
COPY libraries/object-persistor/ /superpaper/libraries/object-persistor/
COPY libraries/superpaper-editor-core/ /superpaper/libraries/superpaper-editor-core/
COPY libraries/promise-utils/ /superpaper/libraries/promise-utils/
COPY libraries/ranges-tracker/ /superpaper/libraries/ranges-tracker/
COPY libraries/redis-wrapper/ /superpaper/libraries/redis-wrapper/
COPY libraries/settings/ /superpaper/libraries/settings/
COPY libraries/stream-utils/ /superpaper/libraries/stream-utils/
COPY libraries/validation-tools/ /superpaper/libraries/validation-tools/
COPY services/web/ /superpaper/services/web/
COPY tools/migrations/ /superpaper/tools/migrations/

# Build the latex parser
RUN cd /superpaper/services/web && yarn run 'lezer-latex:generate'

# The module folders are owned as root. The node user cannot create them. Create them in advance.
RUN cd /superpaper/services/web && make create_module_Makefiles

USER node


# the webpack image has deps+src+webpack artifacts
FROM dev AS webpack
USER root
RUN SUPERPAPER_CONFIG=/superpaper/services/web/config/settings.webpack.js nice yarn run webpack:production


# intermediate image for removing source maps ahead of copying into final production image
FROM webpack AS webpack-no-sourcemaps
RUN nice find /superpaper/services/web/public -name '*.js.map' -delete


# copy source code and precompile pug images
FROM deps-prod AS pug
COPY libraries/access-token-encryptor/ /superpaper/libraries/access-token-encryptor/
COPY libraries/eslint-plugin/ /superpaper/libraries/eslint-plugin/
COPY libraries/fetch-utils/ /superpaper/libraries/fetch-utils/
COPY libraries/logger/ /superpaper/libraries/logger/
COPY libraries/metrics/ /superpaper/libraries/metrics/
COPY libraries/mongo-utils/ /superpaper/libraries/mongo-utils/
COPY libraries/o-error/ /superpaper/libraries/o-error/
COPY libraries/object-persistor/ /superpaper/libraries/object-persistor/
COPY libraries/superpaper-editor-core/ /superpaper/libraries/superpaper-editor-core/
COPY libraries/promise-utils/ /superpaper/libraries/promise-utils/
COPY libraries/ranges-tracker/ /superpaper/libraries/ranges-tracker/
COPY libraries/redis-wrapper/ /superpaper/libraries/redis-wrapper/
COPY libraries/settings/ /superpaper/libraries/settings/
COPY libraries/stream-utils/ /superpaper/libraries/stream-utils/
COPY libraries/validation-tools/ /superpaper/libraries/validation-tools/
COPY services/web/ /superpaper/services/web/
COPY tools/migrations/ /superpaper/tools/migrations/

# Omit legacy scripts from the web image
RUN rm /superpaper/services/web/modules/server-ce-scripts -rf
RUN SUPERPAPER_CONFIG=/superpaper/services/web/config/settings.defaults.js nice yarn run precompile-pug


# the web image with only production dependencies but no webpack production build, for development
FROM pug AS app-only
USER node
CMD ["node", "--expose-gc", "app.mjs"]


# the final production image, with webpack production build but without source maps
FROM pug AS app
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/DigiCertGlobalG2TLSRSASHA2562020CA1-1.crt
COPY --from=webpack-no-sourcemaps /superpaper/services/web/public /superpaper/services/web/public
USER node
CMD ["node", "--expose-gc", "app.mjs"]
