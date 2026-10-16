# reLIVE

**Give it another life.** A second-hand marketplace with listings, favourites,
negotiation, simulated wallet payments, reviews and administrator moderation.

The project supports two backends: the original local Express/SQLite application
and an AWS deployment using S3, API Gateway, nine Lambda services and DynamoDB.
The instructions below document the current AWS scripts. The original local
setup and implementation notes are retained later in this file.

## AWS deployment flow

```text
S3 website → Browser → API Gateway /v1/api → Service Lambda → DynamoDB
                        Browser ↔ private S3 images (presigned requests)
relive-listings DynamoDB Stream → relive-listings Lambda → CloudWatch logs
```

The browser sends API requests; S3 does not invoke API Gateway. No CloudFront is
required by these scripts. The S3 website endpoint is HTTP, not HTTPS, and this
coursework setup is not suitable for production authentication over an untrusted
network. Payments are simulated. Forgot Password remains visible but its cloud
endpoint returns 501; email-based recovery is not implemented.

### 1. Prerequisites and credentials

- Node.js **22.12+**, npm and AWS CLI v2.
- An active AWS Academy Learner Lab session and its three temporary credential
  values: access key, secret key and session token.
- This project's scripts verify account **615663614353** and use **us-east-1**.
  They are not generic multi-account provisioning tools. Review account, bucket
  and table constants before adapting them to another environment.

Run commands on your Mac or lab IDE. Start from the project root unless a section
specifies otherwise. Install each project's locked dependencies:

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix infrastructure
```

Configure a dedicated CLI profile:

```bash
aws configure --profile learnerlab
export AWS_PROFILE=learnerlab
export AWS_DEFAULT_REGION=us-east-1
```

Enter the region and JSON output when prompted. If your CLI does not prompt for
the session token, edit `~/.aws/credentials` and add `aws_session_token` under the
same `[learnerlab]` profile. All three credentials must come from the same current
lab session. Keep credentials outside this repository. Protect the file and verify:

```bash
chmod 600 ~/.aws/credentials
aws sts get-caller-identity --no-cli-pager
```

If you already use a working default profile, keep it instead of introducing a
second one. Stale exported `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`AWS_SESSION_TOKEN` values can override profile credentials. Never paste credentials
into screenshots, source files or the report.

### 2. S3 buckets and website hosting

The deployment expects these existing buckets:

| Bucket | Purpose | Access |
| --- | --- | --- |
| `relive-web-cloudproject` | Compiled frontend only | Public read for website assets |
| `relive-images-cloudproject` | Listing/profile images | Private, presigned upload/download |

Only if a bucket does not already exist, create it in us-east-1:

```bash
aws s3api create-bucket --bucket relive-web-cloudproject --region us-east-1
aws s3api create-bucket --bucket relive-images-cloudproject --region us-east-1
```

Names must be available globally and match the scripts. Do not create replacements
for existing buckets. In **S3 → website bucket → Properties → Static website
hosting**, enable hosting with `index.html` as both index and error document.
The error document permits client routes to render, but S3 can still return an
error HTTP status for a directly requested client route.

Equivalent website configuration:

```bash
aws s3api put-bucket-website \
  --bucket relive-web-cloudproject \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"index.html"}}' \
  --region us-east-1
```

For the **website bucket only**, keep the two ACL public-access blocks enabled
and disable the two policy blocks if the lab allows public website hosting.
Account-level restrictions also apply. Add this bucket policy in the console:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicWebsiteRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::relive-web-cloudproject/*"
  }]
}
```

Keep **all public access blocked on the images bucket**. Use default SSE-S3
encryption. Optional S3 versioning can preserve overwritten objects; it is separate
from DynamoDB PITR. Do not upload `.env`, source code or credentials to the web bucket.
The backend deployment configures image-bucket POST CORS for the frontend origin.
Website-bucket CORS is not needed simply to navigate to the website.

### 3. Provision DynamoDB tables

From `infrastructure`:

```bash
cd infrastructure
npm run check
npm run db:status
npm run db:migrate
```

`check` reads account/bucket access and the listings table. `db:migrate` changes
AWS resources: it applies pending migrations, enables PITR on application tables
and records migration checksums in `relive-migrations`. `setup:database` is a legacy
alias for the same migration runner. Never edit an already applied migration.

| Table | Contents / indexes |
| --- | --- |
| `relive-users` | Profiles and email uniqueness records |
| `relive-listings` | Listings; SellerIndex, StatusIndex; NEW_AND_OLD_IMAGES stream |
| `relive-offers` | Offers, negotiation locks, history; BuyerIndex, SellerIndex, ListingIndex |
| `relive-wallet` | Balances and wallet ledger; UserIndex |
| `relive-purchases` | Purchases; BuyerIndex, SellerIndex |
| `relive-favourites` | User/listing favourites |
| `relive-notifications` | User notifications and read state |
| `relive-reviews` | Transaction reviews; ReviewedUserIndex |
| `relive-reports` | Moderation reports; StatusIndex |

Tables use string PK/SK and on-demand capacity. Creating tables does not migrate
legacy application data, seed cloud users or import SQLite accounts.

### 4. Choose first cutover or routine deployment

Read the checkpoint before choosing a path:

```bash
aws dynamodb get-item \
  --table-name relive-migrations \
  --key '{"PK":{"S":"DATA_MIGRATION"},"SK":{"S":"domain-v2"}}' \
  --projection-expression '#p' --expression-attribute-names '{"#p":"phase"}' \
  --region us-east-1 --no-cli-pager
```

**If the phase is CUTOVER, skip first-cutover copying and use section 5.** Do not
rerun the legacy copy after the application has begun writing to the domain tables.

For a first deployment/cutover only, from `infrastructure`:

```bash
export FRONTEND_ORIGIN=http://relive-web-cloudproject.s3-website-us-east-1.amazonaws.com
node package-backend.js
node migrate-domain-data.js
node domain-maintenance.js freeze --apply
node migrate-domain-data.js --apply
node migrate-domain-data.js --verify
node deploy-backend.js --apply --domain-cutover
node deploy-api.js --apply
node domain-maintenance.js resume --apply
```

Run each command separately and stop on errors. Freeze makes the API unavailable;
stop external database writers too. Copy creates backups and checks destinations
before recording READY. Resume checks deployment configuration, records CUTOVER
and restores service concurrency. Keep `.domain-maintenance.json`: it contains the
original concurrency settings. Do not resume a partially failed deployment or
manually fabricate migration markers. First deployment into empty tables follows
the same verification path. Register cloud accounts after deployment.

### 5. Package and deploy the nine Lambda services

For an environment already at CUTOVER, from `infrastructure`:

```bash
export FRONTEND_ORIGIN=http://relive-web-cloudproject.s3-website-us-east-1.amazonaws.com
node package-backend.js
node deploy-backend.js --apply
```

Packaging is local and produces `infrastructure/dist/relive-<service>.zip`.
Deployment changes AWS and is sequential, not atomic. Each package contains bundled
JavaScript with `index.handler`, Node.js 22, 512 MB memory and a 20-second timeout.

| Function | Responsibility |
| --- | --- |
| `relive-auth` | Registration, login, logout, session lookup, health |
| `relive-users` | Profiles, profile images, public profiles/reviews |
| `relive-listings` | Listing CRUD and stream logging |
| `relive-favourites` | Saved listings |
| `relive-images` | Presigned image uploads |
| `relive-offers` | Offers and negotiations |
| `relive-payments` | Simulated top-ups, purchases, transactions and reviews |
| `relive-dashboard` | Dashboard and notification read state |
| `relive-moderation` | Reports and administrator decisions |

Deployment preserves the signing secret and supplies domain-table names. It uses
an existing role or LabRole by default; `LAMBDA_ROLE_ARN` can select an approved role.
The caller needs deployment/PassRole permissions; the execution role needs the
appropriate table/index, image-bucket, stream and CloudWatch permissions. The
scripts do not grant IAM permissions or bypass lab restrictions.

Optional `--mail-env` reads `backend/.env.mail.local` and applies SMTP variables
only to `relive-auth`. **It does not implement password reset or send email.** Do
not use it for normal deployment. Never package or commit the mail credentials.

### 6. Deploy API Gateway, API key and CORS

From `infrastructure`:

```bash
node deploy-api.js --apply
```

The script creates/reuses the uniquely named `relive-api` REST API, maps explicit
methods directly to the service Lambdas, adds invocation permissions, configures
OPTIONS and gateway error CORS headers, and deploys stage `v1`. Route definitions
live in `infrastructure/services.js`. JWT checks happen inside Lambda; methods use
`authorizationType: NONE`, not a Gateway authorizer.

The script writes the actual API URL and `VITE_CLOUD_MODE=true` into
`frontend/.env.production.local`, preserving the existing client-key value.
Use the printed URL, not an old API ID from a screenshot.

It provisions `relive-v1-client` and `relive-v1-plan`. Stage throttling is rate 5,
burst 10. A newly created usage plan has rate 5, burst 10 and a 10,000/day quota;
existing plan limits are not overwritten. Inspect the console to verify actual values.

To enforce the client key deliberately:

1. Retrieve the key value privately in **API Gateway → API keys → relive-v1-client**.
2. Add it to `frontend/.env.production.local`:

```ini
VITE_API_KEY=YOUR_CLIENT_API_KEY
```

3. From `infrastructure`, deploy enforcement:

```bash
API_KEY_REQUIRED=true node deploy-api.js --apply
```

4. Immediately rebuild/publish the frontend in section 7. Coordinate this change
   because an older frontend without the key will be rejected during the transition.

Health, registration, login, forgot-password and OPTIONS are exempt. Existing method
key requirements are retained on routine deployments when API_KEY_REQUIRED is omitted;
new methods use its current setting. Set it explicitly to true when adding routes
that should require keys. Browser API keys are visible to clients and do not replace JWT
or ownership checks. Usage plans are not a hard spending limit.

### 7. Build and upload the website

From `infrastructure`, switch to `frontend`:

```bash
cd ../frontend
npm run build
aws s3 sync dist/ s3://relive-web-cloudproject --region us-east-1
```

Only the contents of `dist/` are uploaded. Environment changes require rebuilding.
Open the S3 website endpoint from its Properties tab. In browser Network tools,
confirm requests use the deployed HTTPS API, not localhost or an older API ID.
Cloud mode uses JWT bearer tokens in sessionStorage; local mode uses cookies.

### 8. Create the cloud administrator

Register the intended account through the cloud website first. From
`infrastructure`, preview and then apply its role change:

```bash
node set-admin.js 'admin@relive.local'
node set-admin.js 'admin@relive.local' --apply
```

Use the actual registered email. If ADMIN_EMAIL reserves that address, register
another intended admin address. Log out/in after promotion. Local SQLite seeding
does not create a cloud administrator. Never submit account passwords in reports.

### 9. Verify the deployment and stream

From `infrastructure`, run local checks (these do not prove deployed IAM access):

```bash
npm test
npm --prefix ../backend test
```

Set API_BASE to the actual printed API URL:

```bash
export API_BASE='https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/v1/api'
curl -i "$API_BASE/health"
```

Verify registration/login/logout, listing creation/image/edit/withdrawal, favourites,
offer/counteroffer/acceptance, wallet top-up, purchase and seller credit, reviews,
notification read state, reporting and admin investigation/removal/restoration.
Match website results with the relevant DynamoDB records. Test missing JWT (401),
missing required key (403) and invalid listing input (400). Check OPTIONS headers
and actual responses in browser Network tools, hiding tokens/key values.

Check the stream mapping:

```bash
aws lambda list-event-source-mappings \
  --function-name relive-listings --region us-east-1 \
  --query 'EventSourceMappings[].{UUID:UUID,State:State,Result:LastProcessingResult}' \
  --output table --no-cli-pager

aws logs tail /aws/lambda/relive-listings --since 15m --region us-east-1

aws logs filter-log-events \
  --log-group-name /aws/lambda/relive-listings \
  --filter-pattern '"listing_stream_record"' \
  --region us-east-1 --no-cli-pager
```

Creating a listing should produce INSERT; editing/withdrawal produces MODIFY.
Match listing keys and timestamps, not HTTP and stream invocation IDs: those are
separate executions. CloudWatch monitoring also exposes Invocations, Errors and
Duration. Handled HTTP 400 responses are not necessarily Lambda invocation Errors.

The deployment creates a missing mapping with Enabled=true, but does not re-enable
an existing disabled mapping. Inspect its LastProcessingResult first. If permissions
are available, re-enable it in Lambda Configuration → Triggers, or use the actual UUID:

```bash
aws lambda update-event-source-mapping \
  --uuid YOUR_MAPPING_UUID --enabled --region us-east-1
```

An explicit SCP denial cannot be overridden by an IAM Allow or this command. Do not
claim a lab restart always disables the mapping; investigate the observed error.
The current consumer logs changes only; it does not send notifications or emails.

### 10. Backup and recovery

From `infrastructure`, select a table explicitly:

```bash
TABLE_NAME=relive-users npm run backup:create
TABLE_NAME=relive-users npm run backup:list
```

Without TABLE_NAME, the script defaults to `relive-listings`. To back up all nine
application tables sequentially:

```bash
for table in relive-users relive-listings relive-offers relive-wallet \
  relive-purchases relive-favourites relive-notifications relive-reviews relive-reports
do
  TABLE_NAME="$table" npm run backup:create || break
done
```

This creates separate on-demand backups, not a scheduled job or an atomic
cross-table snapshot. Pause writes for a consistent multi-table recovery exercise.
Creation waits for AVAILABLE. Restore a chosen backup to a new, unused table:

```bash
BACKUP_ARN='YOUR_AVAILABLE_BACKUP_ARN' \
RESTORE_TABLE_NAME='relive-listings-restore-evidence' \
npm run backup:restore
```

The restore script starts the restore but does not wait for completion. Inspect
DynamoDB until ACTIVE, then query a known PK/SK and compare field values. Do not
point the live app at a restored table without reviewing indexes and operational
settings. For PITR, use the table's Backups tab to select a time inside its recovery
window and restore to a new table; verify the values from that time.

### 11. Routine update commands

These commands assume existing resources and a CUTOVER checkpoint. Run from the
project root, choosing only the relevant block.

**Frontend-only changes:**

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://relive-web-cloudproject --region us-east-1
```

**Backend implementation changes:**

```bash
cd infrastructure
node package-backend.js
node deploy-backend.js --apply
```

**API paths/security changes:**

```bash
cd infrastructure
API_KEY_REQUIRED=true node deploy-api.js --apply
cd ../frontend
npm run build
aws s3 sync dist/ s3://relive-web-cloudproject --region us-east-1
```

**New database migrations:** from `infrastructure`, inspect `npm run db:status`,
then run `npm run db:migrate` before deploying code that depends on them. Never
rerun the original domain-data copy for a routine update.

### 12. Troubleshooting and boundaries

| Symptom | Check |
| --- | --- |
| ExpiredToken / UnrecognizedClient | Refresh all three temporary credentials; verify STS identity |
| `voc-cancel-cred` denial | Lab/session restriction; refresh the session and inspect the exact denial |
| First domain deployment guard | Follow first-cutover steps, not a manually edited checkpoint |
| Website still uses old API | Check production env, rebuild, upload, then hard-refresh |
| Browser cannot reach API | Network request URL, API health, frontend origin and CORS |
| Route not found | services.js, deployed API methods and correct Lambda package |
| Listing absent from Marketplace | ACTIVE status, StatusIndex keys, correct table and index propagation |
| Admin account not found | Register it in the cloud before set-admin.js |
| Stream disabled | LastProcessingResult, execution role and organisational restrictions |

CloudFront access was denied in this Learner Lab; these instructions do not assume
it is deployed. No automatic S3 orphan-image cleanup or email recovery is deployed.
Wallet/notification summaries refresh after relevant actions and periodically across
sessions; there is no WebSocket push implementation. Old source balances, if present
on legacy user profiles, are not the authoritative domain wallet balances.

Do not run `cleanup-legacy-users.js`, `remove-demo-account.js` or
`remove-apakhabar-demo.js` as setup steps. They are destructive, separately reviewed
cleanup tools for specific records, not migrations or general deployment commands.

For submission, include readable source, deployed S3 assets, Lambda ZIPs and database
exports/backup evidence. Exclude `.env*`, AWS credentials, Gmail App Passwords and
`node_modules`. Native DynamoDB backups remain managed in AWS; a JSON scan export
is a logical data copy, not the same as a native backup or PITR snapshot.

---

## Original local application guide

The remaining sections describe **Express/SQLite local mode**. SQLite-specific
indexes, cookies, seeding and file-upload behaviour do not describe the Lambda
backend. Use the AWS guide above for cloud deployment; older infrastructure notes
may describe historical stages of the migration.

## Requirements
- Node.js 22.12+ (verified with 22.19) and npm
- No XAMPP services, external database, AWS, or cloud account needed

## Start locally
Open two terminals from this project folder.

### Backend — http://localhost:4000
```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run db:generate
npm run db:deploy
npm run setup:auth
npm run dev
```

On macOS/Linux, replace `Copy-Item .env.example .env` with `cp .env.example .env`.
Do not overwrite an existing configured `.env`. `setup:auth` replaces a placeholder JWT secret with a random secret and seeds the fixed admin. It prints a generated admin password once; save it. Only its salted hash is saved in `.env` and SQLite. You can also supply your own JWT secret:
```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

SQLite is stored in `backend/prisma/dev.db`. `db:deploy` applies the committed migrations without deleting existing users. For future schema changes, run `npm run db:migrate -- --name descriptive_name`. Use `npm run db:studio` to inspect local data. On Windows, stop the backend before regenerating Prisma Client to release its DLL.

### Frontend — http://localhost:5173
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173** in your browser. Use localhost consistently for both frontend and API (do not mix localhost and 127.0.0.1); authentication uses same-site cookies. Vite may select another port if 5173 is occupied; keep `FRONTEND_URL` in the backend environment aligned if you change ports.

## Verify
```sh
cd frontend
npm run build
```
```sh
cd backend
npm test
```
With the backend running, `GET http://localhost:4000/api/health` returns:
```json
{"status":"ok","service":"relive-api","stage":"foundation"}
```

## Structure
```text
frontend/
  src/
    components/     Navbar, Footer, Button, Input, Modal, ListingCard,
                    StatusBadge, EmptyState, LoadingState, ItemArt
    pages/          Marketplace, ListingDetails, Placeholder, Auth,
                    Profile, ForgotPassword, Admin, ListingForm,
                    MyListings, Favourites, Offers, OfferDetails, Wallet,
                    TopUp, TopUpConfirmation, Checkout, PaymentSuccess
    context/        AuthProvider: restores the cookie session on reload
    lib/            API client with credentials and error handling
    App.jsx         React Router routes and shared layout
    styles.css      Responsive styles and pastel design tokens
  .env.example
backend/
  prisma/
    schema.prisma   Users, listings, images, favourites, offers, history,
                    wallet transactions and purchases
    migrations/     Additive migrations; existing accounts are preserved
    seed.js         One fixed ADMIN account
  scripts/          Local auth configuration and SQLite initialization
  src/
    lib/            Prisma, scrypt passwords, JWT, cookies, validation
    middleware/     Authentication and administrator guards
    routes/         Authentication, profiles, listings, favourites, offers,
                    wallet and purchases
    app.js          Express, CORS, local static uploads, health endpoint
    server.js       Database connection and server lifecycle
  uploads/          Local image storage (contents ignored by Git)
  .env.example
```

## Routes
| Page | Route |
| --- | --- |
| Home / Marketplace | `/`, `/marketplace` |
| Listing Details | `/listing/:id` |
| Edit Listing | `/listing/:id/edit` |
| Sell Item | `/sell` |
| My Listings | `/my-listings` |
| My Offers | `/my-offers` (redirects to Offers Made) |
| Offers Made | `/my-offers/made` |
| Offers Received | `/my-offers/received` |
| Offer Details | `/offers/:id` |
| Favourites | `/favourites` |
| Wallet | `/wallet` |
| My Purchases / My Sales | `/my-purchases`, `/my-sales` |
| Transaction Details & Review | `/transactions/:id` |
| Public User Profile | `/users/:id` |
| Mock Top Up | `/wallet/top-up` |
| Confirm Top Up | `/wallet/top-up/:id` |
| Top-up Success | `/wallet/top-up/:id/success` |
| Confirm Purchase | `/checkout/:listingId` (accepted offer adds `?offer=:offerId`) |
| Purchase Receipt / Success | `/purchases/:id`, `/purchases/:id/success` |
| Profile | `/profile` |
| Login / Register | `/login`, `/register` |
| Forgot password (mock) | `/forgot-password` |
| Admin | `/admin` |

## Scope
- Marketplace uses SQLite listings. Only ACTIVE listings are public, with title search, category/condition/location/price filters, sorting, and 12 results per page. Filter state is saved in the page URL.
- Registration, login, logout, session restoration, profile editing and local profile image uploads work.
- Sell, My Listings, My Offers, Favourites, Wallet and Profile require login. Any normal account may buy and sell; no separate buyer/seller role exists. Admin requires a database ADMIN role.
- JWT is stored in an HttpOnly, SameSite=Strict cookie; no tokens are stored in browser localStorage. Passwords use salted Node.js scrypt hashes. Logout increments a session version, revoking all existing sessions for that account.
- State/federal territory and free-text City / Area represent Malaysian locations. Profile location and phone are optional; listing location is required. Ratings and completed transactions start at zero and cannot be edited through profile requests.
- Profile images are PNG/JPEG/WebP files up to 700 KB, validated by type and signature and stored under randomly generated names in `backend/uploads`. Uploads are public; email and phone are returned only for the authenticated account.
- Forgot password is explicitly a mock acknowledgement: no email, token or password change occurs.
- `VITE_API_URL` configures the frontend API base URL.
- The hero retains its local SVG illustrations. Listing photos are real local uploads. Google Fonts is optional; system sans-serif fallbacks work offline.
- Make Offer starts a real negotiation. Buyers and sellers can take turns accepting, rejecting or countering. Buyers can cancel an open negotiation. Favourites are persisted, and self-favouriting/self-bargaining are blocked by the backend.
- Buy Now and accepted offers use the simulated wallet. The fixed administrator handles reports and listing moderation only, with trading, wallet top-ups and reviewing disabled for this account. There is no chat system, real payment processing, seller withdrawal, external image service or AWS integration.

## Listing management
Create a listing at `/sell`; it becomes ACTIVE immediately. Photos are optional, with a maximum of five PNG/JPEG/WebP files, up to 2 MB each. The first photo is the cover. The server validates count, file type and signature, generates filenames, and stores them in `backend/uploads`. Editing can retain/remove existing images and add replacements; removed listing image files are cleaned up.

Required fields: title (2–120 characters), description (10–5,000), RM price (0–999,999.99, up to two decimals), category, condition, State, and City / Area (2–80 characters). Price is stored as integer sen in SQLite and returned as RM by the API to avoid floating-point storage errors.

Categories: Electronics, Fashion, Home & Living, Sports & Hobbies, Books & Education, Others.

Conditions: Like New, Good, Fair, Well Used.

All statuses are represented: ACTIVE, RESERVED, SOLD, WITHDRAWN, UNDER_REVIEW, NEEDS_REVISION, REMOVED. Only the owner can view non-public listings and manage them. Owner edits are permitted only for ACTIVE and NEEDS_REVISION. Editing NEEDS_REVISION resubmits it as UNDER_REVIEW, so it is not automatically republished. ACTIVE, NEEDS_REVISION and UNDER_REVIEW can be withdrawn. RESERVED and SOLD cannot be withdrawn. Withdrawal is the supported soft-delete operation; it keeps the listing in My Listings and removes it from the marketplace.

Clients cannot assign sellerId/status directly. Edits send the last `updatedAt` value; stale or concurrent changes return 409 instead of overwriting newer changes. Accepting an offer reserves the listing. Other purchase and moderation transitions cannot be set through seller forms.

## Bargaining
A buyer submits an amount on an ACTIVE listing. The seller may accept, reject or counter. A counter passes the turn to the other participant. Only the recipient of the latest amount may accept, reject or counter; the buyer may cancel at any time while the offer is open. The API enforces these rules independently of the displayed buttons.

Multiple buyers can negotiate for one listing, with one open negotiation per buyer/listing pair. A buyer may start a new negotiation after rejection or cancellation if the listing is still ACTIVE. Amounts must be RM 0.01–999,999.99, with up to two decimal places. All amounts are stored as integer sen.

Offer statuses are PENDING, COUNTERED, ACCEPTED, REJECTED, CANCELLED, CLOSED and COMPLETED. A counter from either participant uses COUNTERED; `nextActorId` records whose turn it is. `originalPrice` is a snapshot of the listing price when the offer starts. `currentAmount` tracks the negotiated price. `agreedPrice` is saved only on acceptance. Negotiating never changes the public listing price.

Acceptance by the seller, or by the buyer responding to the seller's counter, runs in one transaction:

1. Mark the chosen offer ACCEPTED and save its agreed price.
2. Mark the listing RESERVED.
3. Close all other PENDING/COUNTERED offers for that listing.
4. Append acceptance and closure events to OfferHistory.

SQLite partial unique indexes also prevent duplicate open negotiations and more than one accepted/completed agreement per listing. They are defined in the offer migration because the Prisma schema cannot represent these conditional indexes. Preserve them in future migrations.

Every offer action appends an ordered history entry with actor, amount, action and timestamp. Closed offers retain their history and closure reason. Listing withdrawal closes its open negotiations too. Accepted offers remain readable by their participants even though the listing is no longer public.

The server sends `allowedActions` for each offer. Responses include a `version`; clients must send it back when acting. Stale or competing requests return 409 instead of overwriting a newer response. Use the Refresh button to load the latest negotiation state.

Acceptance saves the agreement and reservation without taking payment. The buyer can then pay the agreed amount from Offer Details. Successful wallet payment marks the offer COMPLETED and appends a completion event to its timeline.

## Purchase history and reputation

My Purchases and My Sales are available from Wallet and Profile. Each successful payment creates one COMPLETED Transaction in the same database transaction as the balances and receipt. Existing successful purchases are backfilled by the history migration. Price snapshots are stored in sen: `originalPrice` uses the offer's original asking price for negotiated purchases, or the current asking price for Buy Now; `finalPrice` is the amount paid. Payment receipts keep their existing SUCCESS status.

Open a transaction to review the other participant. Buyers can rate sellers and sellers can rate buyers, with one review per participant per transaction. Ratings must be whole numbers from 1 to 5; comments are optional and limited to 1,000 characters. Reviews are final and public. The server derives the recipient, checks completed status and participation, and rejects self-reviews and duplicates. A database unique constraint also prevents concurrent duplicate reviews.

Review creation and reputation recalculation run together atomically. Average rating and total reviews count only reviews from completed transactions. Completed transaction counts include purchases and sales. Listing reports, removal and moderation status never subtract reputation. Profile edits cannot set these reputation fields.

Public profiles display photo, name, State + City/Area, membership date, average stars, review count, completed transaction count and received reviews. They never expose email, phone, wallet balance, receipt details or authentication data. Seller names link to these profiles. Transaction histories and details are participant-only.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/transactions?direction=purchases` | Own purchases; use `direction=sales` for sales |
| GET | `/api/transactions/:id` | Participant-only details, reviews and `canReview` |
| POST | `/api/transactions/:id/reviews` | Authenticated participant; numeric `rating`, optional `comment` |
| GET | `/api/users/:id` | Public profile and received reviews |

## Mock payment flow

All balances and payments are simulated. FPX Online Banking and Touch 'n Go eWallet are local mock choices; they never contact a bank, e-wallet or payment API and require no real credentials. There is no withdrawal feature.

Open `/wallet` to see your current balance, total seller earnings and transaction history. Choose Top Up, enter RM 0.01–999,999.99 and select FPX or TNG. Creating a top-up records it as PENDING without crediting the wallet. The confirmation page can confirm it as SUCCESS or cancel it as CANCELLED. Refreshing or confirming the same payment again cannot add funds twice. Pending payments can be resumed from wallet history.

Buy Now checks out an ACTIVE listing at its current asking price. An accepted offer checks out its RESERVED listing at the saved agreed price, and only its buyer can pay. Checkout displays the server-confirmed price and wallet balance. If funds are insufficient, the top-up flow provides a link back to checkout.

A successful purchase runs in one database transaction:

1. Claim the listing as SOLD and verify sufficient buyer funds.
2. Deduct the buyer's balance and credit the seller's balance.
3. Create a Purchase receipt and matching PURCHASE/SALE wallet entries.
4. Complete the accepted offer, if applicable, and close any remaining open offers.
5. Increment completed transactions for both participants.

Failure rolls back every step. Asking prices are never changed by bargaining or payment. Balances and amounts are stored as integer sen and returned as RM. Wallet transaction amounts are positive; PURCHASE is a debit, while TOP_UP and SALE are credits. Seller earnings sum successful sales independently of the current balance. The maximum wallet balance is RM 21,474,836.47.

The backend derives participants and prices, rejects self-purchases, checks listing status and the confirmed listing timestamp, and restricts receipts to their participants. Unique purchase-per-listing constraints and conditional balance updates prevent duplicate sales and overdrafts. Payment request keys make retries idempotent; reusing a key with different payment details returns 409. A concurrent conflict may return 409; retry the same request or check wallet history for the persisted receipt.

### Payment API

All endpoints below require authentication. Amounts in request bodies are RM. Generate a UUID for each new `requestKey` and reuse it when retrying that same request.

| Method | Endpoint | Body / purpose |
| --- | --- | --- |
| GET | `/api/wallet` | Own balance, seller earnings and transaction history |
| POST | `/api/wallet/top-ups` | `amount`, `method` (`FPX` or `TNG`), `requestKey`; creates PENDING mock payment |
| GET | `/api/wallet/top-ups/:id` | Own top-up status |
| POST | `/api/wallet/top-ups/:id/confirm` | Confirm stored mock payment; no client-supplied amount used |
| POST | `/api/wallet/top-ups/:id/cancel` | Cancel a pending mock payment |
| GET | `/api/purchases/quote?listingId=...&offerId=...` | Current checkout details; `offerId` optional |
| POST | `/api/purchases` | `listingId`, optional `offerId`, `expectedAmount`, `listingUpdatedAt`, `requestKey` |
| GET | `/api/purchases/:id` | Persisted receipt for buyer or seller |

To try it locally, list an item with one account, then sign in with a second account and top up its wallet. Use Buy Now or pay an accepted offer. Wallet history shows the buyer's purchase and the seller's earnings with the same reference. Success pages load the saved payment record rather than trusting a URL alone.

## Offer API
All offer endpoints require authentication. Only the buyer and seller can read a negotiation or its history.

| Method | Endpoint | Body / purpose |
| --- | --- | --- |
| GET | `/api/offers?direction=made` | Own offers as buyer |
| GET | `/api/offers?direction=received` | Own offers as seller |
| POST | `/api/offers` | `listingId`, `amount` in RM |
| GET | `/api/offers/:id` | Details, timeline and allowed actions |
| POST | `/api/offers/:id/actions` | `action`, `version`, and `amount` for a counter |

Actions: `accept`, `reject`, `counter`, `cancel`. Buyer, seller, original price and status are derived by the server, never trusted from the request.

To try the flow locally, create a listing with one account and make an offer from a second account. Use Offers Received to counter as the seller, and Offers Made to respond as the buyer. A second buyer can negotiate independently until one offer is accepted.

Favourites show saved ACTIVE listings only. Seller summaries expose name, photo, location, rating, completed transactions and membership date, never email, phone or password hashes.

## Listing API
| Method | Endpoint | Access / purpose |
| --- | --- | --- |
| GET | `/api/listings` | Public ACTIVE listings |
| GET | `/api/listings/mine` | Authenticated; all own statuses |
| POST | `/api/listings` | Authenticated; create own listing |
| GET | `/api/listings/:id` | Public if ACTIVE; otherwise owner only |
| PATCH | `/api/listings/:id` | Owner; editable status and matching updatedAt required |
| POST | `/api/listings/:id/withdraw` | Owner; withdraw eligible listing |
| GET | `/api/favourites` | Authenticated; saved ACTIVE listings |
| GET | `/api/favourites/:id` | Authenticated; own saved state |
| PUT | `/api/favourites/:id` | Save another seller's ACTIVE listing |
| DELETE | `/api/favourites/:id` | Remove own favourite |

Listing query parameters: `search`, `category`, `condition`, `state`, `city`, `minPrice`, `maxPrice`, `sort` (`newest`, `price_asc`, `price_desc`), `page`. Responses include listings, total, page and pages. Categories and conditions use the display strings above; URL-encode spaces and ampersands.

Create/edit requests contain the listing fields plus an `images` array of image data URLs. Edits may also retain existing image URL strings belonging to that listing. Images from other listings or arbitrary filesystem paths are rejected.

Technical references: [Vite guide](https://vite.dev/guide/), [Prisma v6 schema](https://www.prisma.io/docs/orm/v6/prisma-schema/overview).

## Fixed administrator

### Reports and moderation

Members can report another member's ACTIVE listing from Listing Details. Reasons are Scam / Fraud, Inappropriate Content, Prohibited Item, Misleading Information, Duplicate Listing, and Other. An optional description allows up to 2,000 characters. Self-reports and administrator-submitted reports are blocked. A partial unique index prevents duplicate PENDING/REVIEWING reports from the same member for one listing, including concurrent submissions.

The existing fixed administrator opens `/admin` for Pending Reports, Under Review and Resolved Reports. Opening the detail page is read-only; **Start investigation** explicitly marks reports REVIEWING and hides an ACTIVE listing as UNDER_REVIEW. The detail page includes the full listing and images and a link to the seller's public profile. No user-management or payment-management tools are provided.

- **Request Revision:** listing becomes NEEDS_REVISION; the reason appears in My Listings, Listing Details and the edit form. The seller edits and presses **Resubmit for Review**, changing it to UNDER_REVIEW. Reports stay in the Under Review queue.
- **Approve listing:** an UNDER_REVIEW listing returns to ACTIVE and its reports become ACTION_TAKEN.
- **Dismiss report:** reports become REJECTED and an otherwise valid listing returns to ACTIVE.
- **Remove listing:** listing becomes REMOVED and reports become ACTION_TAKEN. All data and images remain stored.
- **Restore listing:** a removed listing returns to its previous availability. Previously sold, reserved or withdrawn listings retain that state rather than becoming available for another purchase.

Decisions require an admin reason, save `reviewedAt` on resolution, and update all open reports for the listing together. Requests include report `version` and `listingUpdatedAt`; stale decisions return 409. Hiding a listing closes open negotiations with a moderation reason. Existing accepted reservations and completed purchases are preserved. Reserved/sold listings cannot be sent for seller revision. Moderation does not delete listings or alter wallet balances, reviews or reputation.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/reports` | Member; `listingId`, `reason`, optional `description` |
| GET | `/api/admin/reports?group=pending` | Admin; `pending`, `reviewing`, or `resolved`, with dashboard counts |
| GET | `/api/admin/reports/:id` | Admin; report and full listing, including hidden listings |
| POST | `/api/admin/reports/:id/actions` | Admin; `action`, `adminReason`, `version`, `listingUpdatedAt` |

Actions: `investigate`, `dismiss`, `revision`, `remove`, `restore`, `approve`. Reports remain private to the administrator; sellers see the moderation reason without reporter details. Preserve the report partial unique index in future migrations.

### Account setup
Default email: `admin@relive.local`. There is no hard-coded default password.

`npm run setup:auth` creates the fixed account with ID `relive-fixed-admin`. It preserves an existing hash and refuses to turn an existing regular account into an admin. Re-running seed updates the same account and invalidates its previous sessions.

For custom credentials, set `ADMIN_EMAIL`, `ADMIN_NAME`, and a strong `ADMIN_PASSWORD` (10–128 characters) in your process environment and run `npm run db:seed`. Alternatively supply `ADMIN_PASSWORD_HASH` in the scrypt format, which takes precedence. Do not commit passwords or `.env`. The convenience `setup:auth` command converts an `ADMIN_PASSWORD` in the local env file into a hash and clears the plaintext value. To rotate using that command, enter a new password in the ignored env file, run it, then restart the server.

The registration endpoint always creates USER accounts, rejects submitted roles, and reserves the configured admin email. Rating, transaction count, role, ID and password hash cannot be changed by profile edits.

## Authentication API
| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public; name, email, password |
| POST | `/api/auth/login` | Public; email, password |
| POST | `/api/auth/forgot-password` | Public; email; mock only |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/logout` | Authenticated |
| PATCH | `/api/profile` | Authenticated; name, email, phone, state, city |
| PUT | `/api/profile/image` | Authenticated; image data URL |
| GET | `/api/auth/admin` | ADMIN only |

Browser requests include credentials. Mutating requests from foreign origins are rejected. Public authentication endpoints are limited to 30 attempts per IP per 15 minutes in memory. API responses never expose password hashes or JWTs. Bearer tokens are also accepted for API clients.

`npm test` uses isolated temporary SQLite databases to check authentication, listing CRUD, image validation, filters, favourites, offer authorization, turn-taking, timelines, cancellation/rejection, stale requests, concurrent acceptance, mock top-ups, payment ownership, insufficient funds, receipt access, duplicate payments, competing buyers and wallet limits. It does not alter the development database.

## Code formatting
Both frontend and backend use the shared Prettier configuration: two spaces, readable line wrapping and consistent quotes. Run `npm run format` to format that project's source, or `npm run format:check` to verify it.

Keep components and helpers focused. Shared galleries, seller summaries, photo pickers and file readers live outside page components. Offer cards, actions, navigation and timeline are separate components. Add blank lines between logical sections and use comments to explain non-obvious rules.

## Dependency audit
At setup, npm reported four high-severity advisories in the Prisma CLI dependency tree (Prisma, @prisma/config, effect, and deepmerge-ts). They concern development/database tooling. The generated client uses a matching pinned Prisma version; review upstream fixes before extending this scaffold for deployment. Frontend installation reported no vulnerabilities.
