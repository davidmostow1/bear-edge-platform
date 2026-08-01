# Sensitive Data Exclusions

This archive deliberately excludes material that would create security or privacy risk without improving model reproducibility.

Excluded:

- one-time passcodes and verification codes,
- login-alert contents,
- API keys and secrets,
- private authentication tokens,
- bank or card details,
- raw account emails,
- private email addresses in connected-system metadata,
- raw screenshots exposing balances, profiles, notifications, or unrelated content,
- exact personal bankroll balances where not necessary to reproduce a model rule,
- binary archives that already exist on another repository branch.

Included instead:

- sanitized audit-draft summaries,
- record counts and stable identifiers,
- model and version labels,
- branch and commit references,
- technical source-document inventories,
- prospective ledger counts and integrity findings,
- cryptographic hashes.

The repository was private at snapshot time, but this exclusion policy assumes the archive could eventually be reviewed more broadly.
