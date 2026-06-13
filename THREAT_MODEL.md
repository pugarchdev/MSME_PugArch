# Threat Model

Primary risks include unauthorized account access, competitor bid disclosure, payment proof tampering, receipt exposure, replayed payment webhooks, forged procurement actions, and accidental PII leakage.

Mitigations:
- Authenticate and authorize every protected route.
- Keep seller competitor identity hidden during live reverse auctions unless explicitly enabled.
- Store payment proof references through private document/file flows.
- Use audit logs for status changes, uploads, approvals, and ranking computations.
- Reject duplicate offline transaction references per buyer organization.

