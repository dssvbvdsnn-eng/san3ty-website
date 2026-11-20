# SAN3TY — Smart Home Services Platform

SAN3TY connects customers with suitable, verified home-maintenance craftsmen in Egypt. The chatbot understands the issue, identifies the trade, asks for a neighborhood when needed, and searches a D1 directory to return up to five ranked matches.

## Architecture

- `public/` — website HTML, CSS, and browser JavaScript.
- `src/index.js` — Cloudflare Worker entrypoint. It serves static assets and routes `/api/chat`.
- `functions/api/chat.js` — chatbot classification and verified-craftsman matching logic.
- `database/schema.sql` — Cloudflare D1 schema for craftsmen and service areas.
- `wrangler.jsonc` — Worker, static-assets, and Workers AI configuration.

This project is configured for **Cloudflare Workers Builds**, not Cloudflare Pages. Keep the deploy command as `npx wrangler deploy`. No custom build command is required.

## Deploy the project

1. In Cloudflare Dashboard, open **Workers & Pages**.
2. Connect this GitHub repository as a **Worker** using Workers Builds.
3. Keep the deploy command as `npx wrangler deploy`.
4. The `wrangler.jsonc` file tells Wrangler to serve assets from `public/`, route `/api/*` through the Worker, and create the Workers AI binding named `AI`.
5. Pushes to `main` trigger new deployments.

The earlier build error is fixed by moving the frontend into `public/` and adding a Worker entrypoint. The Worker now serves both the website and the chatbot API.

## Create and connect the D1 database

The Worker expects a D1 binding named `DB`. Create the database in Cloudflare, then add its exact ID to `wrangler.jsonc` before redeploying.

1. In Cloudflare Dashboard, open **Storage & databases → D1 SQL Database**.
2. Create a database named `san3ty-db`.
3. Copy its database ID from the details page.
4. Add this object to the top-level `d1_databases` array in `wrangler.jsonc` (replace the ID with the one from your account):

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "san3ty-db",
    "database_id": "PASTE_YOUR_DATABASE_ID_HERE"
  }
]
```

5. Commit the updated file and let Workers Builds deploy it.
6. Open the D1 SQL Console and run the full contents of `database/schema.sql`.

Do not put account passwords or API tokens in this repository. A D1 database ID is a resource identifier, not a password, but use the ID from your own Cloudflare account.

## Add real craftsmen

The database starts empty on purpose. Add real craftsmen only after verifying identity, trade, service area, rating evidence, and permission to publish contact details.

Each record needs:
- a unique ID;
- name, supported trade code, governorate, and district;
- real rating and review totals, if available;
- completed-jobs count and availability only when verified;
- optional phone and WhatsApp numbers;
- `is_verified = 1` only after verification;
- one or more real service-area records.

Supported trade codes: `plumbing`, `electrical`, `air_conditioning`, `carpentry`, `painting`, `appliance_repair`, `water_heater`, and `general_maintenance`.

The matching endpoint filters to active, verified craftsmen in the right trade and matching district/service area/governorate, then ranks them using location fit, rating, review count, completed jobs, and availability. It returns at most five results. It never fabricates names or contact details.


## Demo data and end-to-end testing

The repository includes a synthetic test dataset:

- `database/demo_artisans.csv` — 29 fictional artisan profiles for review/import.
- `database/seed_demo_artisans.sql` — compact multi-row SQL seed script.
- `database/seed_demo_artisans_d1_console.sql` — D1 Console-friendly version with one INSERT statement per row (recommended if the compact script gives a syntax error).
- All profile names, ratings, reviews, completed jobs, and availability values are fabricated for testing.
- Phone and WhatsApp fields are deliberately blank. Do not use demo data as a real directory.
- Demo bios are marked with `بيانات تجريبية غير حقيقية`; the chatbot and UI display a **demo data** badge instead of claiming these are real verified craftsmen.

### Load the demo dataset

1. Open **D1 → san3ty-db → Console**.
2. Open `database/seed_demo_artisans_d1_console.sql` in GitHub.
3. Copy the entire file. Its first SQL statement begins with `INSERT OR REPLACE INTO artisans`; do not copy a partial block of values or any Markdown code fences.
4. Paste it into the D1 Console and click Execute. It contains one SQL statement per row, followed by a verification SELECT.
4. Click **Execute**. It is safe to re-run to refresh the same `DEMO-SAN3TY-*` records.
5. The final SELECT should show `29` demo profiles. Do not import the CSV into the artisans table as-is; it has a combined `service_areas` column, while the seed SQL fills both database tables correctly.

### Check the live bindings

Open `/api/health` on the deployed Worker URL. It returns whether the AI and D1 bindings are present, whether the database query succeeded, and the total/demo profile counts. It does not return contact details.

Expected after seeding:
- `aiBound: true`
- `dbBound: true`
- `dbConnected: true`
- `artisanCount: 29` if the D1 database contains only demo records, or higher if real records are also present
- `demoCount: 29`

### Test the chatbot

Go to the demo chatbot on the website. Fill the location box and send one of these tests:

| Area | Message | Expected trade |
|---|---|---|
| مدينة نصر، القاهرة | فيه تسريب مياه تحت حوض المطبخ ومحتاج سباك | `plumbing` |
| مدينة نصر، القاهرة | مفتاح الكهرباء بيفصل كل شوية ومحتاج كهربائي | `electrical` |
| فيصل، الجيزة | التكييف مش بيبرد وفيه صوت عالي | `air_conditioning` |
| الدقي، الجيزة | باب الدولاب مش بيقفل كويس ومحتاج نجار | `carpentry` |
| مدينة 6 أكتوبر، الجيزة | فيه تسريب مياه تحت الحوض ومحتاج سباك | `plumbing`, expected no matching demo records |

The first four should return up to five demo profiles from the matching groups. The last should return no matches. These tests verify classification, region filtering, database queries, ranking, and the no-results behavior.

### Remove the demo dataset after testing

The bottom of `database/seed_demo_artisans.sql` includes two commented cleanup statements. Run them only when you intentionally want to remove demo records:
```sql
DELETE FROM artisan_service_areas WHERE artisan_id LIKE 'DEMO-SAN3TY-%';
DELETE FROM artisans WHERE id LIKE 'DEMO-SAN3TY-%';
```

This cleanup targets only IDs prefixed with `DEMO-SAN3TY-`.

## AI service and free-tier limits

The Worker uses Cloudflare Workers AI with `@cf/google/gemma-4-26b-a4b-it` through the binding `AI`. No OpenAI API key is required. The free allocation is limited and can change; it is not unlimited.

## Test

- Visit the Worker's `workers.dev` URL to open the website.
- Send a POST request to `/api/chat` with JSON containing `messages` and optionally `area`.
- Missing AI binding returns `ai_binding_missing`.
- Missing D1 binding means the assistant can classify issues but cannot return database-backed craftspeople.
- If there are no verified matching craftsmen, the assistant says so rather than inventing recommendations.

## Safety

The assistant does not provide a confirmed diagnosis or guarantee availability or booking. For electrical sparks, burning smells, or exposed wires, it advises users to stay away and contact a qualified electrician. For severe water leaks, it may advise shutting off the main valve only when safe.

Never put passwords, API tokens, or secrets in frontend files or the public repository.
