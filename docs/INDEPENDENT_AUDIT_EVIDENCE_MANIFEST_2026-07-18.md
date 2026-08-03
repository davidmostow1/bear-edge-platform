# Bear Edge Independent Audit Evidence Manifest

## Manifest Status

- Request identifier: `BEAR-EDGE-2026-07-18-RFP-01`
- Manifest version: Draft 1
- Prepared: July 18, 2026
- Current status: Evidence inventory prepared; immutable audit snapshot not yet created
- Release implication: No external conclusion may be called reproducible until the snapshot fields marked `PENDING` are completed

## Current Repository State

- Repository: `davidmostow1/bear-edge-platform`
- Repository visibility: Private
- Local root: `/Users/davidbearmostow/Documents/Codex/2026-06-17-documents-openai-developers-google-drive-google`
- Branch: `codex/bear-edge-release-candidate`
- Current committed head: `2ca03a24fc1af20a3c03086757cd1dfb85c43d1e`
- Commits beyond `origin/master`: 47
- Working tree: Dirty
- Current modified or untracked entries: 53
- Operating permission: `PRICE_CHECK_ONLY`
- Immutable audit commit: `PENDING`
- Signed audit tag: `PENDING`
- Source archive name: `PENDING`
- Source archive SHA-256 digest: `PENDING`
- Software bill of materials digest: `PENDING`

The current committed head is not the complete audit target. Material modified and untracked source, tests, documentation, and a database migration are present. Freezing only the current commit would omit in-scope work and produce a misleading audit.

## Freeze Preconditions

Before source is supplied to any reviewer:

1. The owner must approve which current modified and untracked files belong in the audit target.
2. Every included file must be committed to a dedicated audit snapshot branch.
3. Verification must run from a clean checkout of that commit using the documented Node.js version.
4. A signed tag must identify the exact audit commit.
5. A source archive must be generated from the tagged commit.
6. SHA-256 digests must be recorded for the archive, lockfile, software bill of materials, reports, and database schema export.
7. Secret scanning must run against both the Git history supplied and the final archive.
8. No `.env.local`, production token, authentication secret, provider key, private user data, or licensed raw data may enter the package.

## Evidence Access Levels

### Level Zero: Non-Confidential Procurement Material

- `docs/INDEPENDENT_AUDIT_ARBITRATION_RFP_2026-07-18.md`
- `docs/CURRENT_ALGORITHM_CAPABILITIES_AND_EXTERNAL_AUDIT_BRIEF_2026-07-18.md`
- A sanitized executive description of known defects and current operating limits
- Public accreditation records and vendor questions

Level Zero may be sent for scoping and pricing. It contains no private source archive.

### Level One: Confidential Documentation

Available only after a nondisclosure agreement, conflict declaration, named reviewer list, and data-handling terms:

- `docs/ADVERSARIAL_CODE_AUDIT_2026-07-18.md`
- Current architecture and trust-boundary diagrams
- Data dictionary
- Provider inventory without secret values
- Database migration inventory
- Current release, calibration, provider, and data-quality reports
- Known-issue register

### Level Two: Frozen Source And Test Package

Available only after statement-of-work execution:

- Signed-tag source archive
- Git bundle or read-only private repository access limited to the audit snapshot
- `package.json` and lockfile
- Source under `src/`
- Tests under `test/`
- Scripts under `script/`
- Database migrations under `supabase/migrations/`
- Dashboard assets and service worker
- Sanitized configuration examples
- Continuous-integration definitions
- Software bill of materials
- Dependency and license inventory

### Level Three: Controlled Test Environment

Available only when required by the contracted scope:

- Sanitized local application instance
- Test-only Supabase project or isolated local PostgreSQL instance
- Test provider credentials with no billing authority beyond the approved cap
- Synthetic users and synthetic ledger records
- Network and application logs generated for the engagement
- Time-limited remote access protected by multifactor authentication and internet-protocol restrictions when supported

No reviewer receives production credentials by default.

## Core Technical Evidence

### Product And Architecture

- Complete capability brief
- Product boundary and prohibited claims
- End-to-end decision flow
- Trust-boundary and data-flow diagrams
- Application programming interface route inventory
- Database table, function, policy, and role inventory
- Authentication and authorization design
- Local, remote projection, and synchronization design

### Deterministic Mathematics

- American-to-decimal odds conversion
- Implied-probability conversion
- Two-sided no-vig normalization
- Market-hold calculation
- Model-to-market shrinkage
- Expected-value calculation
- Kelly-fraction and stake-cap calculation
- Minimum-price calculation
- Push-aware count-market handling
- Unit tests, boundary tests, property tests, and reference calculations

### Predictive Models

- Complete model registry
- Model source and version identifiers
- Feature definitions and provenance
- Target definitions
- Training or rate-estimation logic
- Calibration status and promotion policy
- Baseline definitions
- Chronological split logic
- Bootstrap and uncertainty logic
- Every model change after the audit snapshot

### Live Data And Pricing

- Provider interfaces and normalization logic
- Exact-book and exact-market matching logic
- Timestamp and freshness rules
- Opposite-side-price requirements
- Quota and provider-failure behavior
- Screenshot and optical-character-recognition boundaries
- Source-status and degraded-provider behavior
- Sanitized sample payloads where licensing permits disclosure

### Evidence Ledger And Settlement

- Canonical record contract
- Hash and canonicalization implementation
- Append and duplicate rules
- Tamper-detection behavior
- Financial settlement rules
- Official outcome and closing-price evidence rules
- Legacy-record exclusion behavior
- Local-to-remote synchronization and replay behavior
- Shadow-evidence migration and deployment status

### Security

- Threat model
- Secret inventory without values
- Authentication-token lifecycle
- Cross-site request forgery controls
- Content-security policy
- Server-side request controls
- Input-validation schemas
- Request-body and file-upload handling
- Dependency audit and signature verification
- Secret scan
- Row-level-security and forced-row-level-security evidence
- Service-role and function-permission review

### Operations And Release

- Clean installation transcript
- Type-check transcript
- Full test transcript
- Coverage report with excluded or unloaded modules identified
- Static dependency graph and circular-dependency report
- Duplication report
- Package dry-run inventory
- Release-readiness report
- Calibration-readiness report
- Provider-readiness report
- Data-quality report
- Rollback and incident-response procedures

## Current Known Evidence

The following local results were recorded before the immutable snapshot and must be rerun from the final audit tag:

- 473 of 473 automated tests passed.
- Type checking passed under Node.js 20.20.2 and the available Node.js 24 runtime.
- Loaded-module line coverage was 89.19 percent.
- Loaded-module branch coverage was 71.61 percent.
- Loaded-module function coverage was 93.48 percent.
- The coverage run did not load every browser, native, script, or database path and is not full-repository coverage.
- Dependency auditing reported zero known vulnerabilities at the configured threshold.
- Package signature auditing verified signatures and attestations for the packages it recognized.
- Secret scanning reported no finding in the tested working tree.
- Circular-dependency analysis found `src/index.js -> src/server.js -> src/index.js`.
- Duplication analysis reported 0.86 percent duplicated lines across the examined files.
- Release readiness was `blocked` with a score of 64 out of 100.
- Model validation, exact live pricing, licensed injury coverage, and empirical edge evidence remained blocked.

These are preflight observations, not independent audit conclusions.

## Required Snapshot Commands

The final commands may be adjusted for the accepted branch workflow, but the audit record must preserve the exact commands actually used.

```bash
git status --short --branch
git rev-parse HEAD
git show --no-patch --format=fuller HEAD
git tag --verify bear-edge-audit-2026-07-18
git archive --format=tar.gz --output bear-edge-audit-2026-07-18.tar.gz bear-edge-audit-2026-07-18
shasum -a 256 bear-edge-audit-2026-07-18.tar.gz
npm ci
npm run verify
npm audit --audit-level=high
npm audit signatures
npm pack --dry-run
```

The final package must also generate a CycloneDX or SPDX software bill of materials with the selected tool and record that tool's name, version, command, and output digest.

## Chain-Of-Custody Log

Every transfer must add a row. No row may be rewritten after countersignature.

| Transfer identifier | Date and time with zone | Sender | Recipient | Artifact | SHA-256 digest | Transfer method | Purpose | Sender signature | Recipient acknowledgment |
|---|---|---|---|---|---|---|---|---|---|
| `PENDING-001` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |

## Reviewer Receipt Requirements

Each reviewer must confirm in writing:

- The exact artifact names and digests received.
- The date and time access began and ended.
- The identities of every person and system that accessed the artifacts.
- Whether any artifact was uploaded to an artificial-intelligence system, cloud scanner, subcontractor, or foreign jurisdiction.
- Every locally generated derivative artifact and its retention period.
- Secure deletion or return at engagement end.

## Evidence Exclusions

Unless separately authorized, the package excludes:

- Production secrets and provider keys.
- Personal sportsbook account information.
- Unredacted user records.
- Licensed data that cannot legally be redistributed.
- Browser session cookies.
- Personal photographs or unrelated attachments.
- Unrelated files from the local machine.
- Any code change created after the signed audit tag.

## Change Control During Audit

The audited snapshot is immutable. Remediation occurs on a separate branch. Every proposed fix must identify:

- Original finding identifier.
- Original audit commit.
- Remediation commit.
- Changed files.
- New or changed tests.
- Verification result.
- Reviewer retest result.

The final report must distinguish the original snapshot from the remediated snapshot and identify both by full commit digest.

## Completion Conditions

This manifest becomes complete only when:

- The owner approves the in-scope working tree.
- A clean audit snapshot commit and signed tag exist.
- Every final artifact has a recorded SHA-256 digest.
- Verification passes from a clean checkout.
- Secret scanning passes against the supplied history and archive.
- All reviewers sign receipt acknowledgments.
- All final and retest reports identify the exact audited artifact.

Until then, the package is suitable for vendor scoping but not for a reproducible external conclusion.
