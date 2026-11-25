const {test}=require('node:test');const assert=require('node:assert/strict');
global.Kartenwerk=require('../dist/core.js');const Live=require('../dist/live.js');const signal=()=>new AbortController().signal;
const card=(name,lang='de',id=name)=>({id:id+'-'+lang,oracle_id:id,name,printed_name:lang==='de'?name+' DE':undefined,lang,set:'test',collector_number:'1',games:['paper'],image_status:'highres_scan',image_uris:{normal:'https://example.invalid/card.jpg'}});
const list=(data,extra={})=>({data,has_more:false,...extra});
function client(handler,storage=null){let now=100000;const calls=[];const c=new Live({storage,now:()=>now,sleep:async(ms,s)=>{if(s.aborted)throw new DOMException('cancel','AbortError');now+=ms},fetch:async(url,options)=>{calls.push({url,options});const r=await handler(new URL(url),options);return {status:r===null?404:200,ok:r!==null,headers:{get:()=>null},json:async()=>r}}});return {c,calls,advance:ms=>now+=ms};}
async function resolve(c,text,fallback=true){const rows=[];await c.resolveAll(Kartenwerk.parseDeck(text).entries,fallback,signal(),(i,r)=>rows[i]=r);return rows;}
test('German searches combine inputs and map reversed responses to names',async()=>{
 const x=client(()=>list([card('Beta'),card('Alpha')]));const rows=await resolve(x.c,'2 Alpha\n1 Beta');assert.equal(x.calls.length,1);assert.ok(rows.every(r=>r.selected));assert.equal(rows[0].options[0].name,'Alpha');assert.equal(rows[0].quantity,2);assert.equal(new URL(x.calls[0].url).searchParams.get('include_extras'),'true');
});
test('query batches respect Unicode character limit and resolve large lists',async()=>{
 const entries=Array.from({length:100},(_,i)=>({name:`Example card with long name ${i} ä`,quantity:1}));const groups=Live.groups(entries,'de');assert.ok(groups.length>1);assert.equal(groups.flat().length,100);
 for(const group of groups){const q='('+group.map(e=>'!'+JSON.stringify(e.name)).join(' or ')+') lang:de game:paper';assert.ok(Array.from(q).length<=950);}
});
test('fallback submits only missing names, maps by name rather than response position',async()=>{
 const x=client((url,o)=>url.pathname==='/cards/collection'?{data:[card('Gamma','en'),card('Beta','en')],not_found:[]}:list([card('Alpha')]));const rows=await resolve(x.c,'1 Alpha\n1 Beta\n1 Gamma');assert.deepEqual(rows.map(r=>r.fallback),[false,true,true]);assert.deepEqual(JSON.parse(x.calls[1].options.body).identifiers,[{name:'Beta'},{name:'Gamma'}]);assert.equal(rows[1].options[0].name,'Beta');
});
test('disabled English fallback makes no English requests',async()=>{
 const x=client(()=>null);const rows=await resolve(x.c,'1 Missing',false);assert.equal(x.calls.length,1);assert.equal(rows[0].selected,null);assert.match(rows[0].error,/ausgeschaltet/);
});
test('request failures are not treated as missing German cards',async()=>{
 const x=client(()=>{throw new Error('offline')});await assert.rejects(resolve(x.c,'1 Alpha'),/fehlgeschlagen/);assert.equal(x.calls.length,1);
});
test('German result pages are exhausted and a foreign next_page is rejected',async()=>{
 const x=client(url=>url.searchParams.get('page')==='2'?list([card('Beta')]):list([card('Alpha')],{has_more:true,next_page:'https://api.scryfall.com/cards/search?page=2'}));const rows=await resolve(x.c,'1 Alpha\n1 Beta');assert.equal(x.calls.length,2);assert.ok(rows.every(r=>r.selected));
 const bad=client(()=>list([],{has_more:true,next_page:'https://example.invalid/'}));await assert.rejects(resolve(bad.c,'1 Alpha'),/Unerwartete/);
});
test('full names take priority over matching faces; distinct tokens stay ambiguous',async()=>{
 const other={...card('Alpha // Other','de','double'),card_faces:[{name:'Alpha'}]};const x=client(()=>list([other,card('Alpha')]));const rows=await resolve(x.c,'1 Alpha');assert.equal(rows[0]._oracle,'Alpha');
 const tokens=client(()=>list([card('Robot','de','one'),card('Robot','de','two')]));const ambiguous=await resolve(tokens.c,'1 Robot');assert.equal(ambiguous[0].selected,null);assert.match(ambiguous[0].error,/mehrdeutig/);assert.equal(tokens.calls.length,1);
});
test('set and number fetch German directly; unavailable German edition keeps token identity',async()=>{
 const german=client(()=>({...card('Robot'),set:'tpip',collector_number:'16'}));const rows=await resolve(german.c,'2 Robot (TPIP) 16');assert.match(german.calls[0].url,/\/cards\/tpip\/16\/de$/);assert.equal(german.calls.length,1);assert.equal(rows[0].mismatch,false);
 const english=client(url=>url.pathname.endsWith('/de')?null:url.pathname==='/cards/tpip/16'?{...card('Robot','en'),set:'tpip',collector_number:'16'}:null);const fallback=await resolve(english.c,'1 Robot (TPIP) 16');assert.equal(fallback[0].fallback,true);assert.equal(fallback[0]._oracle,'Robot');
});
test('other German edition is preferred before using requested English printing',async()=>{
 const x=client(url=>url.pathname.endsWith('/de')?null:url.pathname==='/cards/test/1'?card('Alpha','en'):list([{...card('Alpha'),set:'other'}]));const rows=await resolve(x.c,'1 Alpha (TEST) 1');assert.equal(rows[0].fallback,false);assert.equal(rows[0].mismatch,true);
});
test('English same-name token result is verified against all identities',async()=>{
 const one={...card('Robot','en','one'),layout:'token'},two={...card('Robot','en','two'),layout:'token'};
 const x=client((url,o)=>url.pathname==='/cards/collection'?{data:[one],not_found:[]}:url.searchParams.get('q').includes('lang:en')?list([one,two]):null);const rows=await resolve(x.c,'1 Robot');assert.equal(rows[0].selected,null);assert.match(rows[0].error,/mehrdeutig/);
});
test('edition expansion loads all prints while keeping the resolved identity and language',async()=>{
 const x=client(url=>{assert.match(url.searchParams.get('q'),/oracleid:Alpha lang:de/);assert.equal(url.searchParams.get('unique'),'prints');return list([card('Alpha')]);});const editions=await x.c.editions({_oracle:'Alpha',fallback:false},signal());assert.equal(editions.length,1);
});
test('24-hour response cache survives client replacement and expires',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};const a=client(()=>list([card('Alpha')]),storage);await resolve(a.c,'1 Alpha');const b=client(()=>{throw new Error('should be cached')},storage);await resolve(b.c,'1 Alpha');assert.equal(b.calls.length,0);b.advance(86400001);await assert.rejects(resolve(b.c,'1 Alpha'),/fehlgeschlagen/);
});
test('double-faced cards retain both print images',async()=>{
 const df={...card('Front // Back'),image_uris:undefined,card_faces:[{name:'Front',image_uris:{normal:'https://example.invalid/front.jpg'}},{name:'Back',image_uris:{normal:'https://example.invalid/back.jpg'}}]};const x=client(()=>list([df]));const rows=await resolve(x.c,'1 Front // Back');assert.equal(Kartenwerk.printItems(rows,true).length,2);assert.equal(Kartenwerk.printItems(rows,false).length,1);
});
