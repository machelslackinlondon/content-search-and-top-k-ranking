'use strict'

const { run } = require('./lib')

run('index-heavy', {
  idReplacement: true,
  requests: [{
    method: 'POST',
    path: '/documents',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'index-[<id>]',
      title: 'Index workload',
      body: 'Measure asynchronous indexing throughput and queue pressure',
      tags: ['load-test']
    })
  }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
