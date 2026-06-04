# Data Classification

## Restricted

- Password hashes, JWT secrets, API keys, payment secrets, webhook signing secrets, database URLs, and Redis URLs.
- Sealed financial quotes, settlement proof, payment proof, bank data, and private procurement documents.

## Confidential

- Buyer and seller onboarding information.
- Organization membership, approvals, cart approvals, bids, orders, invoices, GRNs, disputes, messages, and audit logs.

## Internal

- Operational dashboards, compliance queues, fraud alerts, admin reports, and route readiness evidence.

## Public

- Published marketplace catalogue information and public bid listing details explicitly exposed by the API.

## Handling Rules

- Restricted and confidential data must not be logged as raw values.
- Private documents must use authenticated API access or signed URLs.
- Production secrets must be provided through environment variables and never committed.
- Audit logs should record actions without exposing sensitive payloads.
