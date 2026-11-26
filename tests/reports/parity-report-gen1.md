# Damage engine vs @smogon/calc

9,136 matchups compared (seed 4, 81 plain damaging moves, Gen 9, singles + doubles). Reference: @smogon/calc 0.12.0.

## Headline

| Tier | Matchups | All 16 rolls identical | KO threshold flips |
| --- | ---: | ---: | ---: |
| Bare (no items / abilities / field) | 2765 | 100% | 0% |
| Exactly one extra feature | 3571 | 100% | 0% |
| 2-3 features combined | 2800 | 100% | 0% |
| **All** | **9136** | **100%** | **0%** |

A "KO threshold flip" is a matchup where the two calculators disagree on how many of the 16 rolls KO, or on the fewest hits that could / must KO. By kind: OHKO roll count 0%, guaranteed N-hit KO 0%, possible N-hit KO 0%.

**Reading it:** the bare tier is the damage formula itself, so it shows the base maths is right. Everything that goes wrong is a modifier (item, ability, field) applied at a different stage or with different rounding from the game.

## Stat formulas

120,000 stat values checked; 8186 deviation(s), all of them NOT all known: Magneton:hp, Haunter:hp, Kabuto:hp, Kabutops:hp, Jynx:hp, Nidoran-F:hp, Koffing:hp, Voltorb:hp, Jigglypuff:hp, Pidgeotto:hp, Vileplume:hp, Charmeleon:hp, Weedle:hp, Cubone:hp, Kadabra:hp, Mr. Mime:hp, Raichu:hp, Persian:hp, Tentacool:hp, Golbat:hp, Drowzee:hp, Meowth:hp, Butterfree:hp, Kakuna:hp, Mew:hp, Abra:hp, Ekans:hp, Poliwhirl:hp, Magnemite:hp, Charmander:hp, Fearow:hp, Marowak:hp, Ninetales:hp, Shellder:hp, Starmie:hp, Nidoking:hp, Seel:hp, Poliwag:hp, Ditto:hp, Aerodactyl:hp, Kangaskhan:hp, Mewtwo:hp, Tentacruel:hp, Paras:hp, Pidgey:hp, Electabuzz:hp, Mankey:hp, Alakazam:hp, Wigglytuff:hp, Horsea:hp, Hitmonchan:hp, Cloyster:hp, Squirtle:hp, Hypno:hp, Onix:hp, Vulpix:hp, Pinsir:hp, Zubat:hp, Golem:hp, Primeape:hp, Dodrio:hp, Goldeen:hp, Hitmonlee:hp, Geodude:hp, Arcanine:hp, Gastly:hp, Golduck:hp, Slowbro:hp, Nidoqueen:hp, Gloom:hp, Metapod:hp, Beedrill:hp, Zapdos:hp, Exeggutor:hp, Venomoth:hp, Rhyhorn:hp, Parasect:hp, Articuno:hp, Exeggcute:hp, Snorlax:hp, Dragonair:hp, Blastoise:hp, Magikarp:hp, Seadra:hp, Growlithe:hp, Tauros:hp, Sandshrew:hp, Pikachu:hp, Diglett:hp, Rattata:hp, Arbok:hp, Dugtrio:hp, Machoke:hp, Pidgeot:hp, Doduo:hp, Jolteon:hp, Eevee:hp, Vaporeon:hp, Wartortle:hp, Bellsprout:hp, Poliwrath:hp, Dratini:hp, Psyduck:hp, Chansey:hp, Sandslash:hp, Scyther:hp, Bulbasaur:hp, Graveler:hp, Clefairy:hp, Seaking:hp, Machamp:hp, Ponyta:hp, Dewgong:hp, Nidoran-M:hp, Lapras:hp, Moltres:hp, Kingler:hp, Caterpie:hp, Rapidash:hp, Nidorino:hp, Krabby:hp, Flareon:hp, Clefable:hp, Nidorina:hp, Ivysaur:hp, Oddish:hp, Machop:hp, Tangela:hp, Grimer:hp, Weepinbell:hp, Venusaur:hp, Raticate:hp, Lickitung:hp, Muk:hp, Slowpoke:hp, Farfetch’d:hp, Rhydon:hp, Omastar:hp, Spearow:hp, Porygon:hp, Gyarados:hp, Staryu:hp, Weezing:hp, Gengar:hp, Victreebel:hp, Dragonite:hp, Charizard:hp, Venonat:hp, Omanyte:hp, Electrode:hp, Magmar:hp.

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
