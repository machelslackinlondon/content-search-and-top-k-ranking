'use strict'

const { run } = require('./lib')

run('fuzzy-dp', {
  requests: [{ method: 'GET', path: '/search?q=commom&limit=20&fuzzy=true' }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
