# AI Assistant Conversation UX Report

Date: 2026-05-25

## Scope

This pass focused on the AI Assistant chat rail UX:

- durable selectable chat conversations
- a visible new-chat flow
- readable assistant answers that expand with the rail
- no nested transcript scrollbar trapping long responses

## Changes

- Upgraded chat persistence from a single `chat-messages` array to persisted `chat-conversations` plus an active conversation id.
- Kept backward migration from the previous `chat-messages` key so existing users keep their current thread.
- Added a chat history toolbar with a `Conversation` selector, `New chat`, and `Clear chat`.
- Changed the scroll owner from `.ai-assistant-transcript` to `.ai-assistant-panel-body`.
- Made assistant answers full-width document cards with improved Markdown spacing and code block treatment.
- Added English and zh-CN strings for the new conversation controls.

## Verification

- `NODE_ENV=test TZ=GMT ../../node_modules/.bin/mocha --timeout 8000 --exit --extension js,jsx,mjs,ts,tsx --require test/frontend/bootstrap.js test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Result: 32 passing.
- `node ../../node_modules/eslint/bin/eslint.js frontend/js/features/ai-assistant/components/ai-assistant-panel.tsx test/frontend/features/ai-assistant/components/ai-assistant-panel.test.tsx`
  - Result: passed.
- `../../node_modules/.bin/stylelint frontend/stylesheets/pages/editor/ai-assistant.scss`
  - Result: passed.
- `node -e "JSON.parse(...)"` for `en.json`, `zh-CN.json`, and `extracted-translations.json`
  - Result: passed.
- `git diff --check`
  - Result: passed.
- Real browser Playwright smoke on local develop stack:
  - Created a temporary local user/project.
  - Opened `AI Assistant`.
  - Seeded two persisted chat conversations.
  - Verified `Conversation` select, `New chat`, panel-owned scrolling, full-width assistant card, and no transcript inner scroll.
  - Screenshot: `output/playwright/superpaper-ai-conversation-ux-final-2026-05-25T07-52-41-725Z.png`.

## Browser Evidence

The final browser assertion returned:

```json
{
  "hasReadableTranscript": true,
  "scrollOwner": "panel",
  "transcriptOverflowY": "visible",
  "bodyOverflowY": "auto",
  "assistantIsDocument": true,
  "optionCount": 2,
  "newChatVisible": true
}
```
