# AI Agent Workbench Polish Design

## Context

The clean single-agent Cline route is now functionally real: it uses the root channel provider, prepares the filesystem workspace, runs Cline against real project files, records checkpoints and diffs, and can roll back. The remaining gap is no longer "can it act?" but "does the user understand what is happening, what is safe, and what to do next?"

The latest browser screenshot shows the main UX pressure: the AI rail is narrow, the Agent controls, run summary, worklog, and composer all compete for attention, and the disabled Start Act button still feels like a mystery unless the user reads the hint carefully. The run summary is useful, but it appears while the run can still be in progress, so status and evidence need clearer hierarchy.

## Distance To Complete

- Functional core: about 75 percent complete. Cline is the primary direct-edit runtime and real browser smoke passes.
- Trust and recovery: about 70 percent complete. Checkpoints, diffs, rollback, and worklog exist, but the UI needs stronger status hierarchy and more obvious capability boundaries.
- Daily usability: about 55 percent complete. Chat persistence, copy, insert, Plan to Act, and worklog cards exist, but the panel still feels like a dense stack of controls rather than a calm writing workbench.
- Visual polish: about 45 percent complete. The interface is consistent with Overleaf-style restrained tooling, but it is still too boxy, cramped, and status-light for a premium AI editing surface.
- Regression discipline: about 65 percent complete. Unit/frontend tests and a real browser smoke command exist; the smoke should now wait for the full agent turn to finish instead of stopping as soon as checkpoint evidence appears.

## Recommended Approach

Build in narrow, evidence-backed UI polish phases rather than a broad visual rewrite. The right aesthetic for this product is quiet, operational, and precise: dense enough for repeated writing work, but with a stronger status spine so the user can scan the Agent's state in one glance.

For this phase:

1. Add an Agent status overview inside the existing controls.
   - Show a clear "Current run" label.
   - Show a status chip derived from session status and mode.
   - Show the current task when a session exists.
   - Show "No active plan" before the first Plan.

2. Add an Agent capability strip.
   - Direct project edits.
   - Checkpoint rollback.
   - External tools on/off from the permission profile.
   - Enabled skill count.

3. Strengthen browser smoke.
   - Keep the existing real provider/model/runtime assertions.
   - Also wait until the composer submit button is no longer busy and the Result block is visible.
   - Save a screenshot only after the turn has actually settled.

## Architecture

Keep changes local to the AI Assistant panel and smoke runner. The Agent controls remain a presentational component fed by `ProjectAiAgentSession` and `ProjectAiAgentConfig`; no backend contract changes are needed. Status labels are pure helper functions so tests can exercise behavior through rendered UI instead of internal state.

## Testing

- Frontend test: render Agent mode before and after Plan, assert status overview, capability strip, and task text.
- Smoke: run the real root channel provider browser smoke after implementation.
- Lint and `git diff --check` for touched files.
