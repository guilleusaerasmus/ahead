# Ahead

**Lose your hair on your own terms.** Ahead helps people starting chemotherapy prepare for hair loss before it happens, and follow their hair and skin while it does.

Built for the [YouCam API Skin AI & eCommerce VTO Hackathon](https://youcam-api-skin-ai-ecommerce.devpost.com/).

- **Live app:** https://ahead.guilleusaerasmus.workers.dev
- **Demo video (2 min):** https://youtu.be/8NO8_l7cbWA
- **Devpost:** https://devpost.com/software/ahead-qfdwri

## For judges: test it in one minute

1. Open the live app and choose **"See it with a demo persona"**. No photos and no API units needed: you get Elena's hair card, try-ons, three weeks of check-ins and the printable plan. Every number and image in the demo is a stored real YouCam API result.
2. To run it live on your own photos, choose **Start** and add three photos (head and shoulders, a face close-up, your hairline with the head tilted down). Live calls are capped per visitor and per day to protect the free units; if a cap is reached the app says so, keeps your saved results, and the demo persona still works.
3. Nothing to install. To run it locally, see [Run it locally](#run-it-locally).

## Why it matters for eCommerce

- **Wig shopping by numbers.** The hair card turns measurements into the attributes a wig is sold by: shade (an exact hex you tap on your own hair), length and cap density (light, medium or heavy). A wig retailer can match those to products instead of asking a stressed customer to guess.
- **Try before you buy, on your own face.** Wig styles (AI Hairstyle Generator), colours (AI Hair Color), brows (Makeup VTO) and any hat or scarf you photograph in a shop (Hat VTO with the shopper's own product photo) are previewed on the shopper's photo before paying.
- **A plan to take to the shop.** The printable plan carries the shade, length, density and favourite looks to the wig fitter or hairdresser.

## Why

Hair loss usually starts two to three weeks after the first chemotherapy cycle ([American Cancer Society](https://www.cancer.org/cancer/managing-cancer/side-effects/hair-skin-nails/hair-loss/coping-with-hair-loss.html)). Those weeks are when people choose a wig, decide whether to cut their hair short, and look for head coverings. Most do it from memory, from a phone photo, or in a shop at the worst possible moment.

A wig looks like *you* when it matches your colour, your length and how full your hair is. Those are exactly the things you can still measure before treatment starts, and exactly what Ahead measures.

## What it does

1. **Your hair today.** Three photos (head and shoulders, a face close-up, the hairline) become a hair card for the wig fitter:
   - Colour (with the hex swatch).
   - Length.
   - Fullness, translated into wig cap density (light, medium or heavy).
   - The brow pencil shade that matches you.
2. **Try your options**, all on your own photo:
   - Wigs that keep your own hair colour.
   - The short cut many people choose before shedding starts.
   - A new colour.
   - A hat or scarf you photograph in a shop or at home.
   - Fuller brows in your pencil shade.

   Favourites go into your plan.
3. **Weekly check-in.** A quick photo tracks:
   - Hair density (when to cut or switch to a wig).
   - Skin hydration, redness, smoothness and radiance.

   It shows gentle care tips sourced from the American Cancer Society, and a clear list of when to tell your care team.
4. **My plan.** A printable page for the wig fitter, the hairdresser or whoever is helping you.

## YouCam APIs used

| Feature | YouCam API | Units |
|---|---|---|
| Hair, brow and skin colour | AI Skin Tone Analysis (`skin-tone-analysis`) | 20 |
| Hair length | AI Hair Length Detection | 2 |
| Hair density (baseline and weekly) | AI Hair Density Detection | 1 |
| Wig and short-cut previews | AI Hairstyle Generator v2.1 (`hair-transfer`, `hair_color: "src"` to keep your colour) | 2 |
| New colour | AI Hair Color | 1 |
| Hats and scarves | AI Hat Virtual Try-On, with the visitor's own product photo as reference | 2 |
| Fuller brows | AI Makeup VTO, `eyebrows` category | 1 |
| Skin check-in | AI Skin Analysis SD: `moisture`, `redness`, `texture`, `radiance` | 9 |

The demo persona's photos were made offline with YouCam's **AI Image Generator**; the app itself does not call it. The Hat VTO returns a new full-length photo of the person wearing the item rather than editing the original photo.

## Design decisions

- **Honest numbers.**
  - YouCam's documentation says `ui_score` is adjusted upwards to make people feel better. Ahead tracks `raw_score` instead.
  - A change is only called noticeable above the measured noise of the analysis. Six versions of the same face photo (brighter, darker, warmer, cropped, heavier JPEG) moved the raw scores by at most 2.6 points (standard deviation ≤ 0.97). The 95 % threshold for a difference between two check-ins is about 2.7 points. Real photos also vary in pose and expression, so Ahead uses 5.
- **Not medical.**
  - Ahead never diagnoses or recommends treatment.
  - Every tip links to its source.
  - The care-team prompts are the American Cancer Society's own list.
- **Privacy by default.**
  - Photos go to YouCam only to be processed.
  - Ahead calls `task/delete` as soon as each result is back, which removes the input and the output from YouCam's servers.
  - Everything else stays in the browser (IndexedDB), and one button deletes it all. Check-in photos are not kept at all, only the numbers.
  - 18+ and explicit consent, as the YouCam API terms require.
- **Made for tired people.**
  - Few steps and big targets.
  - Plain language and errors that say what to do ("face a window", "show both shoulders").
  - Keyboard and screen-reader friendly, dark mode, and it works on a phone.

## Architecture

- **Front end:** Vite, Preact and TypeScript, no UI framework.
- **Back end:** one Cloudflare Worker serves the site and proxies `/api/*` to YouCam.
  - The API key is a Worker secret and never reaches the browser.
  - Only whitelisted features and parameters are accepted; the server builds every upstream request body itself.
  - Browser requests from other origins are rejected, and every request is validated against the whitelist.
  - A daily unit budget per visitor and for the whole site, in Workers KV, protects the free units.
- **Uploads** go straight from the browser to YouCam's presigned storage URL. Polling backs off, with at most two tasks in flight, to respect YouCam's 250 requests per 5 minutes.

## Run it locally

```bash
npm install
echo "YOUCAM_API_KEY=your_key" > .dev.vars   # never commit this file
npm run preview                              # builds and serves on http://localhost:8787
```

## Deploy

```bash
npx wrangler login
npx wrangler kv namespace create USAGE      # put the id in wrangler.jsonc
npx wrangler secret put YOUCAM_API_KEY
npm run deploy
```

## License

MIT
