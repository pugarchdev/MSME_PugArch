# Backup And Recovery

Database and storage backups should be tested before production changes that affect procurement, payments, documents, or audit data.

Recovery priorities:
- Restore authentication and organization records.
- Restore procurement and financial transaction state.
- Restore private file/document references.
- Reconcile payment and escrow records against provider or bank statements.

