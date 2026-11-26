import { describe, it, expect } from 'vitest'
import { moveTypeMultiplier } from '../src/lib/goalResolver.js'
import { staticTypeMultiplier } from '../src/lib/typeChart.js'

const chart = async (moveType, types) => staticTypeMultiplier(moveType, types)
const mult = (move, type, defTypes, opts) => moveTypeMultiplier(move, type, defTypes, chart, opts)

describe('moveTypeMultiplier: moves the plain chart gets wrong', () => {
  it('Flying Press is Fighting and Flying at once', async () => {
    expect(await mult('flying-press', 'fighting', ['grass'])).toBe(2)          // Fighting 1 x Flying 2
    expect(await mult('flying-press', 'fighting', ['fighting'])).toBe(2)       // 1 x 2 (Flying hits Fighting x2)
    expect(await mult('flying-press', 'fighting', ['steel'])).toBe(1) // Fighting 2 x Flying 0.5
    expect(await mult('flying-press', 'fighting', ['bug'])).toBe(0.5 * 2)      // 0.5 x 2
    expect(await mult('flying-press', 'fighting', ['ghost'])).toBe(0)          // Fighting 0
    expect(await mult('flying-press', 'fighting', ['rock'])).toBe(1)           // 2 x 0.5
    expect(await mult('flying-press', 'fighting', ['flying'])).toBe(0.5)       // 0.5 x 1
  })
  it('Freeze-Dry is super effective on Water (and keeps the usual Ice chart elsewhere)', async () => {
    expect(await mult('freeze-dry', 'ice', ['water'])).toBe(2)
    expect(await mult('freeze-dry', 'ice', ['water', 'ground'])).toBe(4)
    expect(await mult('freeze-dry', 'ice', ['water', 'flying'])).toBe(4)
    expect(await mult('freeze-dry', 'ice', ['fire'])).toBe(0.5)
    expect(await mult('freeze-dry', 'ice', ['steel', 'water'])).toBe(1)
    expect(await mult('ice-beam', 'ice', ['water'])).toBe(0.5)
  })
  it('Gravity, a revealed Ghost, Ring Target and Iron Ball', async () => {
    expect(await mult('earthquake', 'ground', ['flying'])).toBe(0)
    expect(await mult('earthquake', 'ground', ['flying'], { gravity: true })).toBe(1)
    expect(await mult('earthquake', 'ground', ['flying'], { ironBall: true })).toBe(1)
    expect(await mult('close-combat', 'fighting', ['ghost'])).toBe(0)
    expect(await mult('close-combat', 'fighting', ['ghost'], { ghostRevealed: true })).toBe(1)
    expect(await mult('earthquake', 'ground', ['flying'], { ringTarget: true })).toBe(1)
  })
})
