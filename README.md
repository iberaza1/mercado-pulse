# Mercado Pulse 📈

A fun hobby dashboard by [@Chicano_Ismael](https://x.com/Chicano_Ismael) (Yukon, OK): FX, options, bank stocks, bonds, macro & micro economics, Politics x Markets stories, and Oklahoma City Stockyards cattle prices.

**Live site:** https://mercado-pulse.vercel.app

## Files
| File | What it does |
|---|---|
| `index.html` | The page structure (sections, titles) |
| `style.css` | The look (colors are at the top in `:root`) |
| `app.js` | The behavior: sample data lists, live FX + livestock loading, charts |
| `api/livestock.js` | Small Vercel serverless function that reads the USDA cattle report |
| `package.json` | Lists the one library the function needs (`pdf-parse`) and the Node version (24.x) Vercel should use |
| `package-lock.json` | Freezes the exact library versions so every deploy is the same (made by `npm install`, don't edit by hand) |
| `vercel.json` | Security headers Vercel adds to every page (see below) |
| `favicon.svg` | The little icon in the browser tab |

## Security headers (`vercel.json`)
JSON files can't hold comments, so here's what each one does:
- **X-Content-Type-Options: nosniff** – browsers must trust our file types instead of guessing.
- **Referrer-Policy** – other sites only see our domain, not the full page address, when someone clicks a link.
- **X-Frame-Options: DENY** + `frame-ancestors 'none'` – nobody can embed our site inside theirs (stops "clickjacking").
- **Permissions-Policy** – turns off camera, mic, location, payments, USB; we don't use them.
- **Content-Security-Policy** – a list of the only places the page may load code/data from: our own site, Chart.js on `cdn.jsdelivr.net`, and FX rates from `api.frankfurter.dev`. **If you add a new outside API or script, add its address here too**, or the browser will block it.

## How to edit
- **On a Chromebook / any browser:** open this repo on GitHub and press the **`.`** key → opens github.dev (VS Code in the browser). Edit, then commit.
- **In Cursor:** clone the repo, open the folder, and ask Cursor things like "add the Brazilian real to the FX cards".
- To preview locally: open `index.html` in a browser (the livestock section needs Vercel to run `/api`).

## Data sources
- **LIVE FX:** European Central Bank rates via [frankfurter](https://frankfurter.dev) (free, no key).
- **LIVE livestock:** [USDA AMS Market News report 1280](https://mymarketnews.ams.usda.gov/viewReport/1280) – Oklahoma National Stockyards feeder cattle.
- **SAMPLE:** Options, bank stocks, bonds and macro numbers are made-up practice values, clearly labeled on the site.

Built with help from Grok Bot. *For fun & learning only — not investment advice.*

Auto-deploys from GitHub via Vercel.

## 📈 Paper Trader (practice investing, fake money)

Page: `/trader.html` · About page: `/about.html`

Everyone who signs in with Google gets **$100,000 of fake cash** to buy and sell US stocks & ETFs at delayed prices (Finnhub). It shows a **Quant Report Card** (return vs. S&P 500/SPY, Sharpe, volatility, max drawdown, beta), a **monthly leaderboard** (first name + last initial only), and a Bank Rates tie-in ("your cash would have earned $X in a 4% savings account"). **Educational only, not financial advice.**

Until the setup below is done, the page shows a friendly "Setup needed" box and the rest of the site works normally.

### How it works
- `api/quote.js` gets prices from Finnhub (key stays on the server, cached 60 s per symbol).
- `api/trade.js` checks who you are, fetches the price **on the server**, and calls the database function `pt_execute_trade` (the browser never picks the price).
- `api/portfolio.js` returns your holdings + report card and saves today's snapshot. `api/snapshot-all.js` runs daily on weekdays at 4:30 PM CT (Vercel Cron, 21:30 UTC — it lands an hour earlier in winter).
- `api/leaderboard.js` reads the `pt_leaderboard` function (name + return only).
- `lib/quant.js` holds the math. Tests: `npm test`.
- Database: `supabase/migrations/20261022000000_paper_trader.sql` (tables, Row Level Security, functions).

### Setup checklist (all in web dashboards, no terminal)
1. **Finnhub**: sign up free at finnhub.io → Dashboard → copy your API key.
2. **Supabase project**: free accounts get 2 active projects (Supplement Tracker uses one). Create a new project, or use the other free slot.
3. **Run the SQL**: Supabase → SQL Editor → New query → paste the migration file → Run.
4. **Google sign-in**:
   - In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`.
   - In Supabase → Authentication → Sign In / Providers → Google → turn on and paste the Client ID + Secret.
   - In Supabase → Authentication → URL Configuration: Site URL `https://mercado-pulse.vercel.app`, and add `https://mercado-pulse.vercel.app/trader.html` to Redirect URLs.
5. **Vercel env vars** (Project → Settings → Environment Variables), then redeploy:
   - `FINNHUB_API_KEY`
   - `SUPABASE_URL` (Supabase → Project Settings → API)
   - `SUPABASE_ANON_KEY` (public "anon" key)
   - `SUPABASE_SERVICE_ROLE_KEY` (secret! server only — never put it in the browser code)
   - `CRON_SECRET` (any long random text; protects the daily snapshot job)

### Try it on your computer (optional)
`npm install` then `npm run dev` and open http://localhost:3000.
