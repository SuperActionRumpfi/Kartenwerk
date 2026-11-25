const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function boot(){
 const nodes=new Map();
 function node(){return {value:'',checked:true,disabled:false,hidden:false,files:[],listeners:{},append(){},replaceChildren(){},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}};}
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,createTextNode:text=>({text})};
 const saved={'kartenwerk-deck':'1 Missing','kartenwerk-settings':JSON.stringify({lookupMode:'catalogue',fallback:false,paper:'letter',backs:false,guides:true})};
 const calls=[];
 class Live {async resolveAll(entries,fallback,signal,onRow){calls.push({entries,fallback});entries.forEach((e,i)=>onRow(i,{...e,options:[],selected:null,error:'Kein Treffer'}));}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),{Kartenwerk:require('../dist/core.js'),ScryfallLive:Live,document,localStorage:{getItem:key=>saved[key]??null,setItem:(key,value)=>saved[key]=value},AbortController});
 return {nodes,saved,calls};
}
test('previous catalogue preference restores deck and printing settings without catalogue code',()=>{
 const x=boot();assert.equal(x.nodes.get('deck').value,'1 Missing');assert.equal(x.nodes.get('paper').value,'letter');assert.equal(x.nodes.get('backs').checked,false);assert.equal(x.nodes.has('lookup-mode'),false);
 x.nodes.get('deck').listeners.input();assert.equal(JSON.parse(x.saved['kartenwerk-settings']).lookupMode,undefined);
});
test('resolve button always calls German-first live resolver after migration',async()=>{
 const x=boot();await x.nodes.get('resolve').listeners.click();assert.equal(x.calls.length,1);assert.equal(x.calls[0].entries[0].name,'Missing');assert.equal(x.calls[0].fallback,false);assert.equal(x.nodes.get('resolve').disabled,false);
});
test('all page script dependencies exist without a bundled database',()=>{
 const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 for(const match of html.matchAll(/<script src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,'dist',match[1])),match[1]);
 assert.doesNotMatch(html,/catalogue\.js|lookup-mode|Katalog/);
 assert.equal(fs.existsSync(path.join(root,'dist/data')),false);
});
