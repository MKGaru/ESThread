ESThread
==================
modern web worker threading library

[![npm version](https://badge.fury.io/js/esthread.svg)](https://badge.fury.io/js/esthread)

Usage
--------------------

browser 
```html
<script src="https://unpkg.com/esthread"></script>
<script>
// any task.
// const thread = new Thread(function(a,b){return a+b})
</script>
```

or esmodule

```html
<script type="module">
import Thread from 'https://unpkg.com/esthread/dist/thread.mjs'
// any task.
// const thread = new Thread(function(a,b){return a+b})
</script>
```

or npm module
```bash
npm install esthread --save
```

and

```javascript
import Thread from 'esthread'
// const thread = new Thread(function(a,b){return a+b})
```

### [Example1] Simple
```javascript
const thread = new Thread((a,b)=>a+b)
thread.execute(2,3).then(result=>console.log(result))
  .then(()=>thread.terminate())
  .catch(()=>thread.terminate())
```

### [Example2-a] with progress.
```javascript
const thread2a = new Thread((async function(v){
  let sum = 0
  for(let i=v;i>=0;i--){
    await new Promise(res=>setTimeout(res,1000))
    this.emit('count',i) // <-------------
    sum+=i
  }
  return sum
}))
thread2a.on('count',(n)=>console.info(n))
thread2a.execute(10).then(n=>{
  console.log(n)
  thread2a.terminate()
})
```

### [Example2-b] with progress.  if use arrow function task , can't modify this args. should use scoped emit function.
```javascript
// if use typescript: declare function emit(type:string,data?:any):void
const thread2b = new Thread((async (v)=>{
  let sum = 0
  for(let i=v;i>=0;i--){
    await new Promise(res=>setTimeout(res,1000))
    emit('count',i) // <------------
    sum+=i
  }
  return sum
}))
thread2b.on('count',(n)=>console.info(n))
thread2b.execute(10).then(n=>{
  console.log(n)
  thread2a.terminate()
})
```

### [Example3] cloned thread.
```javascript
// blocking slow function.
function fibonacci(n){
  return n<2 ? n : ( fibonacci(n-1) + fibonacci(n-2) )
}
const [thread3a,thread3b,thread3c] = new Thread(fibonacci).clone(3)
thread3a.once(40).then(result=>console.log(result))
thread3b.once(42).then(result=>console.log(result))
thread3c.once(44).then(result=>console.log(result))
```

### [Example4] transferable ArrayBuffer. like webworker.postMessage
```javascript
const thread4 = new Thread(buffer=>{
  buffer.set([192,168,10,3])
  return buffer
})
const input = new Uint32Array(256)
thread4.execute(input,[input.buffer]).then(output=>{
  // input was transfered. ( can not access from sender )
  console.log(output)
})
```

### [Example5] transferable OffscreenCanvas [[experimental technology](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)]
```javascript
const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
const renderer = new Thread((canvas)=>{
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgb(200, 0, 0)'
  ctx.fillRect(20, 30, 60, 40)
  ctx.commit()
})
const offscreen = canvas.transferControlToOffscreen() // NOTE: OffscreenCanvas required explicitly enable this feature 2018.3.
renderer.execute( offscreen , [offscreen] )
```

### [Example6] with other libraries
```javascript
async function learn(){
  // foo bar
}
const thread6 = new Thread(learn,['https://cdn.jsdelivr.net/npm/setimmediate@1.0.5/setImmediate.min.js'])
```
