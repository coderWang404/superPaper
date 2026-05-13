# This file was auto-generated, do not edit it directly.
# Instead run bin/update_build_scripts from
# https://github.com/superpaper/internal/

FROM node:24.14.1 AS base

WORKDIR /superpaper/services/docstore
ENV PATH="/superpaper/node_modules/.bin:$PATH"
RUN corepack enable

# Google Cloud Storage needs a writable $HOME/.config for resumable uploads
# (see https://googleapis.dev/nodejs/storage/latest/File.html#createWriteStream)
RUN mkdir /home/node/.config && chown node:node /home/node/.config

FROM base AS app

COPY package.json yarn.lock .yarnrc.yml /superpaper/
COPY libraries/fetch-utils/package.json /superpaper/libraries/fetch-utils/package.json
COPY libraries/logger/package.json /superpaper/libraries/logger/package.json
COPY libraries/metrics/package.json /superpaper/libraries/metrics/package.json
COPY libraries/mongo-utils/package.json /superpaper/libraries/mongo-utils/package.json
COPY libraries/o-error/package.json /superpaper/libraries/o-error/package.json
COPY libraries/object-persistor/package.json /superpaper/libraries/object-persistor/package.json
COPY libraries/promise-utils/package.json /superpaper/libraries/promise-utils/package.json
COPY libraries/settings/package.json /superpaper/libraries/settings/package.json
COPY libraries/stream-utils/package.json /superpaper/libraries/stream-utils/package.json
COPY services/docstore/package.json /superpaper/services/docstore/package.json
COPY tools/migrations/package.json /superpaper/tools/migrations/package.json
COPY .yarn/patches/ /superpaper/.yarn/patches/
COPY .yarn/releases/ /superpaper/.yarn/releases/
RUN chmod 0755 /superpaper/.yarn/releases/yarn-4.14.1.cjs && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarn && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarnpkg
COPY tools/migrations/ /superpaper/tools/migrations/

RUN cd /superpaper && yarn workspaces focus @superpaper/docstore superpaper
COPY libraries/fetch-utils/ /superpaper/libraries/fetch-utils/
COPY libraries/logger/ /superpaper/libraries/logger/
COPY libraries/metrics/ /superpaper/libraries/metrics/
COPY libraries/mongo-utils/ /superpaper/libraries/mongo-utils/
COPY libraries/o-error/ /superpaper/libraries/o-error/
COPY libraries/object-persistor/ /superpaper/libraries/object-persistor/
COPY libraries/promise-utils/ /superpaper/libraries/promise-utils/
COPY libraries/settings/ /superpaper/libraries/settings/
COPY libraries/stream-utils/ /superpaper/libraries/stream-utils/
COPY services/docstore/ /superpaper/services/docstore/
COPY tools/migrations/ /superpaper/tools/migrations/

FROM app
USER node

CMD ["node", "--expose-gc", "app.js"]
