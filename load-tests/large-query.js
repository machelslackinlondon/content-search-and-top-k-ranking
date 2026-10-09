'use strict'

const { run } = require('./lib')

const query = `common${'-'.repeat(500)}`

run('large-query', {
  requests: [{ method: 'GET', path: `/search?q=${encodeURIComponent(query)}&limit=20` }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
