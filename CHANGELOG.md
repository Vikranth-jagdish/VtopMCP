# Changelog

All notable changes to `@vikranth2005/vtop-mcp` are documented here.
This project follows [Semantic Versioning](https://semver.org/). While on
`0.x`, minor/patch bumps may include parser-breaking changes whenever VIT
alters VTOP's HTML.

## [Unreleased]

### Added
- **ChatGPT connector support.** New `vtop-mcp-http` entrypoint (`src/http.ts`)
  serves the same 12 tools over the MCP **Streamable HTTP** transport so the
  server can be deployed remotely and added as a custom ChatGPT connector.
  Each MCP session gets its own server instance and `VtopClient` (isolated
  cookie jar), so concurrent remote users never share login state.
- `Dockerfile`, `.dockerignore`, and a Render blueprint (`render.yaml`) for
  one-click deployment to a public HTTPS URL.
- `npm run start:http` script and `express` dependency for the HTTP server.
- **Multi-user mode for the HTTP connector.** Setting a `CONNECTOR_SECRET` env
  var turns one shared deployment into a multi-user one without anyone typing a
  password into chat (which ChatGPT's safety layer blocks). Users self-register
  at `GET/POST /register` and receive a personal connector link
  (`https://<host>/mcp/<token>`) where `<token>` is their VTOP credentials
  encrypted with AES-256-GCM (`src/services/crypto.ts`). They add that URL in
  ChatGPT with **No Auth** — ChatGPT's connector UI has no API-key field, so the
  token travels in the URL path. The `/mcp/:token` route (and `Authorization:
  Bearer <token>` for header-capable clients like Claude Desktop / Cursor)
  authenticates the request and binds the decrypted credentials to that MCP
  session. Stateless — nothing is stored server-side, so no database is
  required. Rotating `CONNECTOR_SECRET` revokes all links. When
  `CONNECTOR_SECRET` is unset the server stays single-user and backward
  compatible (no token required).
- **Polished registration web page** (`src/web.ts`). The multi-user landing /
  registration page is now a modern, responsive, server-rendered experience
  (gradient hero, "How it works" steps, an "Is this safe?" trust section, dark
  mode, password show/hide, one-click copy of the generated link). In
  multi-user mode `GET /` serves this landing page. SEO essentials are included:
  semantic markup, meta description/keywords, canonical URL, Open Graph +
  Twitter cards, JSON-LD structured data, `/robots.txt`, `/sitemap.xml`, and a
  generated `/og.svg` social image. The post-submit result page is `noindex` +
  `no-store` so connector links never leak into caches or search engines. No new
  dependencies and no client-side framework — kept server-rendered for instant
  loads and crawlability.

### Fixed
- **TLS "unable to verify the first certificate" against VTOP.** Node ignores
  the operating-system trust store, so deployments behind a TLS-inspecting
  proxy (common on campus networks, and the remote ChatGPT-connector host)
  failed to verify VTOP's certificate chain. The server now merges the OS trust
  store into Node's default CA list at startup (`src/services/tls.ts`, invoked
  from the `VtopClient` constructor so both the stdio and HTTP entrypoints are
  covered). Requires Node >= 22.15 for the runtime CA APIs; on older runtimes
  it is a no-op and trust falls back to `NODE_EXTRA_CA_CERTS`.
- Added an opt-in `VTOP_INSECURE_TLS=1` escape hatch for hosts whose proxy CA
  isn't installed in the OS trust store. It disables certificate verification
  process-wide, so it should only be used on a trusted network.

## [0.1.5] - 2026-05-19

### Changed
- When credentials aren't configured, the assistant now asks for them in
  one short line ("What's your VTOP username and password?") instead of
  dumping a numbered options menu with env-var and campus instructions.
  The `CREDENTIALS_REQUIRED` / `NOT_AUTHENTICATED` recovery text explicitly
  forbids the options wall so clients like Cursor prompt cleanly inline.

### Docs
- Made it explicit everywhere (README, package description, keywords) that
  only **VIT Chennai** (`vtopcc.vit.ac.in`) is tested. Other campuses are
  marked unverified rather than implied as supported.

## [0.1.4] - 2026-05-19

### Fixed
- Reverted the bin name back to `vtop-mcp` (matching the scope-stripped
  package name). `npx @vikranth2005/vtop-mcp` infers the command from the
  package basename; when the only bin had a different name
  (`vtop-mcp-server`), npx's Windows command-resolution fell into a flaky
  path and failed with "'vtop-mcp-server' is not recognized". With the bin
  named `vtop-mcp` (== basename) npx resolves it directly. The 0.1.2 rename
  was chasing the wrong cause — the real 0.1.0/0.1.1 bug was the bin file
  mode (fixed in 0.1.3 via Linux CI publish). 0.1.4 keeps the 0755 fix and
  restores the correct bin name.

## [0.1.3] - 2026-05-18

### Fixed
- **`npx` still failed on Windows after 0.1.2.** The real cause was not the
  bin name but the bin **file mode**: the published `dist/index.js` was
  `0644` (not executable), so npm's bin-linking produced a broken Windows
  shim. `tsup` emits the shebang but never sets `+x`. Windows `npm publish`
  cannot write the POSIX exec bit into the tarball, so the package must be
  published from the Linux GitHub Actions workflow, which now `chmod +x`'s
  the bin. The `build` script also chmods locally for non-Windows dev.

## [0.1.2] - 2026-05-18

### Fixed
- **Windows `npx` invocation failed** with `'vtop-mcp' is not recognized as
  an internal or external command`. Cause: the `bin` name (`vtop-mcp`) was
  identical to the scope-stripped package name (`@vikranth2005/vtop-mcp` →
  `vtop-mcp`), which trips an npm-on-Windows command-resolution bug. Renamed
  the bin to `vtop-mcp-server` (distinct from the package basename, matching
  the convention used by `@modelcontextprotocol/server-*`). `npx -y
  @vikranth2005/vtop-mcp` now works on Windows, macOS, and Linux. No change
  to the MCP server identity (`vtop-mcp`) or the `mcpServers` config key.

## [0.1.1] - 2026-05-18

### Changed
- When `VTOP_USERNAME` / `VTOP_PASSWORD` are **not** set as env vars, the
  assistant now reliably asks for them in chat instead of dead-ending. All
  tool descriptions and the `NOT_AUTHENTICATED` recovery message now spell
  out both paths (env-var auto-login vs. ask-the-user-then-login).

## [0.1.0] - 2026-05-18

### Added
- Initial release. 12 tools: `get_captcha`, `login`, `logout`,
  `get_semesters`, `get_profile`, `get_attendance`, `get_timetable`,
  `get_marks`, `get_exam_schedule`, `get_semester_grades`,
  `get_grade_history`, `get_curriculum_progress`.
- Auto-detects the active semester (probes the 3 most recent terms, skips
  Summer Term when not enrolled).
- Env-var auto-login, captcha returned as an image for the model to OCR.
- Supports VIT Chennai (default), Vellore, AP, Bhopal via `VTOP_BASE_URL`.
