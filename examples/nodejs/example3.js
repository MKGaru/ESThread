const { Thread } = require('../../') // user should be use  require('esthread')

function fibonacci(n){
  return n<2 ? n : ( fibonacci(n-1) + fibonacci(n-2) )
}
const [thread3a,thread3b,thread3c] = new Thread(fibonacci).clone(3)
thread3a.once(38).then(result=>console.log(result))
thread3b.once(40).then(result=>console.log(result))
thread3c.once(42).then(result=>console.log(result))
