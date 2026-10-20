# Mercado Pulse 📈

A fun hobby dashboard by [@Chicano_Ismael](https://x.com/Chicano_Ismael) (Yukon, OK): FX, options, bank stocks, bonds, macro & micro economics, Politics x Markets stories, and Oklahoma City Stockyards cattle prices.

**Live site:** https://mercado-pulse.vercel.app

## Files
| File | What it does |
|---|---|
| `index.html` | The page structure (sections, titles) |
| `style.css` | The look (colors are at the top in `:root`) |
| `app.js` | The behavior: sample data lists, live FX + livestock loading, charts |
| `api/fdic-rates.js` | Small Vercel function that reads the official FDIC national average deposit rates (backup: FRED) |
| `data/rates.json` | The Bank Rates table, checked and typed in by hand |
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

## How to update the Bank Rates table (`data/rates.json`)
The national averages update by themselves (FDIC posts new ones every 3rd Monday). The bank rows do **not**: a person checks each bank's website and types the number in. Try to do this every week or two.

1. On GitHub, open **`data/rates.json`** and click the ✏️ pencil (Edit).
2. Each bank product is one block between `{ }`. To change a rate, open the bank's page from its `sourceUrl`, find the number, and change **`apy`** (just the number: `4.00` means 4.00%, no `%` sign).
3. Change that row's **`asOf`** to today (`YYYY-MM-DD`), and the **`asOf`** at the very top too.
4. Field guide:
   - `category`: `Fintech`, `Traditional`, or `OKC Local`. `audience`: `Business` or `Consumer`.
   - `type` (controls the filter buttons and the national-average comparison): `Checking`, `Savings`, `Money Market`, `CD`, or `Treasury` (investment funds like Mercury Treasury, which are not deposits and get no comparison).
   - `term`: for CDs, like `"12 months"`, and also add `"termMonths": 12` so it compares against the FDIC 12‑month CD average.
   - `apy`: a number, or `null` if you don't have one (the site shows "Check site").
   - `apyNote`: short notes. Starting it with `up to` shows "up to 1.35%"; starting with `from` shows "from 2.45%"; `not offered` shows "Not offered".
   - `highlight: true` makes the row stand out (used for ROGER).
5. **Only copy numbers you can see on the bank's own page.** Don't copy from Bankrate/NerdWallet/DepositAccounts (their terms forbid it).
6. Watch the commas: every block ends with `},` except the last one, which ends with `}`. If the Bank Rates table shows "Couldn't load", a comma or quote is probably off. Paste the file into [jsonlint.com](https://jsonlint.com) to find it.
7. Click **Commit changes**. Vercel updates the site in about a minute.

## How to edit
- **On a Chromebook / any browser:** open this repo on GitHub and press the **`.`** key → opens github.dev (VS Code in the browser). Edit, then commit.
- **In Cursor:** clone the repo, open the folder, and ask Cursor things like "add the Brazilian real to the FX cards".
- To preview locally: open `index.html` in a browser (the livestock section needs Vercel to run `/api`).

## Data sources
- **LIVE FX:** European Central Bank rates via [frankfurter](https://frankfurter.dev) (free, no key).
- **LIVE national deposit rates:** [FDIC National Rates and Rate Caps](https://www.fdic.gov/national-rates-and-rate-caps) (official, monthly), with [FRED series SNDR](https://fred.stlouisfed.org/series/SNDR) as a backup for savings.
- **Bank rates table:** checked by hand from each bank's own website (link + date on every row).
- **LIVE livestock:** [USDA AMS Market News report 1280](https://mymarketnews.ams.usda.gov/viewReport/1280) – Oklahoma National Stockyards feeder cattle.
- **SAMPLE:** Options, bank stocks, bonds and macro numbers are made-up practice values, clearly labeled on the site.

Built with help from Grok Bot. *For fun & learning only — not investment advice.*

Auto-deploys from GitHub via Vercel.
