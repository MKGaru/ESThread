thread.js
==================
modern web worker threading library

Usage
--------------------

```javascript
// [Example1] Simple
const thread = new Thread((a,b)=>a+b)
thread.execute(2,3).then(result=>console.log(result))
  .then(()=>thread.terminate())
  .catch(()=>thread.terminate())

// [Example2-a] with progress.
const thread2a = new Thread((async function(v){
  let sum = 0
  for(let i=v;i>=0;i--){
    await new Promise(res=>setTimeout(res,1000))
    this.emit('count',i)
    sum+=i
  }
  return sum
}))
thread2a.on('count',(n)=>console.info(n))
thread2a.execute(10).then(n=>console.log(n))

// [Example2-b] with progress.  if use arrow function task , can't modify this args. should use scoped emit function.
// if use typescript: declare function emit(type:string,data?:any):void
const thread2b = new Thread((async (v)=>{
  let sum = 0
  for(let i=v;i>=0;i--){
    await new Promise(res=>setTimeout(res,1000))
    emit('count',i)
    sum+=i
  }
  return sum
}))
thread2b.on('count',(n)=>console.info(n))
thread2b.execute(10).then(n=>console.log(n))

// [Example3] cloned thread.
function fibonacci(n){
  return n<2 ? n : ( fibonacci(n-1) + fibonacci(n-2) )
}
const [thread3a,thread3b,thread3c] = new Thread(fibonacci).clone(3)
thread3a.once(40).then(result=>console.log(result))
thread3b.once(42).then(result=>console.log(result))
thread3c.once(44).then(result=>console.log(result))

// finaly.
thread.terminate()
```