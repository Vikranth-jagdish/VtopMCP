# Changelog

All notable changes to `@vikranth2005/vtop-mcp` are documented here.
This project follows [Semantic Versioning](https://semver.org/). While on
`0.x`, minor/patch bumps may include parser-breaking changes whenever VIT
alters VTOP's HTML.

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
