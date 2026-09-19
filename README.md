# reLIVE
**Give it another life.**

A localhost second-hand marketplace with a clean pastel interface, account authentication, profiles, real listings, search and filters, seller management, favourites, and price negotiations.

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
                    MyListings, Favourites, Offers, OfferDetails
    context/        AuthProvider: restores the cookie session on reload
    lib/            API client with credentials and error handling
    App.jsx         React Router routes and shared layout
    styles.css      Responsive styles and pastel design tokens
  .env.example
backend/
  prisma/
    schema.prisma   Users, listings, images, favourites, offers and history
    migrations/     Additive migrations; existing accounts are preserved
    seed.js         One fixed ADMIN account
  scripts/          Local auth configuration and SQLite initialization
  src/
    lib/            Prisma, scrypt passwords, JWT, cookies, validation
    middleware/     Authentication and administrator guards
    routes/         Authentication, profiles, listings, favourites and offers
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
- Buy Now, Wallet and admin management tools remain placeholders. There is no chat system, payment processing, external image service or AWS integration.

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

COMPLETED is reserved for a future transaction-completion workflow. Acceptance saves the agreement and reservation; it does not take payment or mark a transaction completed.

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

`npm test` uses isolated temporary SQLite databases to check authentication, listing CRUD, image validation, filters, favourites, offer authorization, turn-taking, timelines, cancellation/rejection, stale requests and concurrent acceptance. It does not alter the development database.

## Code formatting
Both frontend and backend use the shared Prettier configuration: two spaces, readable line wrapping and consistent quotes. Run `npm run format` to format that project's source, or `npm run format:check` to verify it.

Keep components and helpers focused. Shared galleries, seller summaries, photo pickers and file readers live outside page components. Offer cards, actions, navigation and timeline are separate components. Add blank lines between logical sections and use comments to explain non-obvious rules.

## Dependency audit
At setup, npm reported four high-severity advisories in the Prisma CLI dependency tree (Prisma, @prisma/config, effect, and deepmerge-ts). They concern development/database tooling. The generated client uses a matching pinned Prisma version; review upstream fixes before extending this scaffold for deployment. Frontend installation reported no vulnerabilities.
