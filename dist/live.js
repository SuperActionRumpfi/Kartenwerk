(function(root) {
  'use strict';
  const { normalize, faces } = root.Kartenwerk || require('./core.js');
  const API = 'https://api.scryfall.com';
  const abort = signal => { if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError'); };
  const wait = (ms, signal) => new Promise((resolve, reject) => {
    abort(signal);
    const stop = () => { clearTimeout(timer); reject(new DOMException('Abgebrochen', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, ms);
    signal.addEventListener('abort', stop, {once:true});
  });
  const fullNames = card => [card.name, card.printed_name].filter(Boolean).map(normalize);
  const faceNames = card => (card.card_faces || []).flatMap(face => [face.name, face.printed_name]).filter(Boolean).map(normalize);
  const usable = card => faces(card).length && !['missing', 'placeholder'].includes(card.image_status);
  const requested = (card, entry) => (!entry.set || card.set === entry.set) && (!entry.collector || card.collector_number === entry.collector);
  class ScryfallLive {
    constructor(options = {}) {
      this.fetch = options.fetch || root.fetch.bind(root);
      this.sleep = options.sleep || wait;
      this.now = options.now || Date.now;
      this.report = options.report || (() => {});
      this.storage = options.storage;
      if (this.storage === undefined) { try { this.storage = root.localStorage; } catch {} }
      this.cache = new Map(); this.nextAt = 0;
    }
    static groups(entries, language) {
      const suffix = `) lang:${language} game:paper`;
      const groups = []; let group = [];
      for (const entry of entries) {
        const trial = '(' + [...group, entry].map(e => '!' + JSON.stringify(e.name)).join(' or ') + suffix;
        if (Array.from(trial).length > 950) {
          if (!group.length) throw new Error('Ein Kartenname ist zu lang für die Scryfall-Suche.');
          groups.push(group); group = [];
        }
        const single = '(!' + JSON.stringify(entry.name) + suffix;
        if (Array.from(single).length > 950) throw new Error('Ein Kartenname ist zu lang für die Scryfall-Suche.');
        group.push(entry);
      }
      if (group.length) groups.push(group);
      return groups;
    }
    async request(path, signal, body) {
      abort(signal);
      const url = new URL(path, API);
      if (url.origin !== API) throw new Error('Unerwartete Scryfall-Folgeseite.');
      const key = 'kartenwerk-live-v1:' + url.href + (body ? JSON.stringify(body) : '');
      let saved = this.cache.get(key);
      try { if (!saved) saved = JSON.parse(this.storage?.getItem(key) || 'null'); } catch {}
      if (saved && this.now() - saved.at >= 0 && this.now() - saved.at < 86400000) return saved.data;
      for (let attempt = 0; attempt < 4; attempt++) {
        let next = this.nextAt;
        try { next = Math.max(next, Number(this.storage?.getItem('kartenwerk-api-pause')) || 0); } catch {}
        await this.sleep(Math.max(0, next - this.now()), signal); abort(signal);
        const control = new AbortController(); const stop = () => control.abort();
        signal.addEventListener('abort', stop, {once:true});
        const timer = setTimeout(() => control.abort(), 20000);
        let response;
        try {
          const headers = {Accept:'application/json'};
          if (body) headers['Content-Type'] = 'application/json';
          response = await this.fetch(url.href, {signal:control.signal, headers, ...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
        } catch (error) {
          abort(signal);
          throw new Error('Scryfall-Anfrage fehlgeschlagen oder nach 20 Sekunden abgebrochen. Bitte erneut versuchen.');
        } finally {
          clearTimeout(timer); signal.removeEventListener('abort', stop); this.nextAt = this.now() + 1000;
        }
        abort(signal);
        if (response.status === 429 || response.status >= 500) {
          const header = response.headers.get('Retry-After');
          const seconds = header === null ? NaN : Number(header);
          const retry = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - this.now();
          const ms = Math.max(30000 * 2 ** attempt, Number.isFinite(retry) ? retry : 0);
          this.nextAt = this.now() + ms;
          try { this.storage?.setItem('kartenwerk-api-pause', String(this.nextAt)); } catch {}
          if (attempt === 3) { const e = new Error('Scryfall ist vorübergehend nicht verfügbar. Ergebnisse sind unvollständig; fehlende Karten wurden nicht bestätigt.'); e.rateLimited = response.status === 429; throw e; }
          this.report(`Scryfall meldet HTTP ${response.status}. Suche pausiert für mindestens ${Math.ceil(ms/1000)} Sekunden.`);
          continue;
        }
        if (response.status !== 404 && !response.ok) throw new Error(`Scryfall meldet HTTP ${response.status}. Suche nicht vollständig.`);
        const data = response.status === 404 ? null : await response.json(); abort(signal);
        saved = {at:this.now(),data}; this.cache.set(key,saved);
        try { this.storage?.setItem(key,JSON.stringify(saved)); } catch {}
        return data;
      }
    }
    async search(q, language, signal, prints = false) {
      let path = '/cards/search?' + new URLSearchParams({q,unique:prints?'prints':'cards',include_extras:'true',order:'released',dir:'desc'});
      const cards = []; const visited = new Set();
      while (path) {
        abort(signal);
        if (visited.has(path)) throw new Error('Scryfall lieferte eine ungültige Seitenfolge.');
        visited.add(path);
        const data = await this.request(path, signal);
        if (!data) break;
        if (!Array.isArray(data.data)) throw new Error('Ungültige Scryfall-Antwort.');
        cards.push(...data.data.filter(c => c.lang === language));
        if (data.has_more && !data.next_page) throw new Error('Scryfall-Folgeseite fehlt.');
        path = data.has_more ? data.next_page : null;
      }
      return [...new Map(cards.map(c => [c.id,c])).values()];
    }
    identity(cards, entry) {
      const key = normalize(entry.name);
      const exact = cards.filter(c => fullNames(c).includes(key));
      let candidates = exact.length ? exact : cards.filter(c => faceNames(c).includes(key));
      if (entry.set && candidates.some(c => requested(c,entry))) candidates = candidates.filter(c => requested(c,entry));
      const ids = new Set(candidates.map(c => c.oracle_id));
      return {ambiguous:ids.size>1, cards:ids.size===1 ? candidates : [], oracle:ids.size===1 ? candidates[0].oracle_id : null};
    }
    row(entry, cards, oracle, expanded = false) {
      const usableCards = cards.filter(usable);
      const selected = usableCards.find(c => requested(c, entry)) || usableCards[0];
      return {...entry,options:usableCards,selected:selected?.id || null,state:selected?'ready':'missing',fallback:selected?.lang==='en',
        _oracle:oracle,_source:'live',_editionsLoaded:expanded,
        mismatch:!!(selected && entry.set && !requested(selected,entry)),
        error:selected?null:'Keine passende Druckversion mit verfügbarem Bild gefunden.'};
    }
    ambiguous(entry) { return {...entry,options:[],selected:null,state:'missing',error:'Name ist mehrdeutig. Bitte Set-Code und Sammlernummer ergänzen, etwa Robot (TPIP) 16.'}; }
    async editions(row, signal) {
      const lang = row.fallback?'en':'de';
      return (await this.search(`oracleid:${row._oracle} lang:${lang} game:paper`,lang,signal,true)).filter(usable);
    }
    async resolveAll(entries, allowEnglish, signal, onRow, onProgress = () => {}) {
      const rows = new Array(entries.length); const unresolved = [];
      const emit = (index,row) => { rows[index]=row; onRow(index,row); };
      const plain = entries.map((e,i)=>({...e,index:i})).filter(e=>!e.set);
      const groups = ScryfallLive.groups(plain,'de');
      for (let i=0;i<groups.length;i++) {
        onProgress(`Deutsche Karten: Paket ${i+1} / ${groups.length}`);
        const q='('+groups[i].map(e=>'!'+JSON.stringify(e.name)).join(' or ')+') lang:de game:paper';
        const cards=await this.search(q,'de',signal);
        for (const entry of groups[i]) {
          const identity=this.identity(cards,entry);
          if(identity.ambiguous) emit(entry.index,this.ambiguous(entries[entry.index]));
          else if(identity.cards.some(usable)) emit(entry.index,this.row(entries[entry.index],identity.cards,identity.oracle));
          else unresolved.push({index:entry.index,oracle:identity.oracle});
        }
      }
      // Resolve requested printing identities before considering other editions.
      for (let index=0;index<entries.length;index++) {
        const entry=entries[index]; if(!entry.set) continue;
        onProgress(`Druckversion prüfen: ${entry.name}`);
        let cards=[];
        if(entry.collector) {
          const card=await this.request(`/cards/${encodeURIComponent(entry.set)}/${encodeURIComponent(entry.collector)}/de`,signal);
          if(card && card.lang==='de') cards=[card];
        } else cards=await this.search('!'+JSON.stringify(entry.name)+` set:${entry.set} lang:de game:paper`,'de',signal,true);
        let identity=this.identity(cards,entry);
        if(identity.ambiguous) { emit(index,this.ambiguous(entry));continue; }
        if(identity.cards.some(usable)) {emit(index,this.row(entry,identity.cards,identity.oracle));continue;}
        let english=[];
        if(entry.collector) {
          const card=await this.request(`/cards/${encodeURIComponent(entry.set)}/${encodeURIComponent(entry.collector)}`,signal);
          if(card) english=[card];
        } else english=await this.search('!'+JSON.stringify(entry.name)+` set:${entry.set} lang:en game:paper`,'en',signal,true);
        identity=this.identity(english,entry);
        if(identity.ambiguous) { emit(index,this.ambiguous(entry));continue; }
        if(!identity.oracle) {emit(index,{...entry,options:[],selected:null,state:'missing',error:'Kartenname und gewünschte Druckversion konnten nicht eindeutig zugeordnet werden. Set-Code und Nummer prüfen.'});continue;}
        cards=await this.search(`oracleid:${identity.oracle} lang:de game:paper`,'de',signal);
        if(cards.some(usable)) emit(index,this.row(entry,cards,identity.oracle));
        else if(allowEnglish && identity.cards.some(usable)) emit(index,this.row(entry,identity.cards,identity.oracle));
        else unresolved.push({index,oracle:identity.oracle});
      }
      if(allowEnglish) {
        // Unknown names are resolved in POST batches; known identities use oracle IDs.
        for(let start=0;start<unresolved.length;start+=75) {
          const chunk=unresolved.slice(start,start+75);
          onProgress(`Englische Ersatzkarten: Paket ${Math.floor(start/75)+1} / ${Math.ceil(unresolved.length/75)}`);
          const identifiers=chunk.map(x=>x.oracle?{oracle_id:x.oracle}:{name:entries[x.index].name});
          const result=await this.request('/cards/collection',signal,{identifiers});
          if(!result || !Array.isArray(result.data) || !Array.isArray(result.not_found)) throw new Error('Unvollständige Scryfall-Sammelantwort.');
          for(const item of chunk) {
            const entry=entries[item.index];
            let candidates=result.data.filter(c=>c.lang==='en' && (!c.games || c.games.includes('paper')));
            let identity=item.oracle?{oracle:item.oracle,cards:candidates.filter(c=>c.oracle_id===item.oracle)}:this.identity(candidates,entry);
            if(identity.ambiguous) {emit(item.index,this.ambiguous(entry));continue;}
            if(!identity.cards.some(usable)) {
              // Search also handles same-name tokens excluded or arbitrarily chosen by collection.
              candidates=await this.search('!'+JSON.stringify(entry.name)+' lang:en game:paper','en',signal);
              identity=this.identity(candidates,entry);
            } else if(!item.oracle && candidates.some(c=>c.layout==='token' && fullNames(c).includes(normalize(entry.name)))) {
              candidates=await this.search('!'+JSON.stringify(entry.name)+' lang:en game:paper','en',signal);identity=this.identity(candidates,entry);
            }
            emit(item.index,identity.ambiguous?this.ambiguous(entry):this.row(entry,identity.cards,identity.oracle));
          }
        }
      } else {
        for(const item of unresolved) emit(item.index,{...this.row(entries[item.index],[],item.oracle),error:'Keine deutsche Druckversion mit Bild gefunden. Englisch als Ersatz ist ausgeschaltet.'});
      }
      abort(signal); return rows;
    }
  }
  root.ScryfallLive=ScryfallLive;
  if(typeof module!=='undefined' && module.exports) module.exports=ScryfallLive;
})(globalThis);
