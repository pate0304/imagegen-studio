# Security

Imagegen Studio is a single-user application bound to `127.0.0.1`. It is not a
hosted service and has no multi-user authentication. Do not expose it through a
public proxy or change the bind address to a network interface.

The server validates Host and Origin, requires a custom mutation header, decodes
bounded uploads, serves only database-selected assets, and constrains result
collection to the current job's directories. The Codex worker uses a workspace
sandbox, ephemeral threads and a never-approve policy. Brief instructions do not
replace those controls. Codex still operates under its own authentication,
sandbox, caching and provider policies.

Your prompts and references are sent to Codex's provider when you generate an
image. The application does not extract or copy credentials. Local originals,
references, prompts and metadata remain in `.data` until you remove or back up
that directory. Archive hides an image; it does not delete its bytes. Browser
drafts are stored separately in localStorage. There is no telemetry.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting
option. Please include a minimal reproduction and affected version. Never put
authentication files, tokens, personal images or private prompts in a public
issue. There is no guaranteed response SLA for this community project.

The latest main branch is the supported development version. Dependency updates
are proposed through Dependabot and verified by fixture-based CI.
