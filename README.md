# Party Paths

Demokratiskt party-DnD — starta ett äventyr, dela sessionskoden, välj klass och rösta fram varje val tillsammans.

**Domän:** [partypaths.com](https://partypaths.com)

## Funktioner

- Starta nytt spel → få en fyrabokstavs **sessionskod**
- Andra går med via koden (gratis max 5, Party = obegränsat)
- Välj klass: Krigare, Magiker, Ranger, Tjuv, Klerk
- Kampanj **Shadows of Emberwood** — by, skog, orcher, trollkarl, drake
- Alla berättelse- och stridsval **röstas** (mest röster vinner; oavgjort → värdens röst)
- **Party-pass** via Stripe: hela kampanjen + fler spelare (24 h / 7 dagar)

## Kom igång

```bash
npm install
npm install --prefix client
npm run dev
```

Öppna [http://localhost:5173](http://localhost:5173) — API/socket körs på port `3001`.

## Produktion

### Railway (API + sockets) — Redis rekommenderas

1. Skapa tjänst från GitHub-repot (start: `npm start`).
2. **Lägg till Redis-plugin** i samma projekt.
3. Koppla `REDIS_URL` till API-tjänsten.
4. Sätt även:
   - `PUBLIC_APP_URL=https://partypaths.com`
   - `CORS_ORIGIN=https://partypaths.com,https://www.partypaths.com`
   - `STRIPE_SECRET_KEY=sk_live_…`
   - `STRIPE_WEBHOOK_SECRET=whsec_…` (webhook → `/api/stripe/webhook`)
5. Verifiera: `GET /api/health` → `persist.configured: true`.

Utan Redis försvinner Party-pass och rum vid restart. Alternativ: volume + `PARTYPATHS_DATA_DIR=/data`.

### Cloudflare (frontend)

1. Koppla custom domain `partypaths.com` / `www` (DNS redan hos Cloudflare).
2. Build command:

```bash
npm install && npm run build
```

3. Deploy:

```bash
npx wrangler deploy
```

Eller lokalt: `npm run deploy:cf`.

Sätt `VITE_SOCKET_URL` till din Railway-URL **före** client-build så Socket.io pekar rätt i produktion.

Socket.io-servern måste hostas separat (Railway) — Cloudflare serverar bara den statiska SPA:n.

### Node-server (API + sessioner)

```bash
npm run build
npm start
```

I produktion kan servern också servera `client/dist` om du kör allt på Railway utan Cloudflare.

## Stack

- React + Vite (klient)
- Express + Socket.io (realtid)
- Stripe Checkout (Party-pass)
- Redis (persistens)
- TypeScript
