# Scourgeborn

Real-time ritual chaos + social deduction — håll matrisen vid liv medan smittan väljer sina förrädare.

**Domän:** [scourgeborn.com](https://scourgeborn.com)

## Spel

- **Solo:** Hantera alla ritualverktyg själv — överlev så länge som möjligt
- **Multi:** Synka tidskritiska uppgifter på mobilen; efter ~2 min utses Scourgeborn
- **Nödröstning:** Försegl misstänkt eller hoppa över
- **Seger:** 5 cykler (multi) · **Förlust:** matrishälsa = 0

## Stack

- React + Vite (mobil-first klient)
- Express + Socket.io (realtid, Redis adapter)
- Redis HASH / SET / LIST per rum + pub/sub
- Railway (API) · Cloudflare (statisk frontend)

## Utveckling

```bash
npm install && npm install --prefix client
npm run dev
```

Socket-events: `create`, `join`, `startGame`, `ritualTool`, `acknowledgeAffliction`, `callCleansingRite`, `cleansingVote`
