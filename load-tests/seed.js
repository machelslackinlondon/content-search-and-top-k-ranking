'use strict'

const { baseUrl, positiveInteger } = require('./lib')

const count = positiveInteger('SEED_COUNT', 1000, 1_000_000)
const batchSize = positiveInteger('SEED_BATCH_SIZE', 50, 100)
const waitTimeoutMs = positiveInteger('SEED_WAIT_TIMEOUT_MS', 60_000, 3_600_000)

function document (position) {
  const padded = String(position).padStart(6, '0')
  return {
    id: `load-${padded}`,
    title: position % 10 === 0 ? `Rare ranking term ${padded}` : `Common search content ${padded}`,
    body: `Node TypeScript indexing ranking common shard-${position % 20}`,
    tags: ['load-test', position % 2 === 0 ? 'even' : 'odd'],
    category: position % 3 === 0 ? 'article' : 'product',
    author: `author-${position % 25}`,
    popularity: position
  }
}

async function postBatch (documents) {
  while (true) {
    const response = await fetch(`${baseUrl}/documents/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documents })
    })
    if (response.status === 202) return
    if (response.status !== 429) {
      throw new Error(`Seed batch failed with ${response.status}: ${await response.text()}`)
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

async function main () {
  for (let start = 0; start < count; start += batchSize) {
    const documents = Array.from(
      { length: Math.min(batchSize, count - start) },
      (_, offset) => document(start + offset)
    )
    await postBatch(documents)
  }
  const deadline = Date.now() + waitTimeoutMs
  while (true) {
    const response = await fetch(`${baseUrl}/health`)
    if (!response.ok) throw new Error(`Health request failed with ${response.status}`)
    const health = await response.json()
    if (health.workers.failedJobs > 0) {
      throw new Error(`Seeding produced ${health.workers.failedJobs} permanent indexing failures`)
    }
    if (health.queue.depth === 0 && health.workers.active === 0) break
    if (Date.now() >= deadline) throw new Error('Timed out waiting for seed indexing to drain')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  console.log(`Indexed ${count} deterministic seed documents at ${baseUrl}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
