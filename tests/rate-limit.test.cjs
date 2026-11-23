const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/../dist/app.js','utf8');
const source=app.slice(app.indexOf('async function request('),app.indexOf('  async function search('));
function setup(responses){
 let now=100000, starts=[], reports=[];
 const context={cache:new Map(),AbortController,DOMException,setTimeout,clearTimeout,
 Date:class extends Date{static now(){return now}},
 pause:async(ms,signal)=>{if(signal.aborted)throw new DOMException('cancel','AbortError');now+=ms},
 status:text=>reports.push(text),localStorage:{getItem:()=>null,setItem:()=>{}},
 fetch:async()=>{starts.push(now);const next=responses.shift();if(next instanceof Error)throw next;return next}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {request:context.request,starts,reports};
}
const response=(code,header=null)=>({status:code,ok:code===200,headers:{get:()=>header},json:async()=>({ok:true})});
test('spaces fresh requests and serves cached lookups without requests',async()=>{
 const x=setup([response(200),response(200)]),s=new AbortController().signal;
 await x.request('/a',s);await x.request('/b',s);await x.request('/a',s);
 assert.deepEqual(x.starts,[100000,101000]);
});
test('429 respects Retry-After before retrying the same request',async()=>{
 const x=setup([response(429,'40'),response(200)]);
 await x.request('/a',new AbortController().signal);
 assert.deepEqual(x.starts,[100000,140000]);assert.equal(x.reports.length,1);
});
test('repeated rate limits back off and stop with a distinct error',async()=>{
 const x=setup(Array.from({length:4},()=>response(429)));
 await assert.rejects(x.request('/a',new AbortController().signal),e=>e.rateLimited===true);
 assert.deepEqual(x.starts,[100000,115000,145000,205000]);
});
test('cancelled lookup does not send a request',async()=>{
 const x=setup([]),c=new AbortController();c.abort();
 await assert.rejects(x.request('/a',c.signal),e=>e.name==='AbortError');
 assert.equal(x.starts.length,0);
});
