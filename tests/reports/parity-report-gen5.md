# Damage engine vs @smogon/calc

9,762 matchups compared (seed 4, 281 plain damaging moves, Gen 9, singles + doubles). Reference: @smogon/calc 0.12.0.

## Headline

| Tier | Matchups | All 16 rolls identical | KO threshold flips |
| --- | ---: | ---: | ---: |
| Bare (no items / abilities / field) | 2870 | 100% | 0% |
| Exactly one extra feature | 3914 | 100% | 0% |
| 2-3 features combined | 2978 | 100% | 0% |
| **All** | **9762** | **100%** | **0%** |

A "KO threshold flip" is a matchup where the two calculators disagree on how many of the 16 rolls KO, or on the fewest hits that could / must KO. By kind: OHKO roll count 0%, guaranteed N-hit KO 0%, possible N-hit KO 0%.

**Reading it:** the bare tier is the damage formula itself, so it shows the base maths is right. Everything that goes wrong is a modifier (item, ability, field) applied at a different stage or with different rounding from the game.

## Stat formulas

120,000 stat values checked; 0 deviation(s), all of them known: Shedinja:hp (always 1 HP in the game).

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
