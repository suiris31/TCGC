# Ma Collection One Piece (TCGC)

**English** · [Français](README.fr.md)

A collection manager for the **One Piece Card Game**: scan your cards with your phone's camera, track your
collection set by set, keep French and English printings apart, and see what it's worth in euros. It runs on
your own PC and you use it from your phone over your home Wi-Fi. Free, no account, no paid service: card
recognition runs locally.

The interface is available in **English and French**: it follows your phone's language and can be changed in
the Stats tab.

> Unofficial community project, not affiliated with Bandai, TCGplayer or Cardmarket.
> One Piece Card Game is a trademark of Bandai.

## Getting started

Requirements: [Node.js](https://nodejs.org) 22.13 or newer.

On Windows, double-click `start.bat`. On any system:

```bash
npm install
npm run build
npm start
```

The terminal prints the address to open on your phone, for example `http://192.168.1.42:3000`. Your phone
must be on the same Wi-Fi network as the PC. On Windows, the first launch asks to allow Node.js through the
firewall: tick **Private networks**.

The first start takes about ten minutes, to:
1. download the card catalog and prices (about 7,000 cards, a few seconds);
2. download the card images (~150 MB of English and ~90 MB of French images, in `data/`);
3. download the vision model (~90 MB) and analyze every image for recognition.

After that, startup is instant. Prices update automatically once a day.

## Accounts

Each person creates an account (username, email, password) and gets their own private collection. The
**Profile** tab shows the account, lets you change the interface language, log out, and **delete the account**:
this permanently erases everything linked to it (collection, value history, sessions), after confirming with
the password.

If you used the app before accounts existed, **the first account you create gets your existing collection**.

### Hosting it publicly

Ready-made files are in [`deploy/`](deploy): a systemd service (`tcgc.service`), an nginx block to serve the app
under a sub-path such as `https://example.com/tcgc/` (`nginx-tcgc.conf`), a daily database backup (`tcgc.cron`,
`npm run backup`) and an update script (`update.sh`). Environment variables: `HOST` (use `127.0.0.1` behind a
proxy), `PORT`, `PUBLIC_PATH` (e.g. `/tcgc` when served under a sub-path), `TRUST_PROXY`, `VAPID_SUBJECT`
(contact sent to browser push services, e.g. `mailto:you@example.com`; defaults to the project's GitHub page).

- Put the app behind an **HTTPS** reverse proxy (Caddy, nginx...). Session cookies are then marked `Secure`.
- If the proxy runs on another machine, set `TRUST_PROXY` (e.g. `TRUST_PROXY=1`) so the app sees the real
  client IP and protocol. The default (`loopback`) suits a proxy on the same machine.
- Passwords are hashed with scrypt; sessions are random tokens in an HttpOnly cookie (only their hash is stored);
  login and sign-up attempts are rate-limited; requests from other sites are refused.
- **Forgot password**: a single-use link valid for 1 hour, sent by email. Set `SMTP_URL` (e.g.
  `smtps://user%40example.com:password@smtp.example.com:465`), `MAIL_FROM` and `PUBLIC_URL` (the app's public address,
  used in the link; never taken from the request). Without them, the "Forgot your password?" link is hidden.
  `SMTP_URL=log` writes the emails to the server log instead of sending them (local testing). On a server, put these
  private settings in `/opt/tcgc/tcgc.env` (see `deploy/tcgc.env.example`), read by the systemd service.
- **Legal notice and privacy policy** (`#legal`, linked from the login screen, the profile and shared pages): the
  publisher, contact and host come from `LEGAL_PUBLISHER`, `LEGAL_CONTACT` and `LEGAL_HOST`.
- Not included: email address verification.

#### Off-server backup

The server backs up the database every night (`deploy/tcgc.cron`), but onto itself. To keep a copy elsewhere,
[`deploy/pull-backup.ps1`](deploy/pull-backup.ps1) fetches the latest backup onto a Windows PC (and keeps the last 14
in `Documents\TCGC-sauvegardes`). Once, in PowerShell on the PC:

```powershell
# 1. SSH key (leave the passphrase empty so the task can run unattended), then authorize it on the server
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ubuntu@my-server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# 2. Try it (the script is in the repository's deploy folder)
powershell -NoProfile -ExecutionPolicy Bypass -File C:\path\TCGC\deploy\pull-backup.ps1 -Server ubuntu@my-server

# 3. Every day at noon, or at the next start of the PC if it was off
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\path\TCGC\deploy\pull-backup.ps1" -Server ubuntu@my-server'
Register-ScheduledTask -TaskName 'TCGC backup' -Action $action -Trigger (New-ScheduledTaskTrigger -Daily -At 12:00) -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

The copy log is in `Documents\TCGC-sauvegardes\pull-backup.log`. These copies contain the accounts (emails, hashed
passwords): keep them private. To restore: stop the service, replace `/opt/tcgc/app/data/tcgc.db` with the copy,
start the service again.
- Catalog and prices are shared by all accounts; a manual price update can run at most once an hour, and each
  account can scan up to 60 cards a minute.

## Live camera on Android

Chrome only allows the live camera on a secure address (https or localhost). Without any setup, scanning still
works through the phone's camera app. To get the live viewfinder and be able to install the app on your home
screen:

1. In Chrome on your phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Set it to **Enabled** and enter the app's address (e.g. `http://192.168.1.42:3000`)
3. Tap **Relaunch**
4. Open the app, then menu ⋮ ▸ **Install app**

Tip: give your PC a fixed IP address in your router (static DHCP lease) so the address never changes.

## Features

### Scanning

- **Live camera with a card-shaped viewfinder**: the most reliable mode. Line the card up with the frame, flat.
- **Photo** (without the setup above): keep the card centered, filling at least half of the picture.
- Avoid glare (shiny sleeves, a lamp right above the card).
- Choose the **language** of the card you're scanning (FR / EN, French by default; the last choice is
  remembered on each phone) and the **number of copies** before adding it.
- When several printings share **exactly the same artwork** (reprint, stamped tournament version...), the app
  lists them with their prices so you can pick the right one. It preselects the standard, most common one.
- Card not recognized? Type its code (`OP14-018`, `op1418`...) or its name.
- **Opening boosters**: the "Summary" button in the session bar shows the value of the cards added, rare cards and
  special printings, the best pulls and, if you enter the price paid, the balance. The session is kept until the
  browser is closed (you can switch tabs); the summary can be shared.

Measured on simulated photos (tilt, glare, blur, background): the right card comes first in ~99% of cases with
the viewfinder, ~94% in photo mode, and is almost always among the suggestions.

### Collection

- **By set**: each expansion with your most valuable card as its cover, how many of its cards you own out of the
  total (all printings: regular, parallel, manga...), your progress and the value. "All sets" also shows the
  ones you don't own anything from yet.
- **Inside a set**: all its cards, in color if you own them, grayed out otherwise (show all / owned / missing).
  The + button adds a missing card directly. At the top, the cost to complete the set ("23 cards missing,
  ≈ €87 in total", and without the 3 most expensive) and a button to add every missing card to your wishlist.
- **Starter deck** ("Add a starter deck" in By set, or "I have this deck" on a starter deck's page): every card of
  the deck at once, from the official French card list (reprints included), with quantities pre-filled when the deck
  list is known (`server/decks.js`), editable before adding.
- **My cards**: every copy you own, sortable by value, number, set, color, rarity, name or date added, and
  filterable by set, color and language.
- **Duplicates**: the copies above the ones you keep (1 per card and language for a collection, up to 4 to play),
  with their value: your trading stock. Rising or falling prices are flagged.
- **Trades between members** (in Duplicates): if you join, the app shows the members who have spare copies of the
  cards you want (in the same language) and those who want your duplicates, with the contact and city or region
  they chose to give. Joining is opt-in: only participants are matched, with each other. A notification flags
  new possible trades.
- **Share** (in Duplicates): a secret link to send to a friend. Without an account, they see your duplicates (or
  your whole collection, your choice) and your wishlist, tick the cards they want and the ones they have from your
  wishlist, then send you their selection through the phone's share menu (WhatsApp, SMS...). Nothing goes through
  the server. You choose whether prices are shown; your email and target prices never are. "Change the link"
  makes the old one stop working, "Disable" removes the page.
- **Wishlist**: the cards you want, each with a **target price** (the most you are willing to pay, to copy into
  your Cardmarket wants list). At the top, the cards whose price dropped below their target (green badge on the
  Collection tab), then **deals** among the cards missing from your sets: at least 10% below their monthly
  average, at a level confirmed over the week. A card added to your collection in the wanted language leaves
  the wishlist.

### Notifications

In Profile, "Enable on this device" subscribes the phone to push notifications (HTTPS required, works best with
the app installed on the home screen). After the daily price update, the app sends:

- **Target price reached**: a wishlist card dropped below your target (once, until it goes back above);
- **Weekly summary**: your collection's value and its change over 7 days, with the biggest rise;
- **Trades available**: a member taking part in trades has a spare copy of a card you want;
- **Bans**: a card you own or want has just been banned or restricted in official tournaments.

The official banned / restricted list ([fr.onepiece-cardgame.com](https://fr.onepiece-cardgame.com/news/restriction.html))
is checked at each price update; the page of an affected card says so ("Banned in tournaments"...).

Each type can be turned off. The server's VAPID keys are created on first start and stored in the database.

### Good time to buy?

Each card's page tells where its price stands, from Cardmarket prices (trend, 7- and 30-day averages), the
history the app records every day and the set release date (`server/insight.js`):

| Badge | When | Advice |
|---|---|---|
| Ban | card banned or restricted in tournaments, announced less than 2 months ago | prices often drop sharply: wait, or trade spare copies soon |
| Wait | set less than 5 months old whose price is still falling | cards in this situation are usually much cheaper 2 months later |
| New release | set released less than 8 weeks ago | prices move a lot, no rush |
| Rising | +15% or more recently | the price moves fast, compare listings |
| Falling | −10% or more and still falling, or a sudden drop | no rush |
| Good price | at least 10% below the monthly average, level confirmed over the week | a good time if you want it |
| Stable price / Cheap | otherwise / under €1 | |

These are hints, not predictions: Cardmarket prices mix all languages and conditions. The suggested target
price is about 10% below recent prices (20% when the price is falling or the set is new); you set the final one.

### French and English printings

Every copy in your collection has a language: you can own the same card in French and in English, with a
quantity for each. A French copy is shown with its French name and artwork, an English copy with the English
ones. On a card's page you can switch the display language and adjust the quantity per language.

Prices don't depend on the language (Cardmarket's public price data doesn't separate languages).

## Play

The **Play** tab is a game simulator to practice against an AI, with a coach that reviews each of your decisions
(formerly the OP Coach project, in the `game/` folder):

- the **6 starter decks ST-31 to ST-36**, each with a guide (game plan, combos, opening hand);
- **AI with three levels**: Beginner (common-sense rules and a learned style for each deck), Advanced and Expert
  (it simulates the rest of the game before each choice, without ever seeing your hidden cards);
- **coach**: advice on demand (💡) or automatic (★), and an end-of-game recap (mistakes, best moves, turning
  points, win-chance curve, "replay this moment");
- **My games**: every game is saved to your account with all its details; progress, areas to improve by theme,
  and habits. Games from the former OP Coach can be imported with the ⤒ button.

Full official rules (version 1.2.1); card effects are coded from their official French text, and interpretation
choices are listed in `game/docs/interpretations.md`. The game is only available in French for now. The AI and
the coach run in the browser: they put no load on the server.

The game works on desktop and on phones (portrait or landscape). On a touch screen, tapping a card opens its sheet
(text, state, possible actions), an attack is confirmed after seeing the expected result, and the log and the coach
open with the 📜 button.

## How it works

| Part | Source / technique |
|---|---|
| Catalog (cards, printings, images) | TCGplayer, through the public daily mirror [tcgcsv.com](https://tcgcsv.com) |
| French cards | Official French card list [fr.onepiece-cardgame.com](https://fr.onepiece-cardgame.com/cardlist/): French names and artwork (refreshed weekly) |
| Prices (default) | **Cardmarket** price trend in € (daily public files). The reference market in Europe, but it doesn't separate languages. |
| Prices (fallback or by choice) | TCGplayer "market price" (average of recent US sales, English cards), converted to € at the daily ECB rate |
| Recognition | DINOv2 vision model running locally: every image (TCGplayer English + official French) becomes a vector and the photo is compared against all of them. The band where official images carry a "SAMPLE" watermark is blurred on both sides, otherwise real (unwatermarked) cards are poorly recognized. |
| Price history | Every day, every field of the Cardmarket price guide (trend, 1/7/30-day averages, average, lowest price) and TCGplayer prices (market, low, mid): Cardmarket only publishes today's prices |
| Storage | SQLite (`data/tcgc.db`), built into Node.js |

The price source can be changed in the Stats tab; when it has no price for a card, the other one is used.

Cardmarket's public files tell neither the printing (regular, parallel, manga...) nor the language of each
product. The app matches them to the catalog (see `server/cardmarket.js`): Japanese expansions are detected
from the names of their sealed products ("Non-English", "Asia Region Legal"), then printings are paired in
catalog order, checking that prices on both markets stay consistent. About 85% of cards get a Cardmarket price;
the rest (mostly promos) keep the TCGplayer one.

## Development

```bash
npm run dev            # server (port 3000) + Vite UI with hot reload (port 5173)
npm run sync           # force a catalog and price update
npm run index-images   # complete the recognition index (add -- --rebuild to recompute everything)
npm run typecheck      # type checking (UI and game)
npm test               # game tests (engine, cards, AI, coach, saved games)
npm run game:cards     # download the game's card data (needed by the tests)
npm run game:validate  # mass validation: thousands of AI vs AI games (game/docs/validation.md)
npm run game:train     # self-learning of each deck's play style (about 20 minutes)
npm run game:analyse -- <username>   # report on an account's games, in Markdown
```

- `server/`: Express API, data sync, image recognition
- `web/`: React UI (PWA)
- `game/`: the game (Play tab): rules engine, card effects, AI, coach, UI, tests
- `data/`: database, images, model, index and the game's card data (not versioned, recreated automatically)

Your collection lives only in `data/tcgc.db`: back this file up (or use the CSV export in the Stats tab).

## Contributing

Suggestions and pull requests are welcome: open an issue to discuss an idea or a bug, or send a change directly.
Issues and pull requests can be written in English or French.

```bash
npm install
npm run dev                 # server + UI with hot reload
npm run typecheck           # type checking (UI and game)
npm test                    # game tests
```

Code comments are in French. Interface texts live in `web/src/i18n.ts` (French and English): adding a language
there is a welcome contribution.

## License

[MIT](LICENSE). The data (catalog, prices, images) is not part of this repository: the app downloads it from its
public sources, and it remains subject to those sources' terms.
