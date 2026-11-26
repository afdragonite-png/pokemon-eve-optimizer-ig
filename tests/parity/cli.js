// npm run parity                      -> prints a summary and writes tests/reports/parity-report.md
// npm run parity -- --n 20000 --seed 3
// npm run parity:baseline             -> also saves this run as the baseline the test suite ratchets against
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { generateScenarios, MOVE_COUNT } from './scenarios.js'
import { runSuite } from './compare.js'
import { renderReport } from './report.js'

const GEN_SUFFIX = process.env.PARITY_GEN && process.env.PARITY_GEN !== '9' ? `-gen${process.env.PARITY_GEN}` : ''
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt }
const flag = (name) => process.argv.includes(`--${name}`)
export const DEFAULTS = { n: 6000, seed: 1 }

export async function runParity({ n = DEFAULTS.n, seed = DEFAULTS.seed } = {}) {
  const t0 = Date.now()
  const report = await runSuite(generateScenarios(n, seed))
  const calcVersion = createRequire(import.meta.url)('@smogon/calc/package.json').version
  report.meta = { n, seed, movePool: MOVE_COUNT, calcVersion, seconds: +((Date.now() - t0) / 1000).toFixed(1) }
  return report
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('parity/cli.js')) {
  const n = Number(arg('n', DEFAULTS.n)), seed = Number(arg('seed', DEFAULTS.seed))
  const report = await runParity({ n, seed })
  const baselinePath = new URL('./baseline.json', import.meta.url)
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true })
  writeFileSync(new URL(`../reports/parity-report${GEN_SUFFIX}.md`, import.meta.url), renderReport(report, { baseline }))
  writeFileSync(new URL(`../reports/parity-report${GEN_SUFFIX}.json`, import.meta.url), JSON.stringify(report, null, 1))
  if (flag('update-baseline')) {
    const { worst, bareMisses, errorSamples, histogram, byMove, ...slim } = report
    writeFileSync(baselinePath, JSON.stringify(slim, null, 1))
    console.log('baseline saved')
  }
  console.log(`${report.compared} matchups in ${report.meta.seconds}s  |  all 16 rolls identical: ${report.exactPct}%  |  KO-threshold flips: ${report.anyFlipPct}%`)
  console.log('tiers:', JSON.stringify(report.tiers))
  console.log('report: tests/reports/parity-report.md')
}
