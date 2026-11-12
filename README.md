# SAN3TY — Smart Home Services Platform

A responsive Arabic RTL website concept for SAN3TY, a smart home-maintenance platform for Egypt. The frontend is deployed as a static website, and the AI chat runs through a protected Vercel Function.

## Files

- `index.html` — Arabic RTL website and chat interface
- `styles.css` — blue/yellow visual system, responsive layouts, and motion
- `script.js` — accessible navigation, scroll effects, chat UI, image compression, and API requests
- `api/chat.js` — secure server-side OpenAI Responses API endpoint
- `vercel.json` — Vercel Function configuration

## Run the static site locally

Open `index.html` in a browser to review the visual site. The AI endpoint will not run from a plain file or GitHub Pages.

## Deploy with Vercel to enable the AI chat

1. Sign in to Vercel and import the GitHub repository `dssvbvdsnn-eng/san3ty-website`.
2. Keep the project at the repository root. No frontend build command is required.
3. In Vercel, open **Project → Settings → Environment Variables**.
4. Add `OPENAI_API_KEY` with your secret API key from [OpenAI API Keys](https://platform.openai.com/api-keys).
5. Optionally add `OPENAI_MODEL` with the value `gpt-4.1-mini`. If omitted, the function uses that default.
6. Redeploy the project. Use the Vercel deployment URL for the live AI-enabled website.

**Never put your API key in HTML, CSS, JavaScript, a committed .env file, or a public GitHub secret-free example.** The key is read only by the server-side function from Vercel Environment Variables.

## AI behavior and safety

The chat uses the OpenAI Responses API. It answers in Egyptian Arabic, helps classify home-maintenance issues, can receive an optional compressed image, and avoids inventing technicians, ratings, prices, appointment availability, or confirmed diagnoses. Dangerous electrical issues are directed to a qualified technician.

The chat endpoint accepts only POST requests, limits conversation length, and does not store Responses API conversations (`store: false`). The website resizes and compresses user images in the browser before sending them to the protected endpoint.

## Important billing note

OpenAI API usage is billed separately from a ChatGPT subscription. Add API billing/credits in the OpenAI API Platform before expecting paid API requests to work. Review current model pricing before public launch.

## Hosting note

GitHub Pages can continue hosting the static showcase, but it cannot execute the `/api/chat` backend. To use the ChatGPT-powered assistant, use the Vercel deployment URL (or deploy the backend to another serverless host and point the frontend to it).
