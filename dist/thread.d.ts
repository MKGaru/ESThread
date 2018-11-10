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
    constructor(task: (this: {
        emit: (event: string, ..._args) => void;
        worker: Worker;
    }, ...args) => any, depends?: string | string[]);
    /**
     * execute task.
     * @param args
     */
    execute(...args: any[]): Promise<{}>;
    /**
     * execute and terminate.
     * @param args
     */
    once(...args: any[]): Promise<{}>;
    /** terminate worker and revoke object. */
    terminate(): void;
    /**
     * add event handler to thread.
     * @param type
     * @param callback
     */
    on(type: string, callback: Function): void;
    /**
     * remove event handler from thread.
     * @param type
     * @param callback
     */
    off(type: string, callback: Function): void;
    /** @returns return true if thread is terminated. */
    closed(): boolean;
    /** clone thread
     * @returns {Thread} cloned thread.
     */
    clone(): Thread;
    /** clone thread N times.
     *  @returns {Thread[]} cloned threads with original thread. [original,clone1,clone2,...cloneN]
     */
    clone(count: number): Thread[];
}
