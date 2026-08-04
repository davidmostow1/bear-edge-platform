# Bear Edge Independent Audit And Evidence Arbitration Request For Proposal

## Procurement Status

- Request identifier: `BEAR-EDGE-2026-07-18-RFP-01`
- Prepared: July 18, 2026
- Status: Non-confidential request-for-proposal package; not yet issued
- Product: Bear Edge sports-betting research and decision-control application
- Repository: Private repository `davidmostow1/bear-edge-platform`
- Current operating permission: `PRICE_CHECK_ONLY`
- Source-code disclosure: Prohibited until a nondisclosure agreement, data-handling agreement, statement of work, named reviewer list, and conflict-of-interest declaration are complete

## Purpose

Bear Edge requires independent verification of its software engineering, security, evidence integrity, statistical claims, and wagering-domain controls. This procurement is not seeking a favorable opinion, a marketing endorsement, a profitability promise, or a generic automated scan. It is seeking evidence that can withstand disagreement among qualified reviewers.

No single vendor will be treated as a source of absolute truth. The work is divided among independent specialists whose conclusions will be compared against the same frozen evidence package and predeclared acceptance criteria:

1. An accredited gaming testing laboratory will evaluate wagering-domain functionality, evidence integrity, settlement behavior, and any applicable wagering-system standards.
2. An accredited application-security organization will perform a white-box source-code, architecture, application programming interface, authentication, database, supply-chain, and deployment review.
3. An independent statistical validation organization will assess probability integrity, data leakage, calibration, benchmark performance, uncertainty, closing-line value, and the evidentiary requirements for any claim of predictive edge.

The three reviewers must perform their initial work independently. They must not receive another reviewer's draft conclusions before submitting their own initial signed report.

## Current Product Truth

The current software is a professional research and risk-control chassis. It is not a proven profitable betting algorithm.

The following limitations are mandatory disclosure items:

- The only authorized operating state is `PRICE_CHECK_ONLY`.
- Four registered predictive models remain `research_only`.
- Zero models are validated.
- There are zero eligible calibration predictions and zero settled calibration predictions in the current readiness report.
- There are zero official prediction-outcome records and zero exact-book closing-price records in the current evidence set.
- The current provider snapshot reports 32 research candidates and zero priced candidates.
- There is no demonstrated positive closing-line value, return on investment, calibration advantage, or superiority to a no-vig market baseline.
- Licensed injury and lineup coverage is not complete.
- Exact live DraftKings pricing is not currently verified.
- The current branch contains material uncommitted and untracked work, so the repository must be frozen before an external review can produce a reproducible conclusion.
- The application is not approved for unrestricted public internet deployment, consumer subscriptions, or enterprise wagering decisions.

The complete technical disclosure is in `docs/CURRENT_ALGORITHM_CAPABILITIES_AND_EXTERNAL_AUDIT_BRIEF_2026-07-18.md`. The current internal adversarial findings are in `docs/ADVERSARIAL_CODE_AUDIT_2026-07-18.md`. Reviewers must inspect the source and executable behavior rather than accepting either document as proof.

## Independence Requirements

Every bidder and every named reviewer must sign an independence and conflict-of-interest declaration before receiving confidential material. The declaration must disclose:

- Current or recent paid work for sportsbooks, betting exchanges, gaming operators, sports-data suppliers, affiliate marketers, tout services, model vendors, or direct competitors.
- Ownership, investment, referral, commission, affiliate, reseller, or contingent-fee interests connected to Bear Edge or any provider in its supply chain.
- Any relationship with another bidder in this procurement.
- Any planned use of subcontractors, offshore personnel, artificial-intelligence systems, or third-party code-analysis platforms.
- Any circumstance that could reasonably be perceived as affecting independence.

Compensation must be fixed-fee or time-and-materials. Compensation may not depend on a pass result, certification result, security finding count, model-performance result, investment event, product sale, or commercial launch.

No reviewer may modify the audit target and then certify its own modification without clearly separating remediation consulting from independent retesting. Remediation and retesting must be separately scoped and reported.

## Required Credential Evidence

### Gaming Testing Laboratory

The laboratory must provide current, independently verifiable accreditation evidence and the exact scope applicable to the proposed work.

Minimum evidence:

- Current ISO/IEC 17025 testing-laboratory accreditation from an accreditation body recognized under the International Laboratory Accreditation Cooperation mutual-recognition arrangement.
- Current ISO/IEC 17020 inspection-body accreditation or ISO/IEC 17065 product-certification accreditation when the bidder proposes to issue an inspection or certification conclusion.
- An accreditation scope that expressly covers the testing methods or product categories the bidder proposes to apply.
- Current regulatory approvals relevant to event wagering or sports betting, if the bidder relies on those approvals.
- Named technical personnel with wagering-system, software, security, and mathematical-testing experience.

ISO/IEC 17025 accreditation alone does not authorize a profitability claim. The laboratory must state which conclusions are inside its accredited scope, which are non-accredited professional services, and which are outside its competence.

### Application-Security Organization

The organization must provide:

- Current CREST organizational accreditation for penetration testing or an equivalent independently governed accreditation accepted in the bidder's jurisdiction.
- Named reviewers holding current application-security qualifications appropriate to source-assisted testing, preferably CREST Certified Tester Application, Offensive Security Web Expert, or credentials of comparable rigor.
- Demonstrated experience in manual source-code review, application programming interface testing, threat modeling, software architecture review, database authorization, cloud security, and JavaScript or Node.js systems.
- A testing methodology aligned to the Open Worldwide Application Security Project Application Security Verification Standard and relevant testing guides.
- Professional indemnity insurance and a documented confidential-information handling process.

An automated scanner report alone is non-responsive.

### Statistical Validation Organization

Statistical consulting does not have a laboratory-accreditation system equivalent to ISO/IEC 17025. The proposal must therefore provide independently checkable professional and institutional evidence:

- A neutral institution with an established expert-review and model-validation practice, or a panel led by an American Statistical Association Accredited Professional Statistician in good standing.
- At least one reviewer with a doctoral degree in statistics, biostatistics, econometrics, machine learning, or a closely related quantitative field.
- Demonstrated experience with probabilistic forecasting, calibration, time-series validation, hierarchical or clustered outcomes, bootstrap uncertainty, multiple-testing control, and predictive-model governance.
- A signed commitment to the American Statistical Association Ethical Guidelines for Statistical Practice or an equivalent professional code.
- A reproducible analysis package containing code, dependency versions, seeds, intermediate datasets, and result tables.

Domain experience in sports forecasting is useful but does not replace statistical independence or methodological competence.

## Candidate Organizations And Credential Status

This list is a procurement starting point, not a preselection or endorsement.

### Gaming Laboratory Candidate A: BMM Testlabs

The American Association for Laboratory Accreditation directory currently lists BMM North America Inc. with ISO/IEC 17025 information-technology testing, ISO/IEC 17020 inspection-body, and ISO/IEC 17065 product-certification accreditations expiring June 30, 2028. The current ISO/IEC 17020 scope identifies BMM as a Type A third-party inspection body and includes system auditing, hash verification, operational verification, interoperability verification, and security review. A2LA scope material also identifies source-code review and compilation among BMM testing activities.

Primary credential record: [A2LA directory record for BMM North America Inc.](https://customer.a2la.org/index.cfm?event=directory.detail&labPID=006071FE-CE38-40B6-9C78-D4C6DA80BF5C)

Official contact path: [BMM Testlabs](https://bmm.com/) and `info@bmm.com`

Required precondition: BMM must identify the exact current accredited scope applicable to a decision-support application that does not accept wagers and must distinguish accredited testing from advisory work.

### Gaming Laboratory Candidate B: Gaming Laboratories International

Gaming Laboratories International publishes the GLI-33 Event Wagering Systems standard and offers sports-betting, system, application programming interface, security, software-quality, and source-review services. Its published product-certification scope has included GLI-33.

Official standards: [GLI standards directory](https://gaminglabs.com/gli-standards/) and [GLI-33 Event Wagering Systems version 1.1](https://gaminglabs.com/wp-content/uploads/2024/06/GLI-33-Event-Wagering-Systems-v1.1-1.pdf)

Official contact path: [GLI contact page](https://gaminglabs.com/contact/)

Credential warning: The A2LA records located during preparation showed June 30, 2026 validity for the Lakewood testing and product-certification credentials. Because this request is dated July 18, 2026, those records are not sufficient proof of current accreditation. Gaming Laboratories International may bid only after providing current renewed certificates and scopes that can be independently verified with the issuing accreditation body.

### Security Candidate A: NCC Group

CREST identifies accredited member organizations as independently quality-assured providers, and NCC Group states that it is a CREST-approved member. NCC Group offers consultant-led source-code review, software architecture review, application penetration testing, and application programming interface assessment. Its public assessment reports demonstrate commit-specific, source-assisted reviews with stated person-days, methods, limitations, and retesting.

Primary credential context: [CREST accreditation purpose and assurance](https://www.crest-approved.org/about-us/what-we-do/)

Service evidence: [NCC Group code review](https://www.nccgroup.com/technical-assurance/application-security/code-review/) and [NCC Group application security](https://www.nccgroup.com/technical-assurance/application-security/)

Required precondition: NCC Group must provide its current CREST member record, name the assigned reviewers, disclose any subcontractors or artificial-intelligence-assisted analysis, and commit to both manual review and executable testing.

### Security Candidate B: Synack

CREST reports that Synack has been a CREST Accredited Member Company for Penetration Testing since 2019 and describes its use of CREST Certified Tester Application, CREST Certified Tester Infrastructure, and CREST Registered Penetration Tester credentials.

Primary credential record: [CREST description of Synack accreditation and practitioner credentials](https://www.crest-approved.org/how-synack-uses-crest-certifications-to-improve-penetration-testing/)

Required precondition: The engagement must assign named senior reviewers rather than rely only on crowd testing. White-box business-logic and source-code review must be contractually included.

### Statistical Candidate A: National Institute Of Statistical Sciences

The National Institute of Statistical Sciences is an independent nonprofit statistical research institute. It advertises expert reviewing and validation, independent expert panels, methods evaluation, statistical modeling, time-series work, and bias mitigation. It was founded by major professional statistical societies and has worked with United States federal statistical agencies.

Primary capability record: [National Institute of Statistical Sciences capabilities](https://www.niss.org/niss-capabilities) and [National Institute of Statistical Sciences role as independent expert](https://www.niss.org/about/)

Official contact: `director@niss.org`

Required precondition: The institute must assign reviewers with predictive-validation expertise and agree to a preregistered, reproducible protocol. Institutional reputation alone is not evidence that Bear Edge works.

### Statistical Candidate B: Independent Accredited Professional Statistician Panel

The American Statistical Association describes the PStat credential as peer-reviewed recognition of statistical training, applied competence, continuing professional development, ethical commitment, and communication ability. The credential is portfolio-based and voluntary, so it is a reviewer qualification rather than a guarantee of a correct conclusion.

Primary credential record: [American Statistical Association accreditation guidelines](https://www.amstat.org/asa/files/pdfs/accreditation/Guidelines.pdf) and [American Statistical Association PStat usage and verification resources](https://www.amstat.org/your-career/pstat-usage-terms)

Required precondition: At least two independent panel members must be used, their good-standing status must be verified directly with the American Statistical Association, and neither may have worked on Bear Edge.

## Common Audit Target

All reviewers will receive the same immutable audit target after contracting. The target must include:

- A dedicated audit branch and commit containing every in-scope source, test, script, migration, and document.
- A signed tag identifying the audit commit.
- A source archive and SHA-256 digest.
- A software bill of materials and dependency lockfile.
- Exact runtime and operating-system requirements.
- A clean installation and verification transcript.
- Database migration history and a sanitized schema export.
- Sanitized configuration examples with no production secret values.
- Current readiness, calibration, provider, and data-quality reports.
- A data dictionary and provenance map.
- A list of every known defect, limitation, excluded component, and undeployed migration.
- A chain-of-custody log for every artifact supplied.

Reviewers must identify the exact commit and artifact digest in every report. A report that does not identify the reviewed target is not acceptable.

## Workstream One: Gaming And Wagering-System Review

The gaming laboratory must determine whether Bear Edge's wagering-domain controls behave as documented and whether any portion can be assessed within an accredited scope.

Required review areas:

- Exact market identity, participant identity, event identity, side, line, sportsbook, timestamp, and opposite-side-price matching.
- Odds conversion, implied probability, no-vig normalization, market hold, expected value, Kelly fraction, capped stake, and minimum-price calculations.
- Push handling, void handling, ties, postponements, cancellations, stat corrections, resettlements, and event-time cutoff behavior.
- Prevention of stale, unmatched, partial, screenshot-only, or unverifiable prices from becoming authorized betting records.
- Separation of research candidates, price checks, authoritative evaluations, financial settlements, official outcomes, and closing-price evidence.
- Hashing, append behavior, duplicate prevention, modification detection, audit-log recovery, and remote projection consistency.
- Provider failure, degraded-source, quota-exhaustion, network-timeout, and partial-response behavior.
- Responsible-gambling controls and presentation risks within the actual current product boundary.
- Applicability and gaps relative to GLI-33 or any other proposed wagering standard.

Required deliverables:

- A signed scope statement distinguishing accredited and non-accredited work.
- A requirements-to-evidence traceability matrix.
- Reproducible test cases and observed results.
- A severity-ranked findings report with exact source or interface references.
- A standards applicability statement that identifies non-applicable requirements instead of silently omitting them.
- A retest report after remediation.
- An explicit statement that compliance testing does not establish predictive profitability.

## Workstream Two: White-Box Security And Software Correctness Review

The security organization must review the complete system, not only the visible dashboard.

Required review areas:

- Architecture, trust boundaries, data flows, threat model, attack surface, and privilege boundaries.
- Authentication, authorization, session handling, cross-site request forgery, cross-site scripting, content-security policy, origin handling, and local-network exposure.
- Application programming interface input validation, body-size handling, unsafe methods, error disclosure, rate limiting, and denial-of-service behavior.
- Server-side request forgery, redirect handling, external fetch controls, timeout behavior, and untrusted source ingestion.
- Secret management, provider-key handling, environment files, log redaction, browser storage, and build artifacts.
- PostgreSQL and Supabase row-level security, forced row-level security, service-role boundaries, migration safety, function permissions, and storage policies.
- Audit-record canonicalization, digest generation, tamper detection, replay, duplicate and race conditions, alternate write paths, and settlement authority.
- Dependency integrity, malicious-package exposure, lockfile consistency, build reproducibility, continuous integration, and release provenance.
- Business-logic bypasses that could turn `PRICE_CHECK_ONLY` into an unauthorized `BET` or persist a forged model status.
- Data provenance and model-input poisoning.
- Deployment configuration and the difference between local-only safety and internet-facing safety.

Required deliverables:

- A named-reviewer and person-day statement.
- A documented methodology listing manual and automated techniques.
- A complete findings report with severity, exploit scenario, evidence, file and line references, reproduction instructions, consequence, and minimal remediation.
- A coverage statement identifying source that was fully reviewed, sampled, or excluded.
- Machine-readable findings in Static Analysis Results Interchange Format when feasible.
- A retest report that marks each finding fixed, partially fixed, accepted, or unresolved.
- A publishable executive summary that reveals no confidential source.

## Workstream Three: Independent Statistical And Predictive-Validity Review

The statistical reviewer must preregister the analysis before seeing outcome results from the eventual shadow dataset. The current zero-outcome state means the initial engagement can validate the protocol, code, and data design, but it cannot honestly validate predictive edge.

Required review areas:

- Model definitions, estimands, assumptions, feature provenance, target construction, and missing-data handling.
- Look-ahead leakage, same-event leakage, player and team clustering, repeated measures, temporal dependence, selection bias, survivorship bias, and post-selection inference.
- Chronological train, validation, and test partitioning at event level.
- Comparison against no-vig market probability, naive recent-rate baselines, season-rate baselines, and any stronger agreed benchmark.
- Calibration intercept, calibration slope, expected calibration error, reliability curves, Brier score, logarithmic loss, discrimination, and coverage.
- Closing-line value calculated from exact same-book, same-market, same-line, timestamped closing evidence.
- Return on investment, yield, drawdown, exposure, market-family breakdown, price-band breakdown, and sensitivity to stake sizing.
- Cluster-aware bootstrap or another justified dependence-aware uncertainty method.
- Multiple-testing and model-selection controls across markets, thresholds, sports, and model versions.
- Versioned model registry, promotion criteria, rollback criteria, and prevention of retrospective relabeling.
- Sample-size sufficiency and the validity of the current registered minimum of 500 settled predictions.

Required deliverables:

- A preregistered statistical-analysis plan with immutable timestamp.
- A data-quality and provenance report.
- Independently executable analysis code and environment definition.
- A report separating code correctness, protocol adequacy, and empirical model performance.
- Confidence intervals or uncertainty intervals for every performance claim.
- An explicit result for each model: `not testable`, `refuted`, `not verified`, `verified with limitations`, or `verified for the stated population and period`.
- A list of claims that the available evidence cannot support.
- A final report after the registered evidence threshold is reached; no interim result may be promoted as proof of profitability.

## Evidence Arbitration Protocol

The purpose of arbitration is to resolve factual and methodological disagreements without allowing reputation, payment, or confidence to substitute for evidence.

### Phase One: Blind Initial Review

Each reviewer receives the same frozen artifacts, scope, questions, and known-issue disclosure. Each submits a signed initial report without seeing the other reports.

### Phase Two: Claim Matrix

Every material claim is entered into a shared matrix with:

- Claim identifier.
- Exact proposition being tested.
- Responsible workstream.
- Acceptance criterion.
- Evidence supplied.
- Reproduction procedure.
- Reviewer conclusion.
- Confidence and limitations.
- Contradictory evidence.

Permitted conclusions are:

- `VERIFIED`: Reproduced and supported within the stated scope.
- `VERIFIED_WITH_LIMITATIONS`: Supported only under explicitly documented conditions.
- `NOT_VERIFIED`: Evidence is insufficient.
- `REFUTED`: Reproducible evidence contradicts the claim.
- `NOT_TESTABLE`: The required data or operational state does not exist.

### Phase Three: Written Rebuttal

After initial reports are locked, each reviewer receives only the claims that conflict with its conclusions. Rebuttals must address evidence and method, not credentials or reputation.

### Phase Four: Reproduction

Conflicting executable claims are rerun in a controlled environment. The audit coordinator records commands, inputs, outputs, hashes, dates, and participants.

### Phase Five: Neutral Tie-Breaker

If a material conflict remains, the parties jointly select a fourth specialist with no prior involvement and credentials appropriate to the disputed issue. The tie-breaker receives the frozen target, initial reports, rebuttals, and reproduction transcript. The tie-breaker may not expand the claim or substitute a new product requirement.

### Phase Six: Final Record

The final record preserves agreement and disagreement. It must not average incompatible conclusions into a false consensus. Any unresolved material conflict remains `NOT_VERIFIED` for release purposes.

## Mandatory Acceptance Rules

- Local tests passing does not prove security, profitability, calibration, or production readiness.
- Accreditation does not extend beyond the accrediting body's published scope.
- Screenshots, articles, search results, and manually transcribed odds are contextual evidence, not authoritative price authorization.
- A positive point estimate without dependence-aware uncertainty is not proof of edge.
- A statistically favorable result without exact offered and closing prices is not proof of monetizable edge.
- A security scan without manual business-logic review is incomplete.
- A report without exact commit and artifact hashes is non-reproducible.
- A report funded on a contingent basis is disqualified.
- A reviewer that conceals subcontractors or artificial-intelligence processing is disqualified.
- Missing evidence results in `NOT_VERIFIED` or `NOT_TESTABLE`, never an assumed pass.
- Any unresolved critical or high-severity authorization, ledger-integrity, settlement, secret-management, or row-level-security issue blocks production authorization.
- Bear Edge remains `PRICE_CHECK_ONLY` until both technical gates and empirical model-promotion gates are independently satisfied.

## Proposal Response Requirements

Each proposal must include all of the following:

1. Legal entity name, ownership, headquarters, and contracting office.
2. Current accreditation certificates and complete scopes from the issuing body.
3. The exact parts of this request that fall inside and outside accredited scope.
4. Named lead and supporting reviewers, resumes, credentials, and intended responsibilities.
5. Conflict-of-interest and independence declarations.
6. Subcontractor, artificial-intelligence, and third-party-tool disclosures.
7. Proposed methodology, sampling limits, exclusions, and estimated source coverage.
8. Fixed fee or rate card, estimated person-days, payment schedule, and expenses.
9. Schedule for kickoff, initial report, remediation period, retest, and final report.
10. Data-residency, access-control, encryption, retention, deletion, incident-notification, and breach-liability terms.
11. Professional indemnity and cyber-insurance evidence.
12. Deliverable samples with confidential client information removed.
13. References for comparable source-assisted or wagering-domain engagements.
14. Terms governing publication of a sanitized executive conclusion.
15. Confirmation that the bidder accepts the evidence-arbitration protocol.

## Confidentiality And Source Access

The initial inquiry and this request contain no secret values, private user data, licensed provider data, or source archive.

Confidential access will be staged:

1. Public capability brief and request for proposal.
2. Signed nondisclosure agreement, data-processing terms, reviewer list, and conflict declaration.
3. Read-only access to the frozen source archive or dedicated private repository snapshot.
4. Time-limited access to a sanitized test environment.
5. Separately authorized access to any remote database or provider account.

Production secret values will not be shared. Test credentials will be unique, least-privileged, time-limited, monitored, and revoked after the engagement.

## Procurement Decision Rule

Price is not the primary selection criterion. Selection will consider:

- Applicable verified accreditation and scope.
- Independence and conflict transparency.
- Named reviewer competence.
- Manual review depth.
- Reproducibility and evidence quality.
- Clear exclusions and refusal to overclaim.
- Secure handling of private source.
- Retest quality.
- Total cost and schedule.

A bidder that promises certification or profitability before inspecting the code and evidence will be rejected.

## Current Release Boundary

This procurement does not authorize deployment, betting, source disclosure, expenditure, contract signature, or migration execution. Those actions require explicit owner approval. Until a frozen audit target exists and the contracted reviews are complete, Bear Edge remains a research system operating under `PRICE_CHECK_ONLY`.
