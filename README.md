# Scourgeborn

Kollektiv mörk fantasy-pest — spelarna är svärmen, AI:n styr De Goda. Rösta fram utbrott och mutationer innan botemedlet är klart.

**Domän:** [scourgeborn.com](https://scourgeborn.com)

## Funktioner (MVP)

- Starta nytt spel → fyrabokstavs **sessionskod**
- Värd på TV, spelare röstar på mobilen
- Gemensam pool av **korruptionspoäng**
- Karta med regioner som korruptas över tid
- Omröstning: utbrott, mutationer, sabotage, distraktioner
- AI-svar: karantän, forskning, attack mot Smittans hjärta
- Party-pass via Stripe (fler spelare / fler råd)

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
2. Lägg till Redis-plugin.
3. Koppla `REDIS_URL`.
4. Sätt även:
   - `PUBLIC_APP_URL=https://scourgeborn.com`
   - `CORS_ORIGIN=https://scourgeborn.com,https://www.scourgeborn.com`
   - Stripe-nycklar om Party-pass ska användas
5. Verifiera: `GET /api/health` → `persist.configured: true`.

### Cloudflare (frontend)

1. Koppla custom domain `scourgeborn.com` / `www`.
2. Build: `npm install && npm run build`
3. Deploy: `npx wrangler deploy` (eller `npm run deploy:cf`)

Sätt `VITE_SOCKET_URL` till Railway-URL **före** client-build.

## Stack

- React + Vite (klient)
- Express + Socket.io (realtid)
- Stripe Checkout (Party-pass)
- Redis (persistens)
- TypeScript
