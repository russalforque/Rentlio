import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

// Inspect tracked and new non-ignored files; never print a matching credential.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))]
const issues = []
const secrets = [
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /AKIA[A-Z0-9]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]
for (const file of files) {
  if (!existsSync(file)) continue // Intentional deletions in the working tree.
  if (/(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example') issues.push(`${file}: environment file is eligible for commit`)
  const bytes = readFileSync(file)
  if (bytes.includes(0)) continue
  const contents = bytes.toString('utf8')
  if (secrets.some(pattern => pattern.test(contents))) issues.push(`${file}: possible private credential`)
  for (const token of contents.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try {
      if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role === 'service_role') issues.push(`${file}: service-role JWT`)
    } catch { /* Not a decodable JWT. */ }
  }
  if (/^-- PostgreSQL database dump/m.test(contents)) issues.push(`${file}: database dump requires private-data review`)
}
const example = readFileSync('.env.example', 'utf8')
if (!example.includes('https://your-project-ref.supabase.co') || !example.includes('your-supabase-publishable-key')) issues.push('.env.example: expected placeholders only')
if (issues.length) {
  console.error(issues.join('\n'))
  process.exitCode = 1
} else console.log(`Release file scan passed (${files.length} candidate files; no private-key patterns or database dumps found).`)
