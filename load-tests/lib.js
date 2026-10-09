'use strict'

const autocannon = require('autocannon')

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000'

function positiveInteger (name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

async function printMetricsSnapshot () {
  const url = `${baseUrl}/metrics`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Metrics request failed with ${response.status}`)
  const selected = (await response.text())
    .split('\n')
    .filter(line => /^(search_|ranking_|fuzzy_|index_|process_cpu|process_resident_memory)/.test(line))
  console.log(`\nMetrics snapshot: ${url}`)
  console.log(selected.join('\n'))
}

async function run (title, options) {
  const result = await autocannon({
    url: baseUrl,
    title,
    duration: positiveInteger('DURATION', 15, 3600),
    connections: positiveInteger('CONNECTIONS', 20, 10_000),
    pipelining: positiveInteger('PIPELINING', 1, 100),
    timeout: positiveInteger('TIMEOUT', 10, 300),
    ...options
  })
  console.log(autocannon.printResult(result))
  console.log(JSON.stringify({
    requestsPerSecond: result.requests.average,
    p50Ms: result.latency.p50,
    p95UpperBoundMs: result.latency.p97_5,
    p99Ms: result.latency.p99,
    errors: result.errors,
    non2xx: result.non2xx
  }, null, 2))
  await printMetricsSnapshot()
  if (result.errors > 0) process.exitCode = 1
  return result
}

module.exports = { baseUrl, positiveInteger, run }
