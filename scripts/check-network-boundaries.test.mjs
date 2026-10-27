import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkNetworkBoundaries } from './check-network-boundaries.mjs'

const write = async (root, relative, content) => {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

test('reports production network clients and proxy inference outside the boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'skills-hub-network-boundary-'))
  await write(
    root,
    'src-tauri/src/core/bypass.rs',
    [
      'reqwest::blocking::Client::builder();',
      'git2::FetchOptions::new();',
      'std::env::var("HTTPS_PROXY");',
    ].join('\n'),
  )

  const violations = await checkNetworkBoundaries(root)

  assert.deepEqual(
    violations.map(({ rule }) => rule),
    ['direct-http-client', 'remote-git-transport', 'proxy-environment'],
  )
})

test('allows transport primitives only in the central boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'skills-hub-network-boundary-'))
  const primitives = [
    'reqwest::blocking::Client::builder();',
    'git2::FetchOptions::new();',
    'std::env::var("HTTPS_PROXY");',
  ].join('\n')
  await write(root, 'src-tauri/src/core/network_proxy.rs', primitives)

  assert.deepEqual(await checkNetworkBoundaries(root), [])
})

test('a test-only item does not hide later production bypasses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'skills-hub-network-boundary-'))
  await write(
    root,
    'src-tauri/src/core/credentials.rs',
    [
      '#[cfg(test)]',
      'fn helper() {}',
      '#[cfg(test)]',
      'mod tests { const OPEN: &str = "{"; reqwest::blocking::Client::builder(); }',
      'fn refresh() { reqwest::blocking::Client::builder(); }',
    ].join('\n'),
  )

  assert.deepEqual(await checkNetworkBoundaries(root), [
    { rule: 'direct-http-client', file: 'src-tauri/src/core/credentials.rs', line: 4 },
    { rule: 'direct-http-client', file: 'src-tauri/src/core/credentials.rs', line: 5 },
  ])
})

test('reports common direct HTTP client construction variants and aliases', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'skills-hub-network-boundary-'))
  await write(
    root,
    'src-tauri/src/core/bypass.rs',
    [
      'use reqwest::blocking::Client as HttpClient;',
      'use git2::FetchOptions as NetOptions;',
      'ClientBuilder::new();',
      'Client::default();',
      'HttpClient::new();',
      'NetOptions::new();',
    ].join('\n'),
  )

  assert.deepEqual(
    (await checkNetworkBoundaries(root)).map(({ rule, line }) => [rule, line]),
    [
      ['direct-http-client', 3],
      ['direct-http-client', 4],
      ['direct-http-client', 5],
      ['remote-git-transport', 6],
    ],
  )
})
