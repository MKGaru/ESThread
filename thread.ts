const Context = new WeakMap<Thread,{
	worker:Worker;
	src:string;
	/** The cloned thread references the same handler */
	handlers:{[key:string]:any[]},
	/** The cloned thread references the new handler */
	localHandlers:{[key:string]:any[]}
}>()
const referenceCount:{[src:string]:number} = {}
const THREAD_CLOSED_ERR = new Error('thread has been closed.')
const DUMMY_FUNCTION_FOR_CLONE = ()=>{}

declare const require
declare const ImageBitmap
declare const OffscreenCanvas
declare const global

interface EmitablePromise<T> extends Promise<T>{
	emit(type:string,args?:any,transferList?:any[])
	on(type:string,callback:Function)
}

const isBrowser = typeof window == 'object'
const getUniqueId:()=>string = (()=>{
	const history = new Set<string>()
	return ()=>{
		const id = Math.random().toString(16).slice(3) + Math.random().toString(16).slice(3)
		if(history.has(id)) return getUniqueId()
		history.add(id)
		return id
	}
})()

const WorkerHelper:(string)=>Worker = (src)=>{
	if (isBrowser){ 
		return new Worker(src)
	} else {
		const worker = new (typeof require == 'function' && require('worker_threads').Worker)(src,{eval:true})
		Object.defineProperties(worker,{
			'addEventListener': {
				value: (event:string,listener:Function)=> worker.on(event,listener) 
			},
			'removeEventListener': {
				value: (event:string,listener:Function)=> worker.off(event,listener) 
			}
		})
		return worker
	}
}
type DependType = string | (()=>void)
const DependHelper = (depend:DependType)=>{
	if(typeof depend == 'string') return depend
	let src = depend.toString()
	if(depend.prototype) { // function(){}
		src = src.slice(src.indexOf('{')+1,-1)
	}
	else { // arrow function () => {}
		src = src.slice(src.indexOf('>')+1)
	}
	return URL.createObjectURL(new Blob([src],{type:'text/javascript'}))
}

/**
 * Usage.
 * ------------------
 * Simple
   const thread = new Thread((a,b)=>a+b)
   thread.execute(2,3).then(result=>console.log(result))
     .then(()=>thread.terminate())
     .catch(()=>thread.terminate())
 *
 * With progress.
   const thread2 = new Thread((async (v)=>{
     let sum = 0
     for(let i=v;i>=0;i--){
       await new Promise(res=>setTimeout(res,1000))
	   emit('count',i)
	   sum+=i
	 }
	 return sum
   }))
   thread2.on('count',(n)=>console.info(n))
   thread2.execute(10).then(n=>console.log(n))

 * blocking thread.
   function fibonacci(n){
	 if(n<2) return n
     return fibonacci(n-1) + fibonacci(n-2)
   }
   const thread3 = new Thread(fibonacci)
   thread3.once(40).then(result=>console.log(result))
   thread3.clone().once(42).then(result=>console.log(result))
   thread3.clone().once(44).then(result=>console.log(result))
 */
export class Thread{
	constructor(task:(this:{emit:(event:string,..._args)=>void,on:(type:string,callback:Function)=>void,worker:Worker},...args)=>any,depends:DependType|DependType[]=[]){
		if(isBrowser){
			if(
				typeof Blob == 'undefined' ||
				typeof URL == 'undefined' ||
				typeof Worker == 'undefined'
			) throw new Error('this browser is not supported.')
		} else if(typeof require == 'function'){
			try {
				require('worker_threads').Worker
			} catch (e) {
				console.error('\n\u001b[1m\u001b[31m  --experimental-worker is not enabled.\u001b[0m\n')
				throw e
			}
		}
		if(task===DUMMY_FUNCTION_FOR_CLONE) return this

		if(!(depends instanceof Array)) depends = [depends]
		//postMessage(message,targetOrigin)
		let scripts = ''
		if(isBrowser) scripts += depends.map(depend=>`importScripts('${DependHelper(depend)}')`).join('\n')+'\n'
		else scripts += 
`
const { Worker,parentPort } = require('worker_threads')
const postMessage = (param,transferList)=>parentPort.postMessage({data:param},transferList)
let onmessage
parentPort.on('message',(param)=>onmessage({data:param}))
`
		scripts +=
`
const handlers = {}
onmessage = ((builder)=>async function(e){
	const param =  e.data
	const id = param.id
	const type = param.type
	if(type){
		if(id){
			if(handlers[id][type]){
				for(const handler of handlers[id][type]){
					handler(param.args)
				}
			}
		} else {
			for(const id in handlers){
				if(handlers[id][type]){
					for(const handler of handlers[id][type]){
						handler(param.args)
					}
				}
			}
		}
		return
	}
	if(!handlers[id]) handlers[id] = {}
	function emit(type,content,transferList){
		postMessage({
			id,
			type,
			content
		},transferList)
	}
	function on(type,callback){
		if(!handlers[id][type]) handlers[id][type] = []
		if(typeof callback == 'function')
			handlers[id][type].push(callback)
	}
	const task = builder(emit,on)
	try{
		const content = await task.apply({emit,on,worker:this}, param.args)
		const message = {
			id,
			type:'resolve',
			content
		}
		if(
			content &&
			typeof content =='object' &&
			(
				(typeof content.buffer == 'object' && content.buffer instanceof ArrayBuffer) ||
				(typeof ImageBitmap == 'function' && content instanceof ImageBitmap ) ||
				(typeof OffscreenCanvas == 'function' && content instanceof OffscreenCanvas ) ||
				(typeof MessagePort == 'function' && content instanceof MessagePort)
			)
		) postMessage(message,[content.buffer?content.buffer:content])
		else postMessage(message)
	}catch(e){
		postMessage({
			id,
			type:'error',
			content: e.toString()
		})
	}
})((emit,on)=>${task})`
		let src:string
		if(isBrowser){
			const blob = new Blob([scripts],{type:'text/javascript'})
			src = URL.createObjectURL(blob)
		} else {
			src = scripts
		}
		const worker = WorkerHelper(src)
		Context.set(this,{worker,src,handlers:{},localHandlers:{}})
		referenceCount[src]=1
	}
	/**
	 * execute task.
	 * @param args
	 */
	execute(...args){
		const thread = this
		const context = Context.get(this)
		const id = getUniqueId()

		if(!context) throw THREAD_CLOSED_ERR
		const {worker,handlers,localHandlers} = context

		const pointers = args.slice(-1)[0]
		const transferable  =
			args.length>=2 &&
			pointers instanceof Array &&
			!pointers.find(pointer=>!(
				pointer instanceof ArrayBuffer ||
				(typeof ImageBitmap == 'function' && pointer instanceof ImageBitmap ) ||
				(typeof OffscreenCanvas == 'function' && pointer instanceof OffscreenCanvas ) ||
				(typeof MessagePort == 'function' && pointer instanceof MessagePort)
			))

		if(transferable)
			worker.postMessage({id,args:args.slice(0,-1)},pointers)
		else
			worker.postMessage({id,args})

		const promise = new Promise(res=>{
			const onMessage = (e)=>{
				if(e.data.id && e.data.id!=id) return
				switch(e.data.type){
					case 'resolve':
						res(e.data.content)
						// worker.removeEventListener('message',onMessage) // DO NOT REMOVE AFTER RESOLVED.
						return
					case 'error':
						throw e.data.content
					default:
						if(handlers[e.data.type]){
							for(const handler of handlers[e.data.type]){
								handler(e.data.content)
							}
						}
						if(localHandlers[e.data.type]){
							for(const handler of localHandlers[e.data.type]){
								handler(e.data.content)
							}
						}
				}
			}
			worker.addEventListener('message',onMessage)
		})
		Object.defineProperty(promise,'emit',{
			value(type,args,transferList){
				worker.postMessage({id,type,args},transferList)
			}
		})
		Object.defineProperty(promise,'on',{
			value(type,callback){
				if(!localHandlers[type]) localHandlers[type] = []
				localHandlers[type].push(callback)
			}
		})
		return promise as EmitablePromise<any>
	}
	/**
	 * execute and terminate.
	 * @param args
	 */
	once(...args){
		return this.execute(...args)
			.then((data)=>{this.terminate();return data})
			.catch((e)=>{this.terminate();throw e})
	}
	/** terminate worker and revoke object. */
	terminate(){
		const context = Context.get(this)
		if(!context) return
		const {src,worker} = context
		referenceCount[src]--
		if(!referenceCount[src]){
			if(isBrowser) URL.revokeObjectURL(src)
			delete referenceCount[src]
		}
		worker.terminate()
		Context.delete(this)
	}
	/**
	 * add event handler to thread.
	 * @param type
	 * @param callback
	 */
	on(type:string,callback:Function){
		const context = Context.get(this)
		if(!context) throw THREAD_CLOSED_ERR
		if(!context.handlers[type]) context.handlers[type] = []
		context.handlers[type].push(callback)
	}
	/**
	 * remove event handler from thread.
	 * @param type
	 * @param callback
	 */
	off(type:string,callback:Function){
		const context = Context.get(this)
		if(!context) throw THREAD_CLOSED_ERR
		if(!context.handlers[type]) return
		const index = context.handlers[type].indexOf(callback)
		if(index>=0) context.handlers[type].splice(index,1)
	}
	/**
	 * emit event to thread.
	 * @param type 
	 * @param args 
	 * @param transferList 
	 */
	emit(type,args,transferList){
		const context = Context.get(this)

		if(!context) throw THREAD_CLOSED_ERR
		if(!type) return
		const {worker} = context
		worker.postMessage({type,args},transferList)
	}
	/** @returns return true if thread is terminated. */
	closed(){
		return !Context.has(this)
	}

	/** clone thread
	 * @returns {Thread} cloned thread.
	 */
	clone():Thread
	/** clone thread N times.
	 *  @returns {Thread[]} cloned threads with original thread. [original,clone1,clone2,...cloneN]
	 */
	clone(count:number):Thread[]
	clone(count?:number):Thread|Thread[]{
		const times = typeof count == 'number' ? count||2 : 2
		const threads:Thread[] = [this]
		for(let i=0;i<(times-1);i++){
			const thread = new Thread(DUMMY_FUNCTION_FOR_CLONE)
			const context = Context.get(this)
			if(!context) throw THREAD_CLOSED_ERR
			const {handlers,src} = context
			const localHandlers = {}
			const worker = WorkerHelper(src)
			Context.set(thread,{worker,src,handlers,localHandlers})
			referenceCount[src]++
			threads.push(thread)
		}
		return typeof count == 'number' ? threads : threads[1]
	}
}

export default Thread
