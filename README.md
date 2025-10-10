# Clean Food App

A Vite + React application that helps users scan ingredient labels, analyse them against clean-eating heuristics, and keep personalised history based on dietary preferences and allergy settings. The project also ships with Supabase edge functions used to persist preferences, analysis history, and general feedback.

## Project Structure

```text
Clean_Food_App_Revamped/
├── backend/                 # Python utility script (legacy/local usage)
├── public/                  # Static assets (hero image, etc.)
├── src/
│   ├── components/          # React UI + business logic
│   ├── data/                # Static datasets (avoid list)
│   ├── supabase/            # Edge functions & helpers
│   ├── utils/               # Supabase client config, helpers
│   └── main.tsx             # App entry point
├── package.json
├── README.md (this file)
└── vite.config.ts
```

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase CLI (`brew install supabase/tap/supabase`)
- Supabase project (original ref: `gwhicrjjkfapshqmlxfh`)

## Environment Variables

Create `.env` (or `.env.local`) with:

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Install & Develop

```bash
npm install
npm run dev
```

## Build & Preview

```bash
npm run build
npm run preview
```

## Supabase Edge Function

Edge function source: `src/supabase/functions/server/index.tsx`

Deploy:
```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy make-server-5111eaf7
```

Set required secrets (service role key, OFF credentials) via `supabase secrets set`.

## Frontend Deployment

1. Connect this repo to your hosting platform (Vercel/Netlify/etc.).
2. Build command: `npm run build`
3. Output directory: `build`
4. Configure the same Supabase environment variables in the host.

## Data & Feedback

- Auth users: Supabase Dashboard → Authentication → Users
- Feedback submissions: Supabase table `kv_store_5111eaf7` (keys prefixed `feedback_general_`)

## Legacy Python Script

`backend/server.py` contains the original Python analyser used during prototyping. It’s kept for reference/local experimentation and isn’t required in production.

Design reference: https://www.figma.com/design/d9vl9LjHRJNjYmBuuPyhbp/Clean-Food-App
