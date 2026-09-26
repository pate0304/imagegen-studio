# Architecture

Build a single-user web app on loopback around the installed Codex CLI and its existing imagegen skill. Keep the configured model/provider and ChatGPT authentication. No API-key fallback, credential copying, subscription change, or imagegen skill modifications.

## Scope

Generate and edit with role-labeled reference uploads, prompt templates, explicit text/invariants, composition and transparency intent, 1–4 queued variations, persistent gallery, favorites/search, prompt reuse, downloads, cancellation and clear failures. Show original files and dimensions, not invented quality/seed guarantees. Prompts and selected references are sent to Codex's provider when generation starts; the UI/history are local, inference is online.

## Architecture

React/Vite + TanStack Query for frontend state, Radix Dialog for accessible modal interactions, Lucide icons; Express/Zod/Multer for bounded API and uploads; better-sqlite3 for transactions/persistence; Sharp for image validation, metadata and thumbnails. Use the installed `codex app-server --listen stdio://` through the OSS json-rpc-2.0 client. Supply explicit imagegen skill and localImage inputs to turn/start. Initialize, thread/start, turn notifications, imageGeneration items, and turn/interrupt follow the installed runtime types. Spawn with an argument array and no shell. Dedicated per-job working folder, workspace-write sandbox, never-approve policy, ephemeral sessions. Enable image_generation per invocation only. Import validated image results directly from imageGeneration events or files in that job's output folder or its exact generated_images/thread-id folder. Use proper-lockfile to prevent concurrent servers recovering the same library.

Serial queue avoids account contention. On restart, interrupted jobs are marked interrupted and queued jobs paused until explicitly resumed. No automatic spend retries. Skill-derived prompt structuring is deterministic and costs no model call. Cap upload size/dimensions and queue depth. Bind 127.0.0.1; reject foreign Host/Origin and require a custom header on mutations. No remote URL imports or arbitrary filesystem browsing.

## Validation

Exercise actual SQLite persistence and state changes, prompt invariants, fake-CLI process integration and cancellation, malicious input/origin/path rejection, successful and empty-output jobs. Run build and browser desktop/mobile journeys. Finally generate one real image through the installed CLI with current account; record actual results separately from fixture tests.

## Evidence

2026-09-26: desktop binary 0.158.0-alpha.2, PATH CLI 0.142.0. Desktop `features list` exposes image_generation, default false. `login status` reports ChatGPT sign-in. Local skill distinguishes built-in image_gen (no API key) from image_gen.py (API-key fallback). Choose newest supported installed candidate without upgrading or switching model.

Primary references: https://learn.chatgpt.com/docs/app-server ; https://learn.chatgpt.com/docs/codex/cli ; installed binary: codex app-server generate-ts ; https://expressjs.com/en/5x/api/ ; https://github.com/WiseLibs/better-sqlite3 ; https://sharp.pixelplumbing.com/api-input/ ; https://tanstack.com/query/latest/docs/framework/react/overview

## Interface decisions

A viewport-height desktop shell gives the composer and gallery independent scrolling. The Generate footer stays outside the scroll area. On narrower screens it sits above bottom navigation; scroll padding preserves access to the last fields. Typography, spacing and restrained color prioritize the brief and image results. Reduced-motion preferences are respected. Radix manages modal semantics and focus trapping; the wrapper restores focus to its opener on dismissal.

TanStack Query polls active work every 1.5 seconds and an idle library every 10 seconds, with normal focus/reconnect behavior. Draft validation intentionally permits incomplete input while request validation remains strict. Template changes, new briefs and archive actions offer undo. Edited assets can show their original reference without generating another image.
