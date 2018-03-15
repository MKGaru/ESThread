const Context = new WeakMap();
const referenceCount = {};
const THREAD_CLOSED_ERR = new Error('thread has been closed.');
const DUMMY_FUNCTION_FOR_CLONE = () => { };
const getUniqueId = (() => {
    const history = new Set();
    return () => {
        const id = Math.random().toString(16).slice(3) + Math.random().toString(16).slice(3);
        if (history.has(id))
            return getUniqueId();
        history.add(id);
        return id;
    };
})();
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
export default class Thread {
    constructor(task, depends = []) {
        if (typeof Blob == 'undefined' ||
            typeof URL == 'undefined' ||
            typeof Worker == 'undefined')
            throw new Error('this browser is not supported.');
        if (task === DUMMY_FUNCTION_FOR_CLONE)
            return this;
        if (!(depends instanceof Array))
            depends = [depends];
        //postMessage(message,targetOrigin)
        let scripts = '';
        scripts += depends.map(depend => `importScripts('${depend}')`).join('\n') + '\n';
        scripts +=
            `
onmessage = ((builder)=>async function(e){
	const param =  e.data
	const id = param.id
	function emit(type,content){
		postMessage({
			id,
			type,
			content
		})
	}
	const task = builder(emit)
	try{
		const content = await task.apply({emit,worker:this}, param.args)
		const message = {
			id,
			type:'resolve',
			content
		}
		if(
			content &&
			typeof content =='object' &&
			(
				(typeof content.buffer == 'object' &&
				 content.buffer instanceof ArrayBuffer) ||
				(typeof ImageBitmap == 'function' && content instanceof ImageBitmap ) ||
				(typeof OffscreenCanvas == 'function' && content instanceof OffscreenCanvas )
			)
		) postMessage(message,[content.buffer])
		else postMessage(message)
	}catch(e){
		postMessage({
			id,
			type:'error',
			content: e.toString()
		})
	}
})(emit=>${task})`;
        const blob = new Blob([scripts], { type: 'text/javascript' });
        const src = URL.createObjectURL(blob);
        const worker = new Worker(src);
        Context.set(this, { worker, src, handlers: {} });
        referenceCount[src] = 1;
    }
    /**
     * execute task.
     * @param args
     */
    execute(...args) {
        const context = Context.get(this);
        const id = getUniqueId();
        if (!context)
            throw THREAD_CLOSED_ERR;
        const { worker, handlers } = context;
        const pointers = args.slice(-1)[0];
        const transferable = args.length >= 2 &&
            pointers instanceof Array &&
            !pointers.find(pointer => !(pointer instanceof ArrayBuffer ||
                (typeof ImageBitmap == 'function' && pointer instanceof ImageBitmap) ||
                (typeof OffscreenCanvas == 'function' && pointer instanceof OffscreenCanvas)));
        if (transferable)
            worker.postMessage({ id, args: args.slice(0, -1) }, pointers);
        else
            worker.postMessage({ id, args });
        return new Promise(res => {
            const onMessage = (e) => {
                if (e.data.id != id)
                    return;
                switch (e.data.type) {
                    case 'resolve':
                        res(e.data.content);
                        worker.removeEventListener('message', onMessage);
                        return;
                    case 'error':
                        throw e.data.content;
                    default:
                        if (handlers[e.data.type]) {
                            for (const handler of handlers[e.data.type]) {
                                handler(e.data.content);
                            }
                        }
                }
            };
            worker.addEventListener('message', onMessage);
        });
    }
    /**
     * execute and terminate.
     * @param args
     */
    once(...args) {
        return this.execute(...args)
            .then((data) => { this.terminate(); return data; })
            .catch((e) => { this.terminate(); throw e; });
    }
    /** terminate worker and revoke object. */
    terminate() {
        const context = Context.get(this);
        if (!context)
            return;
        const { src, worker } = context;
        referenceCount[src]--;
        if (!referenceCount[src]) {
            URL.revokeObjectURL(src);
            delete referenceCount[src];
        }
        worker.terminate();
        Context.delete(this);
    }
    /**
     * add event handler to thread.
     * @param type
     * @param callback
     */
    on(type, callback) {
        const context = Context.get(this);
        if (!context)
            throw THREAD_CLOSED_ERR;
        if (!context.handlers[type])
            context.handlers[type] = [];
        context.handlers[type].push(callback);
    }
    /**
     * remove event handler from thread.
     * @param type
     * @param callback
     */
    off(type, callback) {
        const context = Context.get(this);
        if (!context)
            throw THREAD_CLOSED_ERR;
        if (!context.handlers[type])
            return;
        const index = context.handlers[type].indexOf(callback);
        if (index >= 0)
            context.handlers[type].splice(index, 1);
    }
    /** @returns return true if thread is terminated. */
    closed() {
        return !Context.has(this);
    }
    clone(count) {
        const times = typeof count == 'number' ? count || 2 : 2;
        const threads = [this];
        for (let i = 0; i < (times - 1); i++) {
            const thread = new Thread(DUMMY_FUNCTION_FOR_CLONE);
            const context = Context.get(this);
            if (!context)
                throw THREAD_CLOSED_ERR;
            const { handlers, src } = context;
            const worker = new Worker(src);
            Context.set(thread, { worker, src, handlers });
            referenceCount[src]++;
            threads.push(thread);
        }
        return typeof count == 'number' ? threads : threads[1];
    }
}
