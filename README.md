# Neta-lee Artzi – Portfolio

Product design portfolio. Designed in Figma, built with Claude Code, hosted on Vercel.

## What's in here

| File / folder | What it is |
|---|---|
| `index.html` | Home page |
| `skyline.html`, `building-onboarding.html`, `stealth.html`, `space-court.html` | One page per case study (the site shows them as `/skyline` etc.) |
| `404.html` | The page people see when a link is wrong |
| `assets/style.css` | All the design: colors, fonts, spacing. The color and font tokens are at the top. |
| `assets/site.js` | The hero grain and the hobbies animation on the home page |
| `img/` | Images, one folder per page |
| `vercel.json` | Tells Vercel to serve clean addresses (`/skyline` instead of `/skyline.html`) |

There is no build step: what you see in these files is exactly what goes live.

## Making a change

1. Edit a file (in GitHub, VS Code or Cursor).
2. **Commit**: save a snapshot with a short message, e.g. `Add tool logos`.
3. **Push**: send the commit to GitHub.
4. Vercel sees the new commit and updates the site within about a minute.

## Live site

- The site is live at https://www.neta-leeartzi.com (neta-leeartzi.com redirects to www).
- The domain is registered at Wix. Its DNS points to Vercel: an A record `@` → `216.198.79.1` and a CNAME `www` → the value shown in Vercel (Project → Settings → Domains).
- `sitemap.xml` and `robots.txt` help search engines find the pages.
