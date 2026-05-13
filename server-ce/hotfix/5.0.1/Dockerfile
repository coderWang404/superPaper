FROM sharelatex/sharelatex:5.0.0-RC4

# Bugfix: Grammarly ad shouldn't be displayed in superPaper CE
COPY pr_17625.patch .
RUN patch -p0 < pr_17625.patch

# Patch: force services to use ipv4 in server-ce container
ADD env.sh /etc/superpaper/env.sh
COPY pr_17601-1.patch /etc/superpaper/
RUN cd /etc/superpaper && patch -p0 < pr_17601-1.patch && rm pr_17601-1.patch
COPY pr_17601-2.patch /superpaper/cron/
RUN cd /superpaper/cron && patch -p0 < pr_17601-2.patch  && rm pr_17601-2.patch
COPY pr_17601-3.patch /etc/nginx/sites-enabled/
RUN cd /etc/nginx/sites-enabled && patch -p0 < pr_17601-3.patch  && rm pr_17601-3.patch
COPY pr_17601-4.patch /etc/service/
RUN cd /etc/service && patch -p0 < pr_17601-4.patch  && rm pr_17601-4.patch

