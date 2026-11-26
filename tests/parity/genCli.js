// npm run parity:gen -- --gen 8 [--n 20000 --seed 3]   (the generation is read when the modules load, so this re-launches the CLI with PARITY_GEN set)
import { execFileSync } from 'node:child_process'
const args = process.argv.slice(2)
const i = args.indexOf('--gen')
const gen = i > -1 ? args.splice(i, 2)[1] : '9'
execFileSync(process.execPath, [new URL('./cli.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...args], { stdio: 'inherit', env: { ...process.env, PARITY_GEN: gen } })
