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
