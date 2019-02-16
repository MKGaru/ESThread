const { Thread } = require('../../') // user should be use  require('esthread')

const thread2a = new Thread((async function(v){
  let sum = 0
  for(let i=v;i>=0;i--){
    await new Promise(res=>setTimeout(res,1000))
    this.emit('count',i) // <-------------
    sum+=i
  }
  return sum
}))
thread2a.on('count',(n)=>console.info('progress:'+n))
thread2a.execute(10).then(n=>{
  console.log('result:'+n)
  thread2a.terminate()
})