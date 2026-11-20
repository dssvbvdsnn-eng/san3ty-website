# SAN3TY — Smart Home Services Platform

SAN3TY connects people who need home maintenance with suitable, verified craftsmen in Egypt. The chatbot understands the problem, identifies the trade, asks for the neighborhood when needed, and searches a real D1 directory to return up to five ranked matches.

## What changed

- Rebuilt the chatbot around Cloudflare Workers AI (Gemma 4) instead of the paid OpenAI API.
- Added a Cloudflare Pages Function at `functions/api/chat.js`.
- Added a real database schema in `database/schema.sql`.
- Added ranked matching based on service-area fit, ratings, review count, completed jobs, and availability.
- The assistant never fabricates craftsmen, phone numbers, ratings, prices, or appointment availability.
- Removed the old OpenAI/Vercel-only chat endpoint. GitHub Pages can serve the static site but cannot run the chatbot backend.

## Free setup: Cloudflare Pages + Workers AI + D1

Cloudflare currently includes a free Workers AI allocation of 10,000 Neurons per day. This is a limited daily quota, not unlimited usage. Model access and quotas can change; check Cloudflare's current pricing before launch.

### 1. Deploy the site

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Create a **Pages** project and connect the GitHub repository `dssvbvdsnn-eng/san3ty-website`.
3. Set the production branch to `main`.
4. For this plain static site, use no build command and set the build output directory to `.` (the repository root).
5. Deploy the project. The `functions/api/chat.js` file is automatically deployed as the `/api/chat` endpoint.

### 2. Connect the free AI model

1. Open the Pages project in Cloudflare.
2. Go to **Settings → Bindings → Add → Workers AI**.
3. Add a binding named exactly `AI`.
4. Save and redeploy if Cloudflare asks.

The function uses `@cf/google/gemma-4-26b-a4b-it`. No OpenAI key and no API key in browser code are required.

### 3. Create and connect the craftspeople database

1. In Cloudflare, open **Workers & Pages → D1 SQL Database** and create a database, for example `san3ty-db`.
2. Open the database's SQL console.
3. Copy and run the complete contents of `database/schema.sql`.
4. Open the Pages project **Settings → Bindings → Add → D1 database**.
5. Add a binding named exactly `DB` and select the database you created.
6. Redeploy the Pages project.

### 4. Add real craftsmen

The database starts empty intentionally. Add real people only after checking their identity, craft, service area, rating/review evidence, and permission to publish their contact details.

Each record needs:
- a unique `id` (for example, a UUID);
- `name`, `trade`, `governorate`, and `district`;
- rating and review totals only when supported by actual reviews;
- completed jobs and current availability only when verified;
- optional phone and WhatsApp numbers (store WhatsApp with Egypt's international country code, e.g. `20...`, without the leading plus sign);
- `is_verified = 1` only after your team completes verification;
- one or more rows in `artisan_service_areas` for areas they really serve.

Example SQL shape (replace every placeholder with real verified data before running):

```sql
INSERT INTO artisans (
  id, name, trade, governorate, district, rating, reviews_count,
  completed_jobs, availability, bio, phone, whatsapp, is_verified
) VALUES (
  'REPLACE_WITH_UNIQUE_ID', 'REAL_CRAFTSMAN_NAME', 'plumbing',
  'القاهرة', 'مدينة نصر', 4.7, 18, 32, 'available',
  'وصف حقيقي مختصر', 'REAL_PHONE', 'REAL_WHATSAPP', 1
);

INSERT INTO artisan_service_areas (artisan_id, area_name)
VALUES ('REPLACE_WITH_UNIQUE_ID', 'مدينة نصر');
```

Do not leave the example placeholder values in production. The matching service returns only active, verified records that match the requested trade and area/governorate.

## How the matching score works

The system first filters to the correct trade and verified, active records. It then ranks eligible records using:
- service-area / district match (strongest location signal);
- same-governorate match when exact district service coverage is not recorded;
- customer rating;
- number of reviews;
- completed jobs;
- availability status.

The chatbot returns at most five results. If the database has no verified matches, it says so instead of inventing results. Availability and booking are not guaranteed until the customer confirms directly with the craftsman.

## Local development and limitations

- Open `index.html` to inspect the static design, but the live `/api/chat` endpoint only works after deploying to Cloudflare Pages with both bindings configured.
- To test Cloudflare Pages Functions locally, use Wrangler and configure local AI/D1 bindings as described in Cloudflare's current documentation.
- The AI daily free quota is limited. When the quota is exhausted, requests may fail until the quota resets.
- GitHub Pages is static hosting only. Use the Cloudflare Pages URL for the working chatbot.
- Do not put provider secrets, private user data, or payment credentials in frontend files or the public repository.

## Safety

For electrical sparks, burning smells, or exposed wiring, the assistant warns users not to touch wires or attempt repairs and to contact a qualified electrician. For severe water leaks, it may advise closing the main water valve only when safe. The bot does not make a confirmed diagnosis or promise a booking.
