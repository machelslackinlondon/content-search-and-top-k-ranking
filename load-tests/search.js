'use strict'

const { run } = require('./lib')

run('search-heavy', {
  requests: [{ method: 'GET', path: '/search?q=common&limit=20' }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
