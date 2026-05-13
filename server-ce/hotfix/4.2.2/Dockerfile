FROM sharelatex/sharelatex:4.2.1

# Patch: https://github.com/superpaper/internal/pull/16956
COPY pr_16956.patch .
RUN patch -p0 < pr_16956.patch
