# Verification record — 2026-09-26

## Result

Imagegen Studio is implemented as a local React web application with an Express/SQLite backend and a Codex app-server adapter. The installed imagegen skill is passed explicitly as a skill input on every turn. Two real end-to-end jobs succeeded using the existing ChatGPT login, inherited model configuration and Codex desktop binary 0.158.0-alpha.2 on macOS arm64.

The first produced a 1536 × 1024 PNG editorial still life of a ceramic vase and olive branch. The second used that image as an edit target and produced a 1536 × 1024 PNG cutout. Sharp confirmed that the cutout has an alpha channel with transparent pixels (minimum alpha 0). Neither result was synthesized by the application; both came from successful built-in image-generation events. Originals are retained in the real local library. These two calls consumed normal Codex usage.

## Automated checks

- `npm run build`: passed TypeScript checking and Vite production build.
- `npm test`: **14 passed**, using real SQLite, Express requests, file validation, and a separate synthetic Codex app-server process.
- `npm run test:browser`: **10 passed**, including desktop generation/edit/download/favorite/archive, upload roles and draft persistence, mobile layout, and automated WCAG 2 A/AA checks across the workspace, prompt starters and connection dialog.
- `npm audit --omit=dev`: zero reported vulnerabilities at the time checked.
- `zsh -n 'Start Imagegen Studio.command'`: passed.
- Production smoke: both real images survived restart and loaded as browser pixels; no JavaScript errors, no external frontend requests, and no horizontal overflow at 390 px. A second server against the same library was rejected by the lock before database recovery. Git ignore checks passed for the database, lock and private evidence.

Tests cover unsafe origins/Host headers, missing mutation headers, invalid uploads, reference validation, queue limits, serial job handling, duplicate result suppression, empty-output failures, paused queues on failure, active/queued cancellation, graceful shutdown, restart state, and symlink exclusion during output collection. UI checks assert that image pixels actually load; checking DOM presence alone had missed a private-directory serving issue, which was corrected and added to the test setup. An asynchronous archive response that reopened a dismissed dialog was also corrected and verified by the browser journey.

The test app-server validates explicit skill input, ephemeral threads, workspace-write sandbox, never-approve policy and absence of a model override. Its images are clearly synthetic fixture pixels and never placed in the real library. Browser test data is isolated in ignored fixture directories.

## Design and operational decisions

- Use the installed app server's generated protocol types as the integration reference; no undocumented direct image endpoint or OAuth token extraction.
- Use OSS JSON-RPC, SQLite, upload validation, thumbnails, UI state, accessible dialogs and process locking instead of custom substitutes.
- Keep current provider/model configuration; enable image_generation for the child process only.
- One generation at a time; no auto retries or runaway variant batches. Failures pause pending jobs.
- Retain only user-visible Codex activity summaries, not hidden reasoning or full protocol transcripts.
- Serve original image bytes without resizing/re-encoding; derive separate thumbnails with Sharp.
- Host fonts locally, bind loopback, constrain asset routes to database-selected files, and require same-origin mutations.
- Preserve archived images and use an explicit process lock before opening or recovering the persistent library.

## Limits

This is a working local beta, tested on the machine above. Other operating systems, CLI versions, custom providers, API-key accounts, very large libraries and multi-user hosting are not certified. Codex app-server is an evolving interface. The app intentionally requires the existing ChatGPT/OpenAI authentication path and does not switch accounts/providers or enable API billing automatically.

Ratio, exact text and edit preservation are model instructions, not pixel-level guarantees. The alpha-channel test confirms actual transparency in the tested cutout, not universal success for every prompt. Automated accessibility checks cover selected rendered states and complement desktop/mobile browser inspection; they do not constitute a full manual accessibility audit.

Cancellation and failure cases use protocol fixtures to avoid wasting real generations. The two successful live jobs cover generation, reference attachment, skill invocation, image events, saving, metadata, and library persistence. No additional live-model calls were made for testing failures.

## Continue here

Run `npm start` and open http://127.0.0.1:4310, or use the macOS launcher. Architecture and operating instructions are in README.md and ARCHITECTURE.md. Private screenshots and local evidence are under `docs/private/`; the actual image library and generated protocol reference are in `.data/`. Neither directory is committed or published.

## Version 0.2.0 interface and publication verification

The redesigned interface was checked at 1440×1050, 1366×768, 390×844 and
320×640. The primary action remains in the viewport while fine-tuning a brief.
Browser tests cover incomplete edit-draft recovery, reset/undo, modal focus
restoration, archived-image undo, search, sorting, grid density, original/edit
comparison, missing-Codex onboarding, pasted images and keyboard submission.
Automated axe checks cover desktop workspace/starters/settings and mobile
workspace/image-dialog states. No browser console errors occurred in the main
create/edit/download journey. Automated accessibility checks are not a complete
manual accessibility audit.

The connection refresh endpoint is tested for cache bypass and the required
mutation header. The doctor command successfully detected the installed runtime,
ChatGPT login, skill and provider without a generation. Production dependencies
reported zero vulnerabilities at this check. Formatting, strict type checking,
production build and the full 14 API/protocol + 10 browser tests passed locally.

Public screenshots show an empty isolated fixture workspace with an illustrative
brief and CSS template artwork. They contain no private library images, job
records, account files or local filesystem paths. Browser fixtures explicitly use
a test skill and empty test Codex home so CI does not rely on this machine's
configuration. Live-generation evidence above is from the original integration
validation; no new live-model calls were made for the UI redesign.

CI verifies clean npm installation, formatting/build/API tests on Linux Node
22/24 and macOS Node 22, and Chromium journeys on Linux Node 22. Its actual result
is visible in GitHub Actions; fixture success is not live-model certification.
