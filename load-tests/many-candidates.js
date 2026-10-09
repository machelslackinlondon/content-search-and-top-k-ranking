'use strict'

const { run } = require('./lib')

run('many-candidates', {
  requests: [{ method: 'GET', path: '/search?q=common&limit=100' }]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
