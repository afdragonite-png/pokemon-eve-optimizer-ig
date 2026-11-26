import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// The sweep is generation-specific at import time, so Gen 8 runs in its own process (PARITY_GEN=8).
describe('Gen 8 damage engine vs @smogon/calc', () => {
  it('matches the calc on a 12000-case sweep', () => {
    const out = execFileSync(process.execPath, ['tests/parity/genCli.js', '--gen', '8', '--n', '12000', '--seed', '4'], { encoding: 'utf8' })
    const m = out.match(/all 16 rolls identical: ([\d.]+)%/)
    expect(m, out).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThanOrEqual(99.9)
  })
})
