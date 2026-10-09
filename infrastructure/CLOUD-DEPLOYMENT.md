# Deploy the first reLIVE cloud backend

This stage implements registration/login/logout, profiles, public seller profiles, listing CRUD and private S3 images, plus favourites. Offers, purchases, wallet, reviews, moderation, dashboard and stream-triggered notifications are not migrated. Their API routes return 501 rather than accessing SQLite. This is not the final assignment submission.

## 1 Install dependencies

From the project root, run:

```bash
cd backend
npm install
cd ../infrastructure
npm install
aws sts get-caller-identity
```

Verify account 615663614353. Keep using the profile that worked for your earlier setup. Refresh expired temporary credentials outside the repository.

## 2 Provision users

```bash
npm run db:migrate
```

This creates relive-users and enables PITR. User profiles use USER#id / PROFILE. A separate EMAIL#normalised-email / UNIQUE item is written atomically with registration to prevent duplicate emails. Favourites use USER#id / FAV#listingId. Existing local accounts are not copied: register new demo accounts after deployment.

## 3 Package and deploy Lambda

Use the exact origin from your S3 Properties website endpoint, without a trailing slash. For the current website:

```bash
export FRONTEND_ORIGIN=http://relive-web-cloudproject.s3-website-us-east-1.amazonaws.com
node package-backend.js
node deploy-backend.js --apply
```

The script uses LabRole by default, creates/updates relive-api, preserves its existing JWT secret, and configures POST CORS on the private images bucket. It does not change bucket public access. If your permitted execution role differs, set LAMBDA_ROLE_ARN to its actual ARN. The role needs DynamoDB read/write/Query/transactions on both tables and listing indexes; S3 GetObject and PutObject on pending/ and media/ image keys; and CloudWatch log permissions. The caller needs Lambda deployment, PassRole, and bucket CORS permissions. Do not add unrestricted IAM policies to work around a lab denial; report the exact denied action.

The ZIP contains bundled JavaScript only, with no local environment files, credentials or SQLite database. Handler: index.handler. Runtime: Node.js 22. Deployment uses direct ZIP upload; no public source-code bucket is needed.

## 4 Deploy the REST API

```bash
node deploy-api.js --apply
```

This creates/reuses the uniquely named relive-api REST API, configures Lambda proxy routes and invocation permission, deploys stage v1, and sets stage throttling to rate 5/burst 10. It writes frontend/.env.production.local with the API URL and cloud mode. Review/save an existing file before running if you have custom settings there. Existing API method security settings are preserved on reruns. First creation uses backend JWT validation, not an API Gateway authorizer. API keys and usage plans are still to be added before assignment completion.

Open the printed /health URL. It should report storage dynamodb and stage auth-listings. If it fails, inspect /aws/lambda/relive-api in CloudWatch. A working health response alone does not verify DynamoDB permissions.

## 5 Build and publish the frontend

```bash
cd ../frontend
npm run build
aws s3 sync dist/ s3://relive-web-cloudproject/ --region us-east-1
```

Refresh the S3 website. Use browser Network tools to confirm requests go to execute-api, not localhost. Do not upload .env files. Cloud mode uses bearer tokens and omits cookies. Existing local mode keeps its original API routes and cookies. The demo API key, when added later as VITE_API_KEY, is client-visible and must not replace JWT authorisation.

## 6 Verify the first stage

1. Register two test users with different emails. Duplicate registration must fail.
2. Log in as seller and publish a listing, including an image.
3. Verify its item in relive-listings and files in the private images bucket.
4. Browse/search/filter, view the detail page and edit its price. Prices are stored in sen and returned in RM.
5. Log in as the other user; saving favourites should work, modifying the seller's listing must fail.
6. As the seller, withdraw the listing. The UI uses DELETE in cloud mode; it is a soft deletion to WITHDRAWN, retaining records for future history support. Confirm statusPK changes too and the listing disappears from public browsing after index propagation.
7. Log out; old tokens must fail. Capture terminal, browser, DynamoDB and CloudWatch evidence.

Images upload through short-lived presigned POSTs with type/size conditions. The API validates image signatures then copies images to fresh permanent keys. Existing image references can only be retained by their listing owner. Pending and orphaned files currently need periodic cleanup; no automatic destructive cleanup is deployed. Signed viewing URLs expire after one hour; refresh the page to renew them.

Listing queries follow GSI pagination, then filter/sort for the existing numbered-page UI, capped at 5000 candidates. This is intended for a small coursework dataset; a larger marketplace needs redesigned cursor pagination/search. GSIs are eventually consistent. Local mock-store tests do not replace AWS smoke testing, IAM verification, or concurrent DynamoDB integration tests.

## Remaining migration

Implement offers and atomic financial transactions with their concurrency tests, administrator provisioning/moderation, reviews/dashboard, stream consumer and idempotency, usage plan/API key enforcement, monitoring/tracing configuration, backup recovery demonstration, export files, report and video. Do not describe the whole application as migrated yet.


## Five-service deployment

Packaging now produces dist/relive-auth.zip, relive-users.zip, relive-listings.zip, relive-favourites.zip and relive-images.zip. Each has index.handler and only its own route module. Shared middleware, store and image helpers are bundled as needed. Original SQLite routes remain untouched.

Deployment requires explicit --apply. Run package-backend.js locally first, then (only after approving AWS changes) deploy-backend.js --apply, followed by deploy-api.js --apply. Backend deployment creates/updates the five functions. It preserves the auth Lambda JWT secret, or adopts the legacy relive-api secret on first migration, across all five functions. Existing tokens continue working. The same permitted lab role is reused; production deployments should use service-specific least-privilege roles.

The existing REST API/stage and frontend URL are retained. Explicit routes map to their service according to services.js; /api/profile/image belongs to users, while /api/uploads belongs to images. OPTIONS is routed to the same service. Existing method authorization/key settings are preserved. No frontend rebuild is needed if the API URL is unchanged. The existing greedy fallback and relive-api Lambda are retained, not deleted. Incomplete features remain incomplete. Deployment is sequential, not atomic; if a step fails, fix it and rerun before API cutover. Verify all five functions and route flows in AWS after cutover.
