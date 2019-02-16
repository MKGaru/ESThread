const { Thread } = require('../../') // user should be use  require('esthread')

const [thread3a,thread3b,thread3c] = new Thread(function(n){
	const fibonacci = require('./examples/nodejs/example7lib.js')
	return fibonacci(n)
}).clone(3)
thread3a.once(38).then(result=>console.log(result))
thread3b.once(40).then(result=>console.log(result))
thread3c.once(42).then(result=>console.log(result))
