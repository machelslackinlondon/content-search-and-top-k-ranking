'use strict'

const { positiveInteger, run } = require('./lib')

const batchSize = positiveInteger('BATCH_SIZE', 100, 100)
const documents = Array.from({ length: batchSize }, (_, position) => ({
  id: `bulk-${position}-[<id>]`,
  title: 'Bulk workload',
  body: 'Measure batch admission and indexing throughput',
  tags: ['load-test']
}))

run('bulk-ingestion', {
  idReplacement: true,
  requests: [{
    method: 'POST',
    path: '/documents/bulk',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documents })
  }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
