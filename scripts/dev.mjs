// 本地调试启动器：同时运行 wrangler dev（API）与 vite（前端）
import { spawn } from 'node:child_process'

const procs = []
const colors = { api: '\x1b[36m', web: '\x1b[32m', reset: '\x1b[0m', dim: '\x1b[2m' }

function run(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
    shell: false,
  })
  const prefix = `${colors[name] || ''}[${name}]${colors.reset}`
  const pipe = (stream, out) => {
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (line.trim()) out.write(`${prefix} ${line}\n`)
      }
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    console.log(`${prefix} 退出，code=${code}`)
    shutdown()
  })
  procs.push(child)
  return child
}

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  for (const p of procs) { try { p.kill('SIGTERM') } catch {} }
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`${colors.dim}启动本地调试：API → http://127.0.0.1:8787，前端 → http://127.0.0.1:5180${colors.reset}`)
run('api', 'npx', ['wrangler', 'dev', '--port', '8787'])
setTimeout(() => run('web', 'npx', ['vite']), 2500)
