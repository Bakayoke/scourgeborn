# Scourgeborn

Mobil-first social deduction i mörk fantasy — några bär pesten i blodet. Tre lyckade expeditioner eller tre sabotage avgör allt.

**Domän:** [scourgeborn.com](https://scourgeborn.com)

## Funktioner

- Skapa spel → fyrabokstavs **sessionskod**
- 5+ spelare, hemliga roller (Oskuldig / Scourgeborn)
- Expeditionsledare väljer partner → alla röstar Ja/Nej
- Uppdragsteam röstar Rensa/Smitta i hemlighet
- Party-pass via Stripe (fler spelare)

## Kom igång

```bash
npm install
npm install --prefix client
npm run dev
```

Öppna [http://localhost:5173](http://localhost:5173) — API/socket körs på port `3001`.

## Stack

- React + Vite (klient)
- Express + Socket.io (realtid)
- Redis (persistens)
- Stripe Checkout (Party-pass)
- TypeScript

## Produktion

Se tidigare README-sektioner för Railway + Cloudflare deploy. Socket-händelser: `create`, `join`, `startGame`, `revealRole`, `proposeTeam`, `voteTeam`, `voteMission`, `ackResolution`.
