# Damage engine vs @smogon/calc

8,945 matchups compared (seed 4, 129 plain damaging moves, Gen 9, singles + doubles). Reference: @smogon/calc 0.12.0.

## Headline

| Tier | Matchups | All 16 rolls identical | KO threshold flips |
| --- | ---: | ---: | ---: |
| Bare (no items / abilities / field) | 2649 | 100% | 0% |
| Exactly one extra feature | 3613 | 100% | 0% |
| 2-3 features combined | 2683 | 100% | 0% |
| **All** | **8945** | **100%** | **0%** |

A "KO threshold flip" is a matchup where the two calculators disagree on how many of the 16 rolls KO, or on the fewest hits that could / must KO. By kind: OHKO roll count 0%, guaranteed N-hit KO 0%, possible N-hit KO 0%.

**Reading it:** the bare tier is the damage formula itself, so it shows the base maths is right. Everything that goes wrong is a modifier (item, ability, field) applied at a different stage or with different rounding from the game.

## Stat formulas

120,000 stat values checked; 8059 deviation(s), all of them NOT all known: Snorlax:hp, Nidoking:hp, Espeon:hp, Suicune:hp, Jigglypuff:hp, Quilava:hp, Horsea:hp, Jynx:hp, Voltorb:hp, Steelix:hp, Chinchou:hp, Kangaskhan:hp, Kingdra:hp, Girafarig:hp, Lugia:hp, Wobbuffet:hp, Arcanine:hp, Haunter:hp, Electrode:hp, Diglett:hp, Igglybuff:hp, Raikou:hp, Bulbasaur:hp, Flaaffy:hp, Golduck:hp, Togetic:hp, Tyrogue:hp, Delibird:hp, Dewgong:hp, Qwilfish:hp, Sandshrew:hp, Dugtrio:hp, Furret:hp, Tangela:hp, Heracross:hp, Porygon:hp, Wartortle:hp, Omastar:hp, Jumpluff:hp, Rattata:hp, Mew:hp, Ariados:hp, Eevee:hp, Ekans:hp, Rhydon:hp, Staryu:hp, Corsola:hp, Spinarak:hp, Phanpy:hp, Natu:hp, Porygon2:hp, Geodude:hp, Paras:hp, Kabuto:hp, Raichu:hp, Clefable:hp, Machoke:hp, Vaporeon:hp, Gengar:hp, Pidgeot:hp, Entei:hp, Seaking:hp, Persian:hp, Ditto:hp, Piloswine:hp, Raticate:hp, Hoppip:hp, Pidgey:hp, Blissey:hp, Larvitar:hp, Caterpie:hp, Nidoran-M:hp, Arbok:hp, Vileplume:hp, Venonat:hp, Ho-Oh:hp, Magby:hp, Growlithe:hp, Seel:hp, Teddiursa:hp, Onix:hp, Scyther:hp, Slugma:hp, Wooper:hp, Politoed:hp, Zapdos:hp, Dodrio:hp, Feraligatr:hp, Golbat:hp, Lanturn:hp, Poliwrath:hp, Magmar:hp, Donphan:hp, Sandslash:hp, Dragonair:hp, Koffing:hp, Oddish:hp, Vulpix:hp, Croconaw:hp, Ninetales:hp, Pichu:hp, Metapod:hp, Seadra:hp, Sneasel:hp, Murkrow:hp, Magnemite:hp, Ponyta:hp, Poliwag:hp, Ledian:hp, Wigglytuff:hp, Machop:hp, Goldeen:hp, Parasect:hp, Bellossom:hp, Charizard:hp, Magneton:hp, Farfetch’d:hp, Tentacruel:hp, Ampharos:hp, Stantler:hp, Houndoom:hp, Pinsir:hp, Ledyba:hp, Charmander:hp, Omanyte:hp, Mantine:hp, Mewtwo:hp, Celebi:hp, Gyarados:hp, Nidorina:hp, Cyndaquil:hp, Sunkern:hp, Skarmory:hp, Doduo:hp, Tentacool:hp, Flareon:hp, Cleffa:hp, Meganium:hp, Houndour:hp, Totodile:hp, Poliwhirl:hp, Smeargle:hp, Miltank:hp, Slowking:hp, Chikorita:hp, Chansey:hp, Krabby:hp, Graveler:hp, Fearow:hp, Bellsprout:hp, Dragonite:hp, Alakazam:hp, Golem:hp, Magcargo:hp, Elekid:hp, Azumarill:hp, Pupitar:hp, Shuckle:hp, Blastoise:hp, Cubone:hp, Hoothoot:hp, Grimer:hp, Bayleef:hp, Lickitung:hp, Muk:hp, Hypno:hp, Weedle:hp, Electabuzz:hp, Dunsparce:hp, Primeape:hp, Nidoran-F:hp, Ivysaur:hp, Magikarp:hp, Zubat:hp, Marowak:hp, Moltres:hp, Kingler:hp, Weepinbell:hp, Venusaur:hp, Slowpoke:hp, Kabutops:hp, Meowth:hp, Octillery:hp, Starmie:hp, Tauros:hp, Drowzee:hp, Gastly:hp, Spearow:hp, Pikachu:hp, Abra:hp, Scizor:hp, Forretress:hp, Misdreavus:hp, Aerodactyl:hp, Psyduck:hp, Sudowoodo:hp, Sentret:hp, Typhlosion:hp, Beedrill:hp, Exeggutor:hp, Skiploom:hp, Hitmonchan:hp, Articuno:hp, Clefairy:hp, Quagsire:hp, Pidgeotto:hp, Marill:hp, Remoraid:hp, Togepi:hp, Mareep:hp, Venomoth:hp, Charmeleon:hp, Machamp:hp, Snubbull:hp, Squirtle:hp, Cloyster:hp, Mr. Mime:hp, Nidoqueen:hp, Kadabra:hp, Rhyhorn:hp, Dratini:hp, Tyranitar:hp, Hitmontop:hp, Crobat:hp, Weezing:hp, Shellder:hp, Slowbro:hp, Hitmonlee:hp, Umbreon:hp, Lapras:hp, Gligar:hp, Ursaring:hp, Unown:hp, Xatu:hp, Gloom:hp, Swinub:hp, Smoochum:hp, Kakuna:hp, Pineco:hp, Yanma:hp, Granbull:hp, Jolteon:hp, Sunflora:hp, Aipom:hp, Exeggcute:hp, Victreebel:hp, Mankey:hp, Nidorino:hp, Noctowl:hp, Rapidash:hp, Butterfree:hp.

## Where the differences come from

Ranked on matchups with exactly one extra feature, so one feature's rate is not contaminated by another's. "Low / high" = share of the 16 rolls where the engine is below / above the reference.

| Feature | n | Mismatch | Engine low | Engine high | KO flips | Cause |
| --- | ---: | ---: | ---: | ---: | ---: | --- |

0 further features differ in under 4% of their matchups (mostly +/-1 rounding on single type-boost items, screens, crits and stat stages).

## Worst individual cases

| # | Direction | Move | You | Opponent | Lv | Features | Engine min-max | Reference min-max | HP |
| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |

## Against the saved baseline

| Metric | Baseline | Now |
| --- | ---: | ---: |
| bare exact % | 100 | 100 |
| single exact % | 100 | 100 |
| mixed exact % | 100 | 100 |
| KO threshold flips % | 0 | 0 |

## Known gaps this suite does not cover

- Multi-hit moves, Parental Bond, fixed-damage / OHKO moves and variable-power moves (Low Kick, Gyro Ball, ...) are not in the random sweep; the engine's own unit tests cover those.
- Moves the reference special-cases (Synchronoise, Revelation Dance, Thousand Arrows, Hidden Power (IV-typed), charge-turn boosts) are excluded. Flying Press and Freeze-Dry are in the sweep.
- Shedinja's HP is always 1 in the game; the engine computes it like any other Pokémon.
