# Domain table cutover — approval required before AWS changes

Prepared locally; not deployed. Uses the existing eight Lambdas and REST paths.
New tables: relive-offers, relive-wallet, relive-purchases, relive-favourites,
relive-notifications, relive-reviews. Existing users, listings and migrations remain.
All six new tables use on-demand capacity and PITR via the migration runner.

## Layout and behaviour

- Users retains profiles/email uniqueness. Runtime no longer writes commerce data
  there. Legacy rows remain until a separately approved cleanup.
- Wallet balances live at USER#id / BALANCE with their own version. Top-ups do not
  rewrite profile records. Ledger records use a UserIndex to preserve ID-based
  receipt lookup. Historical seller earnings are migrated from successful sales.
- Offers have BuyerIndex, SellerIndex and ListingIndex. Timeline entries are
  separate records ordered by their original sequence.
- Purchases have BuyerIndex and SellerIndex. Payment request-derived IDs are retained.
- Favourites retain USER#id / FAV#listingId in their own table.
- Notifications are full records under USER#id / NOTICE#timestamp#id; no pointers.
- Reviews use TRANSACTION#id / REVIEWER#id and ReviewedUserIndex.
- Purchase writes still use one cross-table DynamoDB transaction. No dual writes
  or fallback to stale legacy balances are allowed.
- GSI-backed lists are eventually consistent; direct record/balance reads are strong.
- Offers, wallet history, purchases/sales and dashboard notifications expose signed,
  user-bound continuation cursors. Frontend Previous/Next controls use them.
- Dashboard aggregate counts still query the relevant datasets; materialized
  counters are a future scaling improvement, not part of this cutover.

## Before approval

Review the new migrations, migration plan tool, and deployment changes. The runtime
role must be allowed to GetItem/PutItem/UpdateItem/DeleteItem/Query (including index
ARNs) and perform transactional constituent operations on the appropriate tables.
The deployment operator also needs table creation/PITR/backup, Lambda deployment
and reserved-concurrency permissions. Existing LabRole permissions have not been
verified here. No role or IAM policy is changed by these scripts.

Do not upload new Lambda packages independently: existing accounts need their
balances migrated first. Capture a known test account balance and purchase history.

## Approved execution sequence (from infrastructure directory)

1. Package locally: `node package-backend.js`.
2. Create the new tables: `npm run db:migrate`. Original migration files are unchanged.
3. Read-only preview: `node migrate-domain-data.js`. This prints counts, not records.
4. Pause application invocations: `node domain-maintenance.js freeze --apply`.
   This saves previous concurrency settings in .domain-maintenance.json, sets all
   existing project functions (including legacy relive-api) to zero concurrency,
   and waits for their maximum invocation timeout. Stop external database writers
   and scripts too. The website/API will be unavailable during maintenance.
5. Back up, copy, and verify: `node migrate-domain-data.js --apply`.
   This waits for native backups of users/listings, refuses unknown/dangling source
   records, copies without overwriting conflicts, compares full destination records
   and counts, then writes a READY checkpoint. Original records are not deleted.
6. Recheck: `node migrate-domain-data.js --verify`.
7. Deploy: `node deploy-backend.js --apply --domain-cutover`.
   It checks frozen functions, source fingerprints and verified destinations before
   any Lambda updates. Every function receives all table variables plus STORAGE_SCHEMA.
8. Apply routes if needed: `node deploy-api.js --apply`.
9. Rebuild/upload frontend from ../frontend:
   `npm run build`
   `aws s3 sync dist/ s3://relive-web-cloudproject --region us-east-1`
10. Resume: `node domain-maintenance.js resume --apply` from infrastructure.
    Configuration checks run first; a CUTOVER marker prevents legacy recopy, then
    original concurrency is restored for eight domain functions. Legacy relive-api
    stays frozen so an old greedy API route cannot write old storage.
11. Test login, existing balances, offers, top-up confirmation/retry, purchase,
    receipt, sale history, favourites, notification read status and mutual reviews.
    Confirm the records appear in the new tables. Check pagination with >20 items.

## Failure and recovery

- Migration reruns before cutover only accept identical destination records; they
  never overwrite a changed destination. Conflicting data requires investigation.
- Keep maintenance enabled after any partial deployment failure. Fix and rerun.
- If freeze itself fails, no data copying is allowed; inspect permissions and saved
  concurrency settings. Keep the local manifest; it records original settings.
- If resume partly fails, rerun resume. It accepts READY or CUTOVER and restores
  the recorded settings. Do not rerun the copy after CUTOVER.
- Once new writes resume, restoring the legacy app/data would lose those writes.
  A post-cutover rollback requires reconciliation. Do not blindly restore backups.
- Before any new writes, an operator can restore the saved pre-cutover packages and
  configurations and concurrency settings. That rollback is manual and requires
  separately reviewed commands; this implementation does not automate it.
- Pending Lambda stream events can resume after maintenance. The existing consumer
  only logs changes, so it does not duplicate payments or mutate balances.
