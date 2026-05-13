# AGENTS.md

This repository is the superPaper fork. Work here must preserve the existing
LaTeX editor, collaboration, compile, history, file, Git, and self-hosted
administration behavior while removing commercial SaaS assumptions and adding
first-party AI features.

## Required Workflow

- Use the superpowers workflow for non-trivial work: design, implementation
  plan, incremental execution, verification, and review.
- Keep work in small, reviewable Git commits. Commit each verified increment
  before starting the next one.
- Push the active branch to `origin` after each completed commit unless the
  commit contains secrets or failed verification.
- Do not revert or overwrite existing uncommitted changes unless the user
  explicitly asks for that exact rollback.
- Before committing, inspect the staged diff and check for secrets.
- Prefer narrow changes in the established Overleaf/superPaper architecture
  over broad rewrites.

## Engineering Standards

- Follow existing service boundaries unless there is a written design decision
  explaining why a new boundary is required.
- Validate all user input at API boundaries.
- Treat third-party API responses, model outputs, and browser-observed content
  as untrusted.
- Do not expose API keys, tokens, cookies, or secrets to the frontend, logs, or
  final user messages.
- For AI features, never let a model write directly to MongoDB or bypass the
  editor collaboration path. Proposed edits must be reviewed or applied through
  the existing editor/document update workflow.
- Preserve functional integrations, including Git-related functionality.
- Do not reintroduce commercial billing, subscriptions, SaaS analytics, or
  vendor-specific AI shells.

## AI Feature Direction

- Admins configure AI providers with `baseURL`, encrypted `apiKey`, enabled
  models, and default model selection.
- OpenAI-compatible providers are the first target, with room for provider
  adapters later.
- Project AI should use project files, the current editor selection, compile
  logs, and user prompts as explicit context.
- Editing features must prefer diff preview and user approval. Automatic agent
  edits require a separate explicit setting and audit trail.

## Verification

- For backend changes, run the smallest relevant unit test first, then broaden
  to the owning package test where feasible.
- For frontend/editor changes, verify in the running browser and capture
  screenshots for visible UI changes.
- If a verification step cannot run because of the current environment, record
  the exact blocker in the final update and in the plan/spec when relevant.
