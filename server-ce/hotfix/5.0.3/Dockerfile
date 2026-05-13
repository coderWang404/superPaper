FROM sharelatex/sharelatex:5.0.2-RC6

# Patch: https://github.com/superpaper/internal/pull/18065
RUN npm install @superpaper/redis-wrapper @superpaper/settings -w services/history-v1
ADD 910_initiate_doc_version_recovery /etc/my_init.d/910_initiate_doc_version_recovery
COPY pr_18065.patch .
RUN patch -p0 < pr_18065.patch && rm pr_18065.patch
