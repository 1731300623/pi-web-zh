# pi-web-zh

Standalone **Chinese localization overlay** for [agegr/pi-web](https://github.com/agegr/pi-web).

This repository does **not** vendor the full upstream tree. It only ships:

- `overlay/` — localized UI files
- `patches/zh-cn-ui.patch` — diff against `BASE.json` upstream commit
- `scripts/` — apply / sync / export helpers

```bash
./scripts/apply.sh /path/to/pi-web hybrid
cd /path/to/pi-web && npm install && npm run build && npm install -g .
```

Or:

```bash
./scripts/sync-upstream.sh --install
```

See [README.md](./README.md) for full Chinese documentation.

## Dynamic slash-command descriptions

Runtime localization for skill / extension / prompt-template slash descriptions lives in:

- `overlay/lib/slash-command-descriptions.zh-CN.json` — shared dictionary (`bySourceName` then exact `byDescription`)
- `overlay/lib/slash-command-i18n.ts` — locale-aware lookup used from `hooks/useAgentSession.ts` after `get_commands`

English locale and missing dictionary entries keep the original English text. Maintenance steps, export workflow, and the optional localhost Violentmonkey userscript (`userscripts/pi-web-slash-command-zh.user.js`, description-only) are documented in the Chinese README.
