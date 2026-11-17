# Deck Test Tuesday (DTT) — Rules of Villainy

A Neobrutalist full-stack web application for **Deck Test Tuesday**, the weekly Disney Lorcana livestream series hosted by **Andy** and **Kirsten** on the [Rules of Villainy](https://www.youtube.com/@RulesOfVillainy) YouTube channel.

---

## Features & Architecture

1. **Neobrutalist Design Identity (`tailwind.config.ts` & `src/app/globals.css`):**
   - Base Palette: Deep Purples (`#3B1F54`, `#1F102F`), Off-Black (`#121212`), Off-White Canvas (`#FFFDF7`).
   - Accents: Hot Pink (`#FF2E93`, `#FF4B91`), Electric Teal (`#00F5D4`), Warm Amber (`#FFB703`).
   - Official Lorcana Ink Tokens: Amber (`#E5A93B`), Amethyst (`#8B5FA8`), Emerald (`#2E8B57`), Ruby (`#D62828`), Sapphire (`#1D70B8`), Steel (`#7A8B99`).
   - Tactile `border-[3px] border-black`, `shadow-[4px_4px_0px_#000000]`, and button press states.

2. **Database Schema (`db/schema.sql` & `src/lib/db.ts`):**
   - Full PostgreSQL schema (`episodes`, `cards_cache`, `decks`, `matches`, `deck_submissions`) compatible with **Neon** and **Supabase** free tiers.
   - Automatic zero-config local development fallback (`data/local-db.json` pre-seeded with realistic DTT episodes, Lorcana cards, match logs, and community submissions) when `DATABASE_URL` is empty.

3. **Decklist Regex Parser & Lorcast API Caching (`src/lib/deck-parser.ts` & `src/lib/lorcast.ts`):**
   - Parses raw decklists using `^(\d+)[xX]?\s+([^-–]+)(?:[-–]\s*(.+))?$`.
   - Checks `cards_cache` first; if missing, queries `https://api.lorcast.com/v0/cards/search?q=name:"CardName"` and caches card artwork, ink color, cost, and inkwell status.

4. **YouTube Stream Auto-Importer (`/api/cron/youtube-sync` & `src/lib/youtube.ts`):**
   - Polls YouTube Data API v3 for `Rules of Villainy` streams matching `"Deck Test Tuesday"`, detects live broadcasts (`snippet.liveBroadcastContent === 'live'`), updates `is_live = true`, and auto-creates new episode entries.

5. **Public Pages:**
   - **Homepage (`/`):** Neobrutalist hero, all-time Andy vs. Kirsten scoreboard, dynamic live stream player & active decks card, and recent episode feed.
   - **DTT Data Archive (`/episodes` & `/episodes/[id]`):** Multi-select Lorcana ink filter, pilot record filter, format chips, interactive visual decklists, mana curve breakdown, **Copy Dreamborn Text**, and **Export as Image (PNG)**.
   - **Deck Submission (`/submit`):** Mode A (validated Dreamborn/Inkdecks URL) & Mode B (raw decklist with real-time card line count validator) + Neobrutalist success modal.

6. **Admin & Mobile Stream Controller (`/admin/login`, `/admin`, `/admin/controller`):**
   - Single-password authentication (`ADMIN_PASSWORD` in `.env`, default `villainy` in `.env.local`) with HTTP-only signed session cookies.
   - **Admin Dashboard (`/admin`):** Approve, Reject, or Assign community submissions to episodes, plus a 1-click **90-Day Data Retention Pruning Tool**.
   - **Mobile Stream Controller (`/admin/controller`):** Giant touch buttons (`"Andy Won Game X"`, `"Kirsten Won Game X"`), running series status badge, `"Undo Last Game"` button, bottom drawer to manually adjust scores or swap pilot decks, and `"Finish Match & Save"`.

---

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

Open `http://localhost:3001`.
- Default local admin password (configured in `.env.local`): `villainy`
- To run PostgreSQL migrations against a live `DATABASE_URL`:
  ```bash
  npm run db:migrate
  ```
