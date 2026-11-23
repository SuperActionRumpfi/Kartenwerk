const {test}=require('node:test');
const assert=require('node:assert/strict');
global.Kartenwerk=require('../dist/core.js');
const Catalogue=require('../dist/catalogue.js');
const manifest={schema:1,shards:64,version:'1234567890abcdef'};
const card=(id,lang)=>({id,lang,name:'Sol Ring',printed_name:lang==='de'?'Sonnenring':'Sol Ring',set:'test',set_name:'Fixture',collector_number:'1',image_uris:{normal:'https://example.invalid/card.jpg'}});
function client(names,groups){
 const c=new Catalogue();c.urls=[];
 c.json=async function(path,signal){if(signal.aborted)throw new DOMException('cancel','AbortError');this.urls.push(path);if(path==='manifest.json')return manifest;if(path.endsWith('/names.json'))return names;return groups};return c;
}
test('English and German names match one catalogue identity without Scryfall',async()=>{
 const c=client({'sol ring':['oracle-one'],sonnenring:['oracle-one']},{'oracle-one':[card('en','en'),card('de','de')]});
 const entries=Kartenwerk.parseDeck('1 Sol Ring\n2 Sonnenring').entries,rows=[];
 await c.resolveAll(entries,false,new AbortController().signal,(i,row)=>rows[i]=row);
 assert.deepEqual(rows.map(r=>r.selected),['de','de']);assert.equal(c.urls.length,3);assert.equal(rows[1].quantity,2);
});
test('English fallback is opt-in; missing and ambiguous names stay unresolved',async()=>{
 const c=client({'sol ring':['one'],ambiguous:['one','two']},{one:[card('en','en')]});
 const entry=Kartenwerk.parseDeck('1 Sol Ring').entries;let result;
 await c.resolveAll(entry,false,new AbortController().signal,(i,r)=>result=r);assert.equal(result.selected,null);
 await c.resolveAll(entry,true,new AbortController().signal,(i,r)=>result=r);assert.equal(result.selected,'en');assert.equal(result.fallback,true);
 const rows=[];await c.resolveAll(Kartenwerk.parseDeck('1 Missing\n1 Ambiguous').entries,true,new AbortController().signal,(i,r)=>rows[i]=r);
 assert.ok(rows.every(r=>r.selected===null));assert.match(rows[1].error,/mehrdeutig/);
});
test('aborting catalogue lookup does not resolve cards',async()=>{
 const c=client({},{}),control=new AbortController();control.abort();
 await assert.rejects(c.resolveAll([],false,control.signal,()=>{}),e=>e.name==='AbortError');
});
test('default catalogue resolves a deck without loading edition shards',async()=>{
 const c=new Catalogue();const urls=[];
 c.json=async(path)=>{urls.push(path);if(path==='manifest.json')return {...manifest,defaults:true};if(path.endsWith('names.json'))return {'sol ring':['oracle-one']};if(path.endsWith('defaults.json'))return {'oracle-one':card('de','de')};throw new Error('Unexpected edition shard fetch')};
 let row;await c.resolveAll(Kartenwerk.parseDeck('1 Sol Ring').entries,false,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,'de');assert.equal(row._editionsLoaded,false);assert.equal(urls.length,3);
});
test('full card name wins over an identically named face of another card',async()=>{
 const c=new Catalogue();
 c.json=async(path)=>{
  if(path==='manifest.json')return {...manifest,defaults:true};
  if(path.endsWith('names.json'))return {'sol ring':['normal','double']};
  if(path.endsWith('defaults.json'))return {normal:card('de','de'),double:{...card('other','en'),name:'Sol Ring // Sol Ring',printed_name:undefined}};
  throw new Error('Unexpected shard');
 };
 let row;await c.resolveAll(Kartenwerk.parseDeck('1 Sol Ring').entries,false,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,'de');
});
test('set and collector number distinguish same-name tokens across identities',async()=>{
 const robot=(id,set,number)=>({...card(id,'en'),name:'Robot',set,collector_number:number});
 const c=client({robot:['three','other']},{three:[robot('3/3','t40k','23')],other:[robot('different','tpip','16')]});
 let row;
 await c.resolveAll(Kartenwerk.parseDeck('1 Robot (T40K) 23').entries,true,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,'3/3');assert.equal(row.mismatch,false);
 await c.resolveAll(Kartenwerk.parseDeck('1 Robot (T40K) 23').entries,false,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,null); // English fallback remains explicit.
 await c.resolveAll(Kartenwerk.parseDeck('1 Robot').entries,true,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,null);assert.match(row.error,/Set-Code/);
 await c.resolveAll(Kartenwerk.parseDeck('1 Robot (T40K) 99').entries,true,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,null); // Never silently choose another token type.
});
test('a set alone stays ambiguous when different tokens share the same set',async()=>{
 const c=client({spirit:['one','two']},{one:[{...card('one','en'),set:'abc',collector_number:'1'}],two:[{...card('two','en'),set:'abc',collector_number:'2'}]});
 let row;await c.resolveAll(Kartenwerk.parseDeck('1 Spirit (ABC)').entries,true,new AbortController().signal,(i,r)=>row=r);
 assert.equal(row.selected,null);assert.match(row.error,/mehrdeutig/);
});
test('the shipped advanced example resolves against the actual bundled catalogue',async()=>{
 const fs=require('node:fs');const path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 const literal=source.match(/const example = (\[[\s\S]*?\]\.join\('\\n'\));/)[1];
 const example=require('node:vm').runInNewContext(literal);
 const c=new Catalogue();c.json=async(p)=>JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data',p),'utf8'));
 const rows=[];await c.resolveAll(Kartenwerk.parseDeck(example).entries,true,new AbortController().signal,(i,r)=>rows[i]=r);
 assert.equal(rows.length,8);assert.ok(rows.every(r=>r.selected && !r.mismatch),JSON.stringify(rows.map(r=>({name:r.name,error:r.error,mismatch:r.mismatch}))));
 assert.equal(rows.find(r=>r.name==='Robot').options.find(c=>c.id===rows.find(r=>r.name==='Robot').selected).collector_number,'16');
});
