FROM sharelatex/sharelatex:2.1.0

# Patch: defines recaptcha config to fix share-related issues
# - https://github.com/superpaper/superpaper/issues/684
ADD add-recaptcha-config.patch /etc/sharelatex/add-recaptcha-config.patch
RUN cd /etc/sharelatex/ && \
    patch < add-recaptcha-config.patch

