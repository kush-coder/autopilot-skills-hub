import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC_RULES = [
  {
    rule: 'proxy-environment',
    pattern: /std::env::var\s*\(\s*"(?:HTTP|HTTPS|ALL|NO)_PROXY"/i,
  },
]

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const namesWithAliases = (source, names) => {
  const aliases = [...names]
  const sourceNames = names.map(escapePattern).join('|')
  const aliasPattern = new RegExp(`\\b(?:${sourceNames})\\s+as\\s+([A-Za-z_]\\w*)`, 'g')
  for (const match of source.matchAll(aliasPattern)) {
    aliases.push(match[1])
  }
  return aliases.map(escapePattern).join('|')
}

const httpClientPattern = (source) => {
  const constructors = namesWithAliases(source, ['Client', 'ClientBuilder'])
  return new RegExp(
    `\\b(?:(?:reqwest(?:::blocking)?::)?(?:${constructors}))::(?:builder|new|default)\\s*\\(`,
  )
}

const remoteGitPattern = (source) => {
  const constructors = namesWithAliases(source, ['FetchOptions', 'PushOptions'])
  const repositories = namesWithAliases(source, ['Repository'])
  return new RegExp(
    `\\b(?:(?:git2::)?(?:${constructors})::new|(?:git2::)?(?:${repositories})::clone)\\s*\\(`,
  )
}

/*
 * Test code follows the same construction boundary as production code. This keeps
 * the guard conservative and avoids trying to parse Rust syntax with line heuristics.
 */

const collectRustFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectRustFiles(target)))
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      files.push(target)
    }
  }
  return files
}

export const checkNetworkBoundaries = async (rootDir) => {
  const sourceRoot = path.join(rootDir, 'src-tauri', 'src')
  const files = await collectRustFiles(sourceRoot)
  const violations = []
  for (const file of files.sort()) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/')
    if (relative === 'src-tauri/src/core/network_proxy.rs') {
      continue
    }
    const source = await readFile(file, 'utf8')
    const lines = source.split('\n')
    const rules = [
      { rule: 'direct-http-client', pattern: httpClientPattern(source) },
      { rule: 'remote-git-transport', pattern: remoteGitPattern(source) },
      ...STATIC_RULES,
    ]
    for (let index = 0; index < lines.length; index += 1) {
      for (const { rule, pattern } of rules) {
        if (pattern.test(lines[index])) {
          violations.push({ rule, file: relative, line: index + 1 })
        }
      }
    }
  }
  return violations
}

const main = async () => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const violations = await checkNetworkBoundaries(rootDir)
  if (violations.length === 0) {
    console.log('Network boundary check passed.')
    return
  }
  console.error('Network boundary violations:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}]`)
  }
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
