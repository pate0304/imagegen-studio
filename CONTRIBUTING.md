# Contributing

Small, focused improvements are welcome. Open an issue for a larger feature before
building it. This is an independent local tool, not an official OpenAI product.

## Work locally

Use Node.js 22.12+ (22 or 24 LTS recommended), then:

```sh
npm ci
npm run dev
```

A real Codex account is required only for actual generation. The test suite uses
an isolated fake app-server and a clearly labeled test skill. It never logs in,
calls a model, or reads your real image library. Do not configure those fixtures
for normal use.

```sh
npm run format
npm run check
npx playwright install chromium
npm run test:browser
```

The browser suite runs its own server on port 4311. Keep that port free. Tests
store disposable fixtures under ignored `.data/browser-fixture-*` directories.
`npm run dev` uses port 4310 unless `PORT` is set.

## Pull requests

Explain the user-visible behavior, why it helps, and the checks you ran. For UI
changes, include desktop and mobile screenshots with synthetic data. Add tests
for meaningful behavior and regressions, not tests that just mirror markup.

Preserve loopback binding, same-origin checks, bounded image decoding, isolated
jobs, explicit skill input, cancellation, and no automatic paid retries. Do not
introduce credential extraction, silently change models/providers, add telemetry,
or expose arbitrary filesystem paths through the API.

Keep `.data`, `.env`, local account configuration, images, job transcripts and
private screenshots out of commits and issue attachments. Review `git diff
--cached` before publishing. See [architecture](docs/ARCHITECTURE.md) and the
[verification record](docs/VERIFICATION.md) for adapter details and limitations.
