const {test}=require('node:test');
const assert=require('node:assert/strict');
global.Kartenwerk=require('../dist/core.js');
const Live=require('../dist/live.js');
function setup(responses){
 let now=100000;const starts=[],reports=[];
 const client=new Live({storage:null,now:()=>now,sleep:async(ms,signal)=>{if(signal.aborted)throw new DOMException('cancel','AbortError');now+=ms},report:text=>reports.push(text),fetch:async()=>{starts.push(now);const next=responses.shift();if(next instanceof Error)throw next;return next}});
 return {request:(p,s)=>client.request(p,s),starts,reports};
}
const response=(code,header=null)=>({status:code,ok:code===200,headers:{get:()=>header},json:async()=>({ok:true})});
test('spaces fresh requests and serves cached lookups without requests',async()=>{
 const x=setup([response(200),response(200)]),s=new AbortController().signal;
 await x.request('/a',s);await x.request('/b',s);await x.request('/a',s);assert.deepEqual(x.starts,[100000,101000]);
});
test('429 respects Retry-After before retrying the same request',async()=>{
 const x=setup([response(429,'40'),response(200)]);await x.request('/a',new AbortController().signal);assert.deepEqual(x.starts,[100000,140000]);assert.equal(x.reports.length,1);
});
test('repeated 429 responses wait at least 30 seconds, back off and stop',async()=>{
 const x=setup(Array.from({length:4},()=>response(429)));await assert.rejects(x.request('/a',new AbortController().signal),e=>e.rateLimited===true);assert.deepEqual(x.starts,[100000,130000,190000,310000]);
});
test('cancelled lookup does not send a request',async()=>{
 const x=setup([]),c=new AbortController();c.abort();await assert.rejects(x.request('/a',c.signal),e=>e.name==='AbortError');assert.equal(x.starts.length,0);
});
