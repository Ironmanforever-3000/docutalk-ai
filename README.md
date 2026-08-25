# DocuTalk AI — Local Setup Notes

This file explains environment variables and secret handling for local development.

1) Do not commit secrets
- Never commit real API keys or service secrets to git. Use `.env.local` or your platform's secret manager.
- This repo includes `project/.env.example` with empty placeholders — copy it to `project/.env.local` and fill values.

2) Required variables
- `VITE_SUPABASE_URL` — your Supabase project URL (https://<id>.supabase.co)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key for client usage
- `VITE_OPENAI_API_KEY` — OpenAI API key (embeddings + optional generation)
- `VITE_GROQ_API_KEY` — Groq API key (if using Groq provider)
- `VITE_ANTHROPIC_API_KEY` — Anthropic key (optional)

3) Rotate & revoke exposed keys
- If a key was ever committed or shared, rotate/revoke it from the provider dashboard immediately.
- To remove secrets from git history, use a history rewrite tool (e.g., `git filter-repo`) and coordinate with collaborators.

4) Deployment
- Add the same env vars to your hosting provider (Vercel/Netlify) via their environment variable settings — do not upload `.env`.

The `.gitignore` excludes `.env`, `.env.local`, and other dotenv variants. `.env.example` is the only dotenv file intended for version control.

5) Quick local steps
```powershell
cd project
cp .env.example .env.local
# edit .env.local and add real values
npm install
npm run dev
```
