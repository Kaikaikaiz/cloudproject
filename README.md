# reLIVE
**Give it another life.**

A localhost second-hand marketplace with a clean pastel interface, working account authentication and profiles, sample listings, and placeholders for upcoming marketplace features.

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
    data/           Static sample listings (no API connection)
    pages/          Marketplace, ListingDetails, Placeholder, Auth,
                    Profile, ForgotPassword, Admin
    context/        AuthProvider: restores the cookie session on reload
    lib/            API client with credentials and error handling
    App.jsx         React Router routes and shared layout
    styles.css      Responsive styles and pastel design tokens
  .env.example
backend/
  prisma/
    schema.prisma   SQLite + User profile, role and session version
    migrations/     Initial schema and additive authentication migration
    seed.js         One fixed ADMIN account
  scripts/          Local auth configuration and SQLite initialization
  src/
    lib/            Prisma, scrypt passwords, JWT, cookies, validation
    middleware/     Authentication and administrator guards
    routes/         Authentication and profile endpoints
    app.js          Express, CORS, local static uploads, health endpoint
    server.js       Database connection and server lifecycle
  uploads/          Local image storage (contents ignored by Git)
  .env.example
```

## Routes
| Page | Route |
| --- | --- |
| Home / Marketplace | `/`, `/marketplace` |
| Listing Details | `/listing/:id` (sample IDs 1–4) |
| Sell Item | `/sell` |
| My Listings | `/my-listings` |
| My Offers | `/my-offers` |
| Favourites | `/favourites` |
| Wallet | `/wallet` |
| Profile | `/profile` |
| Login / Register | `/login`, `/register` |
| Forgot password (mock) | `/forgot-password` |
| Admin | `/admin` |

## Scope
- Sample listing cards navigate to preview detail pages. Category tiles are visual previews, not working filters.
- Registration, login, logout, session restoration, profile editing and local profile image uploads work.
- Sell, My Listings, My Offers, Favourites, Wallet and Profile require login. Admin requires a database ADMIN role, with a protected API check. Marketplace management tools remain placeholders.
- JWT is stored in an HttpOnly, SameSite=Strict cookie; no tokens are stored in browser localStorage. Passwords use salted Node.js scrypt hashes. Logout increments a session version, revoking all existing sessions for that account.
- State/federal territory and free-text City / Area represent Malaysian locations. Location and phone are optional. Ratings and completed transactions start at zero and cannot be edited through profile requests.
- Profile images are PNG/JPEG/WebP files up to 700 KB, validated by type and signature and stored under randomly generated names in `backend/uploads`. Uploads are public; email and phone are returned only for the authenticated account.
- Forgot password is explicitly a mock acknowledgement: no email, token or password change occurs.
- `VITE_API_URL` configures the frontend API base URL.
- All product illustrations are local SVG React components. Google Fonts is optional; system sans-serif fallbacks work offline.
- No payments, live marketplace data, external image services, or AWS integrations.

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

`npm test` uses a separate temporary SQLite database to check registration validation, duplicate emails, password hashing, login failures, profile persistence, image upload validation, access control, expired tokens, logout revocation, and idempotent admin seeding. It does not alter the development database.

## Dependency audit
At setup, npm reported four high-severity advisories in the Prisma CLI dependency tree (Prisma, @prisma/config, effect, and deepmerge-ts). They concern development/database tooling. The generated client uses a matching pinned Prisma version; review upstream fixes before extending this scaffold for deployment. Frontend installation reported no vulnerabilities.
