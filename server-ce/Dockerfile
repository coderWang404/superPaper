# syntax=docker/dockerfile:1-labs
# ---------------------------------------------
# superPaper Community Edition (superpaper/superpaper)
# ---------------------------------------------

ARG SUPERPAPER_BASE_TAG=sharelatex/sharelatex:5.5.4-with-texlive-full
FROM $SUPERPAPER_BASE_TAG

WORKDIR /superpaper

# Add required source files for yarn install
# -------------------------------------------
COPY --parents libraries/*/package.json .yarn/patches/ .yarn/releases/ services/*/package.json tools/migrations/ package.json yarn.lock .yarnrc.yml /superpaper/
COPY server-ce/genScript.js server-ce/services.js /superpaper/

# Pre-install yarn via corepack so it is available at runtime for all users
# -------------------------------------------------------------------------
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
RUN chmod 0755 /superpaper/.yarn/releases/yarn-4.14.1.cjs && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarn && ln -sf /superpaper/.yarn/releases/yarn-4.14.1.cjs /usr/local/bin/yarnpkg

# Install yarn dependencies
# -------------------------
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/root/.yarn/berry/cache,id=server-ce-yarn-cache \
    --mount=type=tmpfs,target=/tmp node genScript install | bash

# Add the actual source files
# ---------------------------
COPY --parents libraries/ services/ tools/migrations/ /superpaper/
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/root/.yarn/berry/cache,id=server-ce-yarn-cache \
    --mount=type=cache,target=/superpaper/services/web/node_modules/.cache,id=server-ce-webpack-cache \
    --mount=type=tmpfs,target=/tmp \
    YARN_CACHE_FOLDER=/tmp/.yarn-cache node genScript compile | bash

# Copy runit service startup scripts to its location
# --------------------------------------------------
ADD server-ce/runit /etc/service

# Copy runit global settings to its location
# ------------------------------------------
ADD server-ce/config/env.sh /etc/superpaper/env.sh

# Configure nginx
# ---------------
ADD server-ce/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
ADD server-ce/nginx/superpaper.conf /etc/nginx/sites-enabled/superpaper.conf
ADD server-ce/nginx/clsi-nginx.conf /etc/nginx/sites-enabled/clsi-nginx.conf


# Configure log rotation
# ----------------------
ADD server-ce/logrotate/superpaper /etc/logrotate.d/superpaper
RUN chmod 644 /etc/logrotate.d/superpaper

# Configure cron tasks
# ----------------------
ADD server-ce/cron /superpaper/cron
ADD server-ce/config/crontab-history /etc/cron.d/crontab-history
RUN chmod 600 /etc/cron.d/crontab-history
ADD server-ce/config/crontab-deletion /etc/cron.d/crontab-deletion
RUN chmod 600 /etc/cron.d/crontab-deletion

# Copy Phusion Image startup and shutdown scripts to their locations
# ------------------------------------------------------------------
COPY server-ce/init_scripts/ /etc/my_init.d/
COPY server-ce/init_preshutdown_scripts/ /etc/my_init.pre_shutdown.d/

# Copy app settings files
# -----------------------
COPY server-ce/config/settings.js /etc/superpaper/settings.js

# Copy history-v1 files
# -----------------------
COPY server-ce/config/production.json /superpaper/services/history-v1/config/production.json
COPY server-ce/config/custom-environment-variables.json /superpaper/services/history-v1/config/custom-environment-variables.json

# Copy grunt thin wrapper
# -----------------------
ADD server-ce/bin/grunt /usr/local/bin/grunt
RUN chmod +x /usr/local/bin/grunt

# Copy history helper scripts
# ---------------------------
ADD server-ce/bin/flush-history-queues /superpaper/bin/flush-history-queues
RUN chmod +x /superpaper/bin/flush-history-queues
ADD server-ce/bin/force-history-resyncs /superpaper/bin/force-history-resyncs
RUN chmod +x /superpaper/bin/force-history-resyncs

# Copy Latexmkrc
# -----------------------
COPY server-ce/config/latexmkrc /usr/local/share/latexmk/LatexMk

# File that controls open|closed status of the site
# -------------------------------------------------
ENV SITE_MAINTENANCE_FILE="/etc/superpaper/site_status"
RUN touch $SITE_MAINTENANCE_FILE

# Set Environment Variables
# --------------------------------
ENV SUPERPAPER_CONFIG=/etc/superpaper/settings.js

ENV WEB_API_USER="superpaper"
ENV ADMIN_PRIVILEGE_AVAILABLE="true"

ENV SUPERPAPER_APP_NAME="superPaper Community Edition"

ENV OPTIMISE_PDF="true"

# Phusion Image timeouts before sending SIGKILL to processes
# ----------------------------------------------------------
ENV KILL_PROCESS_TIMEOUT=55
ENV KILL_ALL_PROCESSES_TIMEOUT=55
ENV GRACEFUL_SHUTDOWN_DELAY_SECONDS=1

ENV NODE_ENV="production"
ENV LOG_LEVEL="info"


EXPOSE 80

ENTRYPOINT ["/sbin/my_init"]
