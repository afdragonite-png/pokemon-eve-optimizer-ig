import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

// The sweep is generation-specific at import time, so each generation runs in its own process (PARITY_GEN via genCli).
describe.each([1, 2, 3, 4, 5, 6, 7, 8])('Gen %i damage engine vs @smogon/calc', (gen) => {
  it('matches the calc on a 10000-case sweep', () => {
    const out = execFileSync(process.execPath, ['tests/parity/genCli.js', '--gen', String(gen), '--n', '10000', '--seed', '4'], { encoding: 'utf8' })
    const m = out.match(/all 16 rolls identical: ([\d.]+)%/)
    expect(m, out).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThanOrEqual(99.9)
  })
})
