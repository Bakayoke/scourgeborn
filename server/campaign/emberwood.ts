import type { CampaignNode } from '../types.js'

/** Shadows of Emberwood — branching democratic campaign */
export const START_NODE = 'village'

/** Short free arc ends after orc path — redirects endings */
export const SHORT_END_NODES = new Set(['ending_orc_peace', 'ending_orc_victory', 'ending_orc_flee', 'ending_short'])

export const NODES: Record<string, CampaignNode> = {
  village: {
    id: 'village',
    title: { sv: 'Byn Asklunda', en: 'Ashgrove Village' },
    narrative: {
      sv: 'Rök stiger från Asklundas tak. Byborna viskar om orcher i Emberwood, en trollkarl i tornet, och en drake som vaknat i bergen. Äldsten ber er om hjälp.',
      en: 'Smoke rises over Ashgrove. Villagers whisper of orcs in Emberwood, a wizard in the tower, and a dragon stirring in the peaks. The elder begs for your help.',
    },
    choices: [
      {
        id: 'go_forest',
        text: { sv: 'Gå in i Emberwood efter orcherna', en: 'Enter Emberwood after the orcs' },
        next: 'forest_edge',
      },
      {
        id: 'go_tower',
        text: { sv: 'Sök upp trollkarlen i tornet', en: 'Seek the wizard in the tower' },
        next: 'tower_gate',
        effects: { flags: { sought_wizard: true } },
      },
      {
        id: 'ask_elder',
        text: { sv: 'Fråga äldsten om mer information', en: 'Ask the elder for more information' },
        next: 'elder_lore',
      },
    ],
  },

  elder_lore: {
    id: 'elder_lore',
    title: { sv: 'Äldstens berättelse', en: "The Elder's Tale" },
    narrative: {
      sv: 'Äldsten berättar att orcherna jagar en runsten som trollkarlen stal. Draken vaknade när runstenen lämnade berget. Kunskapen ger er ett övertag.',
      en: 'The elder says the orcs hunt a runestone the wizard stole. The dragon woke when the stone left the mountain. This knowledge gives you an edge.',
    },
    choices: [
      {
        id: 'to_forest',
        text: { sv: 'Jaga orcherna i skogen', en: 'Hunt the orcs in the forest' },
        next: 'forest_edge',
        effects: { flags: { elder_lore: true }, partyCunningBonus: 1 },
      },
      {
        id: 'to_tower',
        text: { sv: 'Konfrontera trollkarlen', en: 'Confront the wizard' },
        next: 'tower_gate',
        effects: { flags: { elder_lore: true, sought_wizard: true }, partyArcanaBonus: 1 },
      },
    ],
  },

  forest_edge: {
    id: 'forest_edge',
    title: { sv: 'Emberwoods kant', en: 'Edge of Emberwood' },
    narrative: {
      sv: 'Träden står tätt. Ni hör trummor och röster på orchiska. En patrull närmar sig — men det finns också en smal stig runt dem.',
      en: 'The trees stand thick. You hear drums and orcish voices. A patrol approaches — but a narrow path skirts around them.',
    },
    choices: [
      {
        id: 'ambush',
        text: { sv: 'Lägg bakhåll', en: 'Set an ambush' },
        next: 'orc_combat',
        favorStat: 'cunning',
        effects: { flags: { ambush: true } },
      },
      {
        id: 'negotiate',
        text: { sv: 'Förhandla under vit flagg', en: 'Negotiate under a white flag' },
        next: 'orc_talk',
      },
      {
        id: 'sneak',
        text: { sv: 'Smyg förbi patrullen', en: 'Sneak past the patrol' },
        next: 'orc_camp',
        favorStat: 'cunning',
        effects: { flags: { sneaked: true } },
      },
    ],
  },

  orc_talk: {
    id: 'orc_talk',
    title: { sv: 'Orchernas ledare', en: 'Orc Chieftain' },
    narrative: {
      sv: 'Orchhövdingen Grakka reser sin yxa men stannar. "Ge oss runstenen — eller dö. Trollkarlen stal den från vårt folk."',
      en: 'Chieftain Grakka raises her axe, then stops. "Give us the runestone — or die. The wizard stole it from our kin."',
    },
    choices: [
      {
        id: 'ally_orcs',
        text: { sv: 'Erbjud allians mot trollkarlen', en: 'Offer an alliance against the wizard' },
        next: 'orc_ally',
        effects: { flags: { orc_ally: true } },
      },
      {
        id: 'refuse',
        text: { sv: 'Vägra — ni tar runstenen själva', en: 'Refuse — you will take the stone yourselves' },
        next: 'orc_combat',
      },
      {
        id: 'bluff',
        text: { sv: 'Bluffa att ni redan har stenen', en: 'Bluff that you already have the stone' },
        next: 'orc_bluff',
        favorStat: 'cunning',
      },
    ],
  },

  orc_bluff: {
    id: 'orc_bluff',
    title: { sv: 'Bluffen', en: 'The Bluff' },
    narrative: {
      sv: 'Grakka stirrar. Om er slughet räcker drar de sig tillbaka mot tornet. Annars blir det strid.',
      en: 'Grakka stares. If your cunning holds, they fall back toward the tower. Otherwise, battle.',
    },
    choices: [
      {
        id: 'bluff_ok',
        text: { sv: 'Håll pokerfejs (slughet)', en: 'Hold the poker face (cunning)' },
        next: 'short_gate',
        effects: { flags: { bluffed_orcs: true, sought_wizard: true } },
      },
      {
        id: 'bluff_ok_full',
        text: { sv: 'Bluffa er vidare till tornet (Party)', en: 'Bluff onward to the tower (Party)' },
        next: 'tower_gate',
        effects: { flags: { bluffed_orcs: true, sought_wizard: true } },
      },
      {
        id: 'bluff_fail_fight',
        text: { sv: 'Dra vapen innan de avslöjar er', en: 'Draw weapons before they catch on' },
        next: 'orc_combat',
      },
    ],
  },

  orc_ally: {
    id: 'orc_ally',
    title: { sv: 'Blodsallians', en: 'Blood Alliance' },
    narrative: {
      sv: 'Grakka skrattar mörkt och spottar i handen. "Då marscherar vi mot tornet tillsammans. Men runstenen är vår."',
      en: 'Grakka laughs darkly and spits in her palm. "Then we march on the tower together. But the runestone is ours."',
    },
    choices: [
      {
        id: 'march_short',
        text: {
          sv: 'Fira alliansen och återvänd till byn',
          en: 'Celebrate the alliance and return to the village',
        },
        next: 'ending_orc_peace',
        effects: { flags: { orc_ally: true } },
      },
      {
        id: 'march',
        text: { sv: 'Marschera mot tornet (Party)', en: 'March on the tower (Party)' },
        next: 'tower_gate',
        effects: { flags: { orc_ally: true, sought_wizard: true }, partyMightBonus: 2 },
      },
    ],
  },

  orc_combat: {
    id: 'orc_combat',
    title: { sv: 'Orchpatrull!', en: 'Orc Patrol!' },
    narrative: {
      sv: 'Orcherna vrålar och stormar fram med yxor och trasiga sköldar. Demokratisk strid — rösta på ert drag!',
      en: 'The orcs roar and charge with axes and battered shields. Democratic combat — vote your move!',
    },
    combat: {
      enemy: {
        name: { sv: 'Orchpatrull', en: 'Orc Patrol' },
        hp: 28,
        attack: 6,
      },
      fleeNext: 'ending_orc_flee',
      winNext: 'orc_camp',
      loseNext: 'ending_defeat',
    },
  },

  orc_camp: {
    id: 'orc_camp',
    title: { sv: 'Orchlägret', en: 'Orc Camp' },
    narrative: {
      sv: 'I lägret hittar ni en karta till trollkarlstornet och en skadad bybo. Kartan visar också en grotta i bergen — drakens näste.',
      en: "In the camp you find a map to the wizard's tower and an injured villager. The map also shows a mountain cave — the dragon's lair.",
    },
    choices: [
      {
        id: 'help_villager',
        text: { sv: 'Hjälp bybon först', en: 'Help the villager first' },
        next: 'short_gate',
        effects: { hp: 8, flags: { saved_villager: true, has_map: true } },
      },
      {
        id: 'to_tower_map',
        text: { sv: 'Följ kartan till tornet', en: 'Follow the map to the tower' },
        next: 'short_gate',
        effects: { flags: { has_map: true, sought_wizard: true } },
      },
      {
        id: 'to_dragon_early',
        text: { sv: 'Gå direkt mot drakens grotta', en: "Go straight to the dragon's cave" },
        next: 'short_gate_dragon',
        effects: { flags: { has_map: true, rushed_dragon: true } },
      },
    ],
  },

  /** Free tier soft gate — short ending or continue if party */
  short_gate: {
    id: 'short_gate',
    title: { sv: 'Vägskäl', en: 'Crossroads' },
    narrative: {
      sv: 'Ni står vid skogens kant med kartan i hand. Den korta stigen hem väntar — eller den långa vägen mot trollkarlen, runstenen och draken.',
      en: 'You stand at the forest edge with the map in hand. The short path home awaits — or the long road to the wizard, the runestone, and the dragon.',
    },
    choices: [
      {
        id: 'end_short',
        text: {
          sv: 'Återvänd till byn som hjältar (kort slut)',
          en: 'Return to the village as heroes (short ending)',
        },
        next: 'ending_short',
      },
      {
        id: 'continue_full',
        text: {
          sv: 'Fortsätt mot tornet (kräver Party)',
          en: 'Continue to the tower (requires Party)',
        },
        next: 'tower_gate',
        effects: { flags: { sought_wizard: true } },
      },
    ],
  },

  short_gate_dragon: {
    id: 'short_gate_dragon',
    title: { sv: 'Bergstigen', en: 'Mountain Path' },
    narrative: {
      sv: 'Stigen mot draken är brant. Utan runstenen och mer kraft är det självmord — om ni inte har Party-pass till hela kampanjen.',
      en: 'The path to the dragon is steep. Without the runestone and more power it is suicide — unless you have a Party pass for the full campaign.',
    },
    choices: [
      {
        id: 'back_short',
        text: { sv: 'Vänd om till byn', en: 'Turn back to the village' },
        next: 'ending_short',
      },
      {
        id: 'push_dragon',
        text: { sv: 'Fortsätt mot draken (Party)', en: 'Press on to the dragon (Party)' },
        next: 'dragon_approach',
      },
    ],
  },

  tower_gate: {
    id: 'tower_gate',
    title: { sv: 'Trollkarlstornet', en: "Wizard's Tower" },
    narrative: {
      sv: 'Tornet lutar som en trasig tand. Blå eld brinner i fönstren. Porten är låst med en run-gåta: "Vad äter allt men blir aldrig mätt?"',
      en: 'The tower leans like a broken tooth. Blue fire burns in the windows. The gate is locked with a rune riddle: "What eats everything but is never full?"',
    },
    partyOnly: true,
    choices: [
      {
        id: 'riddle_time',
        text: { sv: 'Svara: Tiden', en: 'Answer: Time' },
        next: 'tower_hall',
        effects: { flags: { riddle_ok: true } },
      },
      {
        id: 'riddle_fire',
        text: { sv: 'Svara: Elden', en: 'Answer: Fire' },
        next: 'tower_trap',
      },
      {
        id: 'force_gate',
        text: { sv: 'Bryt upp porten med kraft', en: 'Force the gate open' },
        next: 'tower_hall',
        favorStat: 'might',
        effects: { hp: -4, flags: { forced_gate: true } },
      },
      {
        id: 'pick_lock',
        text: { sv: 'Dyrka upp låset', en: 'Pick the lock' },
        next: 'tower_hall',
        favorStat: 'cunning',
        effects: { flags: { picked_lock: true } },
      },
    ],
  },

  tower_trap: {
    id: 'tower_trap',
    title: { sv: 'Fel svar!', en: 'Wrong Answer!' },
    narrative: {
      sv: 'Runorna exploderar i gnistor. Ni tar skada men porten smäller upp ändå — trollkarlen skrattar inifrån.',
      en: 'The runes explode in sparks. You take damage but the gate slams open anyway — the wizard laughs from within.',
    },
    partyOnly: true,
    choices: [
      {
        id: 'enter_hurt',
        text: { sv: 'Gå in trots skadan', en: 'Enter despite the wounds' },
        next: 'tower_hall',
        effects: { hp: -6 },
      },
    ],
  },

  tower_hall: {
    id: 'tower_hall',
    title: { sv: 'Trollkarlens sal', en: "The Wizard's Hall" },
    narrative: {
      sv: 'Magikern Veylin håller runstenen över ett altare. "Hjälp mig binda draken — eller bli aska. Välj klokt."',
      en: 'Wizard Veylin holds the runestone over an altar. "Help me bind the dragon — or become ash. Choose wisely."',
    },
    partyOnly: true,
    choices: [
      {
        id: 'ally_wizard',
        text: { sv: 'Alliera er med Veylin', en: 'Ally with Veylin' },
        next: 'wizard_ally',
        effects: { flags: { wizard_ally: true } },
      },
      {
        id: 'steal_stone',
        text: { sv: 'Snu runstenen', en: 'Steal the runestone' },
        next: 'wizard_combat',
        favorStat: 'cunning',
        effects: { flags: { has_stone: true } },
      },
      {
        id: 'fight_wizard',
        text: { sv: 'Anfalla trollkarlen', en: 'Attack the wizard' },
        next: 'wizard_combat',
      },
      {
        id: 'give_orcs',
        text: { sv: 'Kräv stenen åt orcherna', en: 'Demand the stone for the orcs' },
        next: 'wizard_combat',
        requireFlag: 'orc_ally',
        effects: { flags: { demanded_for_orcs: true } },
      },
    ],
  },

  wizard_ally: {
    id: 'wizard_ally',
    title: { sv: 'Mörk pakt', en: 'Dark Pact' },
    narrative: {
      sv: 'Veylin ger er en skärva av runstenen. Tillsammans ska ni möta draken — men orcherna kommer att hata er om de får veta.',
      en: 'Veylin gives you a shard of the runestone. Together you will face the dragon — but the orcs will hate you if they learn of this.',
    },
    partyOnly: true,
    choices: [
      {
        id: 'to_dragon',
        text: { sv: 'Marschera mot drakens näste', en: "March to the dragon's lair" },
        next: 'dragon_approach',
        effects: { flags: { has_stone: true, wizard_ally: true }, partyArcanaBonus: 2 },
      },
    ],
  },

  wizard_combat: {
    id: 'wizard_combat',
    title: { sv: 'Veylins vrede', en: "Veylin's Wrath" },
    narrative: {
      sv: 'Blå blixtar slår mot väggarna. Trollkarlen sveper med staven — rösta fram ert drag!',
      en: 'Blue lightning cracks against the walls. The wizard sweeps his staff — vote your move!',
    },
    partyOnly: true,
    combat: {
      enemy: {
        name: { sv: 'Trollkarlen Veylin', en: 'Wizard Veylin' },
        hp: 36,
        attack: 8,
      },
      fleeNext: 'ending_coward',
      winNext: 'wizard_defeated',
      loseNext: 'ending_defeat',
    },
  },

  wizard_defeated: {
    id: 'wizard_defeated',
    title: { sv: 'Runstenen är er', en: 'The Runestone is Yours' },
    narrative: {
      sv: 'Veylin faller. Runstenen pulserar i era händer. Nu återstår bergen — och draken som vaknade när stenen togs.',
      en: 'Veylin falls. The runestone pulses in your hands. Now remain the mountains — and the dragon that woke when the stone was taken.',
    },
    partyOnly: true,
    choices: [
      {
        id: 'return_orcs',
        text: { sv: 'Ge stenen till orcherna', en: 'Give the stone to the orcs' },
        next: 'ending_orc_peace',
        requireFlag: 'orc_ally',
        effects: { flags: { returned_stone: true } },
      },
      {
        id: 'face_dragon',
        text: { sv: 'Bär stenen till draken', en: 'Carry the stone to the dragon' },
        next: 'dragon_approach',
        effects: { flags: { has_stone: true } },
      },
      {
        id: 'keep_power',
        text: { sv: 'Behåll stenen och gå hem', en: 'Keep the stone and go home' },
        next: 'ending_power',
        effects: { flags: { kept_stone: true } },
      },
    ],
  },

  dragon_approach: {
    id: 'dragon_approach',
    title: { sv: 'Drakens näste', en: "Dragon's Lair" },
    narrative: {
      sv: 'Värmen slår emot er. Ember, en ung elddrake, öppnar ett öga. "Ni bär det som togs från mitt berg."',
      en: 'Heat hits you like a wall. Ember, a young fire dragon, opens one eye. "You carry what was taken from my mountain."',
    },
    partyOnly: true,
    choices: [
      {
        id: 'return_stone_dragon',
        text: { sv: 'Lämna tillbaka runstenen', en: 'Return the runestone' },
        next: 'ending_dragon_peace',
        requireFlag: 'has_stone',
        effects: { flags: { dragon_peace: true } },
      },
      {
        id: 'bind_dragon',
        text: { sv: 'Försök binda draken (Veylins väg)', en: "Try to bind the dragon (Veylin's way)" },
        next: 'dragon_combat',
        requireFlag: 'wizard_ally',
        effects: { flags: { tried_bind: true } },
      },
      {
        id: 'slay_dragon',
        text: { sv: 'Utmana draken i strid', en: 'Challenge the dragon in battle' },
        next: 'dragon_combat',
      },
      {
        id: 'reason_dragon',
        text: { sv: 'Berätta sanningen om orcherna och Veylin', en: 'Tell the truth about the orcs and Veylin' },
        next: 'ending_dragon_peace',
        favorStat: 'arcana',
        effects: { flags: { dragon_truth: true } },
      },
    ],
  },

  dragon_combat: {
    id: 'dragon_combat',
    title: { sv: 'Embers eld', en: "Ember's Fire" },
    narrative: {
      sv: 'Draken lyfter och himlen blir orange. Detta är sista striden — rösta klokt!',
      en: 'The dragon rises and the sky turns orange. This is the final battle — vote wisely!',
    },
    partyOnly: true,
    combat: {
      enemy: {
        name: { sv: 'Draken Ember', en: 'Ember the Dragon' },
        hp: 48,
        attack: 10,
      },
      fleeNext: 'ending_coward',
      winNext: 'ending_dragon_slay',
      loseNext: 'ending_defeat',
    },
  },

  ending_short: {
    id: 'ending_short',
    title: { sv: 'Hjältar av Asklunda', en: 'Heroes of Ashgrove' },
    narrative: {
      sv: 'Byn firar er. Orchhotet är avvärjt för nu. Den längre sagan om trollkarlen och draken väntar — lås upp Party för hela Emberwood.',
      en: 'The village celebrates you. The orc threat is held for now. The longer tale of wizard and dragon awaits — unlock Party for all of Emberwood.',
    },
    ending: true,
  },

  ending_orc_flee: {
    id: 'ending_orc_flee',
    title: { sv: 'Flykten', en: 'The Retreat' },
    narrative: {
      sv: 'Ni flyr tillbaka till byn. Orcherna jublar. Asklunda överlever — men utan ära.',
      en: 'You flee back to the village. The orcs cheer. Ashgrove survives — but without glory.',
    },
    ending: true,
  },

  ending_orc_peace: {
    id: 'ending_orc_peace',
    title: { sv: 'Fred med orcherna', en: 'Peace with the Orcs' },
    narrative: {
      sv: 'Grakka tar emot runstenen. Orcherna lämnar Emberwood. Draken somnar om när stenen återvänder till berget via orchernas ritual.',
      en: 'Grakka receives the runestone. The orcs leave Emberwood. The dragon sleeps again when the stone returns to the mountain through orc ritual.',
    },
    ending: true,
  },

  ending_orc_victory: {
    id: 'ending_orc_victory',
    title: { sv: 'Seger i skogen', en: 'Victory in the Woods' },
    narrative: {
      sv: 'Orchpatrullen är besegrad. Byborna andas ut. En större skugga väntar fortfarande i bergen…',
      en: 'The orc patrol is defeated. Villagers exhale. A greater shadow still waits in the mountains…',
    },
    ending: true,
  },

  ending_dragon_peace: {
    id: 'ending_dragon_peace',
    title: { sv: 'Drakens vila', en: "Dragon's Rest" },
    narrative: {
      sv: 'Ember tar emot sanningen (eller stenen) och kröker sig kring berget igen. Emberwood tystnar. Ni blir legender.',
      en: 'Ember accepts the truth (or the stone) and coils around the mountain again. Emberwood falls quiet. You become legends.',
    },
    ending: true,
  },

  ending_dragon_slay: {
    id: 'ending_dragon_slay',
    title: { sv: 'Drakdödare', en: 'Dragonslayers' },
    narrative: {
      sv: 'Ember faller. Skatten glänser — men skogen sörjer. Ni vann med våld. Asklunda är säkert, till ett pris.',
      en: 'Ember falls. Treasure gleams — but the forest mourns. You won by force. Ashgrove is safe, at a cost.',
    },
    ending: true,
  },

  ending_power: {
    id: 'ending_power',
    title: { sv: 'Runstenens herrar', en: 'Lords of the Runestone' },
    narrative: {
      sv: 'Ni behåller stenen. Makten växer — och så gör avunden. Draken vrålar i fjärran. Historien är inte över.',
      en: 'You keep the stone. Power grows — and so does envy. The dragon roars in the distance. The story is not over.',
    },
    ending: true,
  },

  ending_coward: {
    id: 'ending_coward',
    title: { sv: 'Flykt från skuggan', en: 'Flight from Shadow' },
    narrative: {
      sv: 'Ni vänder ryggen åt faran. Emberwood förblir mörkt. Kanske en annan grupp vågar mer.',
      en: 'You turn your back on danger. Emberwood stays dark. Perhaps another party will dare more.',
    },
    ending: true,
  },

  ending_defeat: {
    id: 'ending_defeat',
    title: { sv: 'Fallet', en: 'The Fall' },
    narrative: {
      sv: 'Gruppen faller. Asklunda tänder sorgeeldar. Men legender dör sällan helt — prova igen!',
      en: 'The party falls. Ashgrove lights mourning fires. But legends rarely die completely — try again!',
    },
    ending: true,
  },
}

export function getNode(id: string): CampaignNode | null {
  return NODES[id] ?? null
}
