# EcoWatch backend

Node.js and Express API for the EcoWatch frontend (`index.html`, `styles.css`, `app.js`).
It stores data in a JSON file, signs admins in with a locality and PIN, and keeps each admin
inside their own locality.

## Quick start

```bash
cd backend
npm install
cp .env.example .env     # optional in development
npm run dev              # or: npm start
```

Put the three frontend files in a `frontend/` folder next to `backend/` (or set `FRONTEND_DIR`).
The server then serves them at http://localhost:3000 and the API at `/api`.

Development defaults: PIN `1234` for every locality, demo complaints seeded, temporary JWT secret.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `JWT_SECRET` | Signs admin tokens. **Required in production** |
| `JWT_TTL` | Token lifetime (default `8h`) |
| `ADMIN_DEFAULT_PIN` | PIN given to each locality admin when the database is first created. **Required in production** |
| `CORS_ORIGIN` | Comma-separated origins allowed to call the API from another site |
| `FRONTEND_DIR` | Folder with the static frontend |
| `DATA_FILE` | Path of the JSON database (default `backend/data/db.json`) |
| `SEED_DEMO_DATA` | `true` or `false`. Default: true in development, false in production |
| `TRUST_PROXY` | Set behind a reverse proxy, e.g. `1` |

Change one admin's PIN afterwards with `npm run set-pin -- "Downtown" 5678`.

## API

Errors always look like `{ "error": { "message": "...", "fields": { ... } } }`.

### Public

| Method and path | Description |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/meta` | Categories, localities, statuses, severities |
| `GET /api/complaints` | List. Query: `category`, `locality`, `status`, `q`, `sort=votes\|new`, `page`, `limit` (max 100). Returns `{ items, total, page, limit }` |
| `GET /api/complaints/:id` | One complaint |
| `POST /api/complaints` | Create. Body: `title, category, locality, severity, description, reporter, lat, lng` |
| `POST /api/complaints/:id/vote` | Toggle your upvote. Needs header `X-Voter-Id` |

Send `X-Voter-Id` on list requests too, so each item comes back with `voted: true/false`.
Generate it once in the browser and keep it in `localStorage`:

```js
const voterId = localStorage.getItem('ecowatch.voterId') ||
  (localStorage.setItem('ecowatch.voterId', crypto.randomUUID()), localStorage.getItem('ecowatch.voterId'));
```

### Admin

| Method and path | Description |
| --- | --- |
| `POST /api/auth/login` | Body `{ locality, pin }`. Returns `{ token, locality, expiresIn }` |
| `GET /api/admin/complaints` | Complaints in the admin's locality. Optional `status` |
| `GET /api/admin/stats` | Counts for the admin's locality |
| `PATCH /api/admin/complaints/:id` | Body `{ status?, note? }`. Returns 403 for another locality |

Send the token as `Authorization: Bearer <token>`.

## Example

```bash
curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"locality":"Riverside","pin":"1234"}'
```

## Connecting the existing frontend

`app.js` currently reads and writes `localStorage`. To use this API, replace those calls:

| Frontend action | API call |
| --- | --- |
| Load feed, map | `GET /api/complaints` |
| Submit the report form | `POST /api/complaints` |
| Upvote | `POST /api/complaints/:id/vote` |
| Admin sign in | `POST /api/auth/login`, keep the token in memory or `sessionStorage` |
| Admin list and stats | `GET /api/admin/complaints`, `GET /api/admin/stats` |
| Admin save | `PATCH /api/admin/complaints/:id` |

## Security notes

- PINs are hashed with scrypt, tokens are HS256 JWTs, and login is rate limited.
- Complaint creation, voting and login each have their own rate limits.
- Input is validated and length-limited on the server. The frontend must still escape text when rendering (it does).
- Run behind HTTPS in production. Admin PINs are short, so use long random ones and rotate them.
- The JSON file store suits demos and small sites. For real traffic, replace `src/db.js` with a database.
