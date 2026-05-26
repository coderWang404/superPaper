# AI Assistant Conversation UX Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI rail feel like a durable editor workbench: readable full-height answers, selectable chat history, and persistent active conversations.

**Architecture:** Upgrade chat from a single persisted message array to a persisted conversation list with an active conversation id. Keep the existing backend chat API unchanged by deriving request history from the active conversation messages. Move scroll ownership from the transcript to the rail body so assistant answers expand naturally and the whole panel scrolls as one surface.

**Tech Stack:** React, TypeScript, Overleaf OL components, SCSS, mocha/testing-library frontend tests.

---

### Task 1: Conversation State Model

**Files:**
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Test: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [ ] Write a failing frontend test that sends a message, creates a new chat, sends a second message, switches the history selector back to the first chat, and sees the first transcript again.
- [ ] Run the targeted test and confirm it fails because no conversation selector/new chat model exists.
- [ ] Add `ChatConversation`, active conversation id, migration from the old `.chat-messages` key, title generation from the first user prompt, and helper functions for updating the active conversation.
- [ ] Run the targeted test and existing persistence/clear-chat tests until they pass.

### Task 2: History Selector UI

**Files:**
- Modify: `services/web/frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx`
- Modify: `services/web/locales/en.json`
- Modify: `services/web/locales/zh-CN.json`
- Modify: `services/web/frontend/extracted-translations.json`

- [ ] Add a compact conversation toolbar with a `Conversation` select, `New chat`, and existing `Clear chat` action.
- [ ] Keep the toolbar visible in chat mode even for an empty active conversation so reopening the rail never feels reset.
- [ ] Add English and Chinese strings for conversation selector, new chat, untitled conversation, and active conversation labels.

### Task 3: Readable Answer Layout

**Files:**
- Modify: `services/web/frontend/stylesheets/pages/editor/ai-assistant.scss`
- Test: `services/web/test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`

- [ ] Add a frontend assertion that the transcript uses the non-scrolling class/structure expected by the new layout.
- [ ] Change `.ai-assistant-panel-body` to be the primary scroll container and `.ai-assistant-transcript` to expand naturally without inner scrolling.
- [ ] Make assistant answers full-width document cards, user prompts compact but readable, and Markdown spacing/code blocks polished.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] Run the AI Assistant component test file.
- [ ] Run eslint for the component and test.
- [ ] Run stylelint for the AI Assistant stylesheet.
- [ ] Run `git diff --check`.
- [ ] If a local server is available, do a browser smoke screenshot of the AI rail conversation state.
