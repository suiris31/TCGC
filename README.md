# Ma Collection One Piece (TCGC)

**English** · [Français](README.fr.md)

A collection manager for the **One Piece Card Game**: scan your cards with your phone's camera, track your
collection set by set, keep French and English printings apart, and see what it's worth in euros. It runs on
your own PC and you use it from your phone over your home Wi-Fi. Free, no account, no paid service: card
recognition runs locally.

> Unofficial community project, not affiliated with Bandai, TCGplayer or Cardmarket.
> One Piece Card Game is a trademark of Bandai.
>
> The app's interface is currently in French. Translations are welcome (see [Contributing](#contributing)).

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
- **Inside a set**: all its cards, in color if you own them, grayed out otherwise (toggle "missing cards" to hide
  them). The + button adds a missing card directly.
- **All my cards**: every copy you own, sortable by value, number, set, color, rarity, name or date added, and
  filterable by set, color and language.

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

The code comments and the UI are in French for now; an English interface would be a great contribution.

## License

[MIT](LICENSE). The data (catalog, prices, images) is not part of this repository: the app downloads it from its
public sources, and it remains subject to those sources' terms.
