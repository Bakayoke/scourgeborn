# Scourgeborn

Real-time party lab game — cure patients before the timer runs out.

**Domän:** [scourgeborn.com](https://scourgeborn.com)

## Spel

- **Solo:** Alla stationer på en skärm — träna tempot själv
- **Party:** TV/laptop visar patienter och lobby, tre spelare styr Extraktor, Synthesizer och Inkubator på mobil
- **Mål:** Ge rätt vaccin till patienterna. Tre misslyckanden stänger labbet
- **Crafting:** RÖD+BLÅ → LILA → värme/kyla. GRÖN/GUL levereras direkt

Party funkar från **2 spelare** (värd + 1 på mobil). Med **4+ spelare** får tre personer en station var; vid färre hanterar lab-spelaren alla stationer på mobilen.

## Stack

- React + Vite (mobil-first klient)
- Express + Socket.io (realtid, Redis adapter)
- Redis per rum + pub/sub
- Railway (API) · Cloudflare (statisk frontend)

## Utveckling

```bash
npm install && npm install --prefix client
npm run dev
```

Socket-events: `create`, `join`, `startGame`, `extract`, `synthesize`, `incubate`, `send`, `deliver`, `ping`
