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
