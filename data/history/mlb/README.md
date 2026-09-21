# MLB History Library

The default completed-season library is 2024 and 2025. Generate it with:

```bash
npm run mlb:history -- --seasons 2024,2025 --output-dir data/history/mlb --concurrency 6
```

Each season contains `games.jsonl`, `batting.jsonl`, `pitching.jsonl`, a manifest, compressed normalized game records, and optionally compressed raw MLB Stats API feeds. Interrupted runs resume from completed per-game records and rebuild the tabular files atomically.
