# Makefile

MONOREPO_ROOT := ../
HERE=$(shell pwd)
export MONOREPO_REVISION := $(shell git rev-parse HEAD)
export BRANCH_NAME ?= $(shell git rev-parse --abbrev-ref HEAD)
export SUPERPAPER_BASE_BRANCH ?= sharelatex/sharelatex-base:$(BRANCH_NAME)
export SUPERPAPER_BASE_LATEST ?= sharelatex/sharelatex-base
export SUPERPAPER_BASE_TAG ?= sharelatex/sharelatex-base:$(BRANCH_NAME)-$(MONOREPO_REVISION)
export SUPERPAPER_BRANCH ?= sharelatex/sharelatex:$(BRANCH_NAME)
export SUPERPAPER_LATEST ?= sharelatex/sharelatex
export SUPERPAPER_TAG ?= sharelatex/sharelatex:$(BRANCH_NAME)-$(MONOREPO_REVISION)

all: build-base build-community

clean:
	-docker rmi --force $(SUPERPAPER_BASE_TAG) $(SUPERPAPER_TAG)

refresh-cache: refresh-cache-branch
refresh-cache-branch:
	docker inspect $(SUPERPAPER_BASE_BRANCH) > /dev/null && docker pull $(SUPERPAPER_BASE_BRANCH) || true
	docker inspect $(SUPERPAPER_BRANCH) > /dev/null && docker pull $(SUPERPAPER_BRANCH) || true
refresh-cache: refresh-cache-latest
refresh-cache-latest:
	docker inspect $(SUPERPAPER_BASE_LATEST) > /dev/null && docker pull $(SUPERPAPER_BASE_LATEST) || true
	docker inspect $(SUPERPAPER_LATEST) > /dev/null && docker pull $(SUPERPAPER_LATEST) || true

build-base:
	cp .dockerignore $(MONOREPO_ROOT)
	docker build \
	  --build-arg BUILDKIT_INLINE_CACHE=1 \
	  --progress=plain \
	  --file Dockerfile-base \
	  --pull \
	  --cache-from $(SUPERPAPER_BASE_LATEST) \
	  --cache-from $(SUPERPAPER_BASE_BRANCH) \
	  --tag $(SUPERPAPER_BASE_TAG) \
	  --tag $(SUPERPAPER_BASE_BRANCH) \
	  $(MONOREPO_ROOT)


build-community:
	cp .dockerignore $(MONOREPO_ROOT)
	docker build \
	  --build-arg BUILDKIT_INLINE_CACHE=1 \
	  --progress=plain \
	  --build-arg SUPERPAPER_BASE_TAG \
	  --label "com.superpaper.ce.revision=$(MONOREPO_REVISION)" \
	  --cache-from $(SUPERPAPER_LATEST) \
	  --cache-from $(SUPERPAPER_BRANCH) \
	  --file Dockerfile \
	  --tag $(SUPERPAPER_TAG) \
	  --tag $(SUPERPAPER_BRANCH) \
	  $(MONOREPO_ROOT)

push:
	docker push $(SUPERPAPER_BASE_TAG)
	docker push $(SUPERPAPER_BASE_BRANCH)
	docker push $(SUPERPAPER_TAG)
	docker push $(SUPERPAPER_BRANCH)

SHELLCHECK_OPTS = \
	--shell=bash \
	--external-sources \
	--exclude=SC1091
SHELLCHECK_COLOR := $(if $(CI),--color=never,--color)
SHELLCHECK_FILES := { git ls-files "*.sh" -z; git grep -Plz "\A\#\!.*bash"; } | sort -zu

shellcheck:
	@$(SHELLCHECK_FILES) | xargs -0 -r docker run --rm -v $(HERE):/mnt -w /mnt \
		koalaman/shellcheck:stable $(SHELLCHECK_OPTS) $(SHELLCHECK_COLOR)

shellcheck_fix:
	@$(SHELLCHECK_FILES) | while IFS= read -r -d '' file; do \
		diff=$$(docker run --rm -v $(HERE):/mnt -w /mnt koalaman/shellcheck:stable $(SHELLCHECK_OPTS) --format=diff "$$file" 2>/dev/null); \
		if [ -n "$$diff" ] && ! echo "$$diff" | patch -p1 >/dev/null 2>&1; then echo "\033[31m$$file\033[0m"; \
		elif [ -n "$$diff" ]; then echo "$$file"; \
		else echo "\033[2m$$file\033[0m"; fi \
	done

.PHONY: all \
	build-base build-community \
	shellcheck shellcheck_fix
