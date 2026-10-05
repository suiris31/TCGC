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
proxy), `PORT`, `PUBLIC_PATH` (e.g. `/tcgc` when served under a sub-path), `TRUST_PROXY`.

- Put the app behind an **HTTPS** reverse proxy (Caddy, nginx...). Session cookies are then marked `Secure`.
- If the proxy runs on another machine, set `TRUST_PROXY` (e.g. `TRUST_PROXY=1`) so the app sees the real
  client IP and protocol. The default (`loopback`) suits a proxy on the same machine.
- Passwords are hashed with scrypt; sessions are random tokens in an HttpOnly cookie (only their hash is stored);
  login and sign-up attempts are rate-limited; requests from other sites are refused.
- Not included yet: email verification and password reset by email.
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

Measured on simulated photos (tilt, glare, blur, background): the right card comes first in ~99% of cases with
the viewfinder, ~94% in photo mode, and is almost always among the suggestions.

### Collection

- **By set**: each expansion with your most valuable card as its cover, how many of its cards you own out of the
  total (all printings: regular, parallel, manga...), your progress and the value. "All sets" also shows the
  ones you don't own anything from yet.
- **Inside a set**: all its cards, in color if you own them, grayed out otherwise (show all / owned / missing).
  The + button adds a missing card directly. At the top, the cost to complete the set ("23 cards missing,
  ≈ €87 in total", and without the 3 most expensive) and a button to add every missing card to your wishlist.
- **My cards**: every copy you own, sortable by value, number, set, color, rarity, name or date added, and
  filterable by set, color and language.
- **Wishlist**: the cards you want, each with a **target price** (the most you are willing to pay, to copy into
  your Cardmarket wants list). At the top, the cards whose price dropped below their target (green badge on the
  Collection tab), then **deals** among the cards missing from your sets: at least 10% below their monthly
  average, at a level confirmed over the week. A card added to your collection in the wanted language leaves
  the wishlist.

### Good time to buy?

Each card's page tells where its price stands, from Cardmarket prices (trend, 7- and 30-day averages), the
history the app records every day and the set release date (`server/insight.js`):

| Badge | When | Advice |
|---|---|---|
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

## How it works

| Part | Source / technique |
|---|---|
| Catalog (cards, printings, images) | TCGplayer, through the public daily mirror [tcgcsv.com](https://tcgcsv.com) |
| French cards | Official French card list [fr.onepiece-cardgame.com](https://fr.onepiece-cardgame.com/cardlist/): French names and artwork (refreshed weekly) |
| Prices (default) | **Cardmarket** price trend in € (daily public files). The reference market in Europe, but it doesn't separate languages. |
| Prices (fallback or by choice) | TCGplayer "market price" (average of recent US sales, English cards), converted to € at the daily ECB rate |
| Recognition | DINOv2 vision model running locally: every image (TCGplayer English + official French) becomes a vector and the photo is compared against all of them. The band where official images carry a "SAMPLE" watermark is blurred on both sides, otherwise real (unwatermarked) cards are poorly recognized. |
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
```

- `server/`: Express API, data sync, image recognition
- `web/`: React UI (PWA)
- `data/`: database, images, model and index (not versioned, recreated automatically)

Your collection lives only in `data/tcgc.db`: back this file up (or use the CSV export in the Stats tab).

## Contributing

Suggestions and pull requests are welcome: open an issue to discuss an idea or a bug, or send a change directly.
Issues and pull requests can be written in English or French.

```bash
npm install
npm run dev                 # server + UI with hot reload
npx tsc -p tsconfig.json    # type-check the UI
```

Code comments are in French. Interface texts live in `web/src/i18n.ts` (French and English): adding a language
there is a welcome contribution.

## License

[MIT](LICENSE). The data (catalog, prices, images) is not part of this repository: the app downloads it from its
public sources, and it remains subject to those sources' terms.
