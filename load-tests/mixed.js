'use strict'

const { run } = require('./lib')

const search = { method: 'GET', path: '/search?q=common&limit=20' }

run('mixed', {
  idReplacement: true,
  requests: [
    search,
    search,
    search,
    search,
    {
      method: 'POST',
      path: '/documents',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'mixed-[<id>]',
        title: 'Mixed workload',
        body: 'Common indexing and search traffic',
        tags: ['load-test']
      })
    }
  ]
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
