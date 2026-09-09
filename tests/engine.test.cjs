const assert=require('node:assert/strict');
const E=require('../android/assets/engine.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('parses multiline packs and keeps word IDs when editing',()=>{
 const d=E.initial().decks[0];const words=E.parseLines('slow — медленный; неторопливый\nfast - быстрый',d);
 assert.equal(words[0].id,d.words[0].id);assert.deepEqual(words[0].ru,['Медленный','Неторопливый']);
 assert.throws(()=>E.parseLines('slow медленный'),/Строка 1/);
});
test('rejects invalid and ambiguous pack structure',()=>{
 const d=E.initial().decks[0];assert.throws(()=>E.cleanDeck({...d,words:[d.words[0],d.words[0]]}));
 assert.throws(()=>E.cleanDeck({...d,words:[{id:'a',en:'<script>',ru:['x']}]}));
 assert.throws(()=>E.cleanDeck({...d,due:'2026-02-30'}));
 assert.throws(()=>E.decode('{"app":"other"}'));
});
test('round trips portable pack without carrying wallet or progress',()=>{
 const s=E.initial(),parsed=E.decode(E.exportDeck(s.decks[0]));assert.equal(parsed.kind,'deck');assert.equal(parsed.deck.words.length,12);assert.equal(parsed.wallet,undefined);
});
test('update preserves unchanged progress and resets edited translations only',()=>{
 const s=E.initial(),d=s.decks[0];E.applyAnswer(s,E.question(s,d,d.words[0],'write'),true);E.applyAnswer(s,E.question(s,d,d.words[1],'write'),true);
 const changed=E.clone(d);changed.words[0].ru=['медленно'];E.install(s,changed);assert.equal(E.stat(s,d,d.words[0]).s.ok,0);assert.equal(E.stat(s,d,d.words[1]).s.ok,1);assert.equal(s.decks.length,1);
});
test('reward requires 10 distinct independent word credits and cannot be farmed',()=>{
 const s=E.initial(),d=s.decks[0],now=new Date('2026-09-08T12:00:00').getTime();
 for(let i=0;i<10;i++)E.applyAnswer(s,E.question(s,d,d.words[i],'enru'),true,false,now);
 assert.equal(s.wallet.balance,5);assert.equal(s.wallet.counts[0],0);
 for(let i=0;i<10;i++)E.applyAnswer(s,E.question(s,d,d.words[i],'ruen'),true,false,now);
 assert.equal(s.wallet.balance,5);assert.equal(s.wallet.counts[0],0);
 for(let i=0;i<10;i++)E.applyAnswer(s,E.question(s,d,d.words[i],'enru'),true,false,now+86400000);
 assert.equal(s.wallet.balance,10);
});
test('hinted answers and errors earn nothing; scaffolding does not establish writing mastery',()=>{
 const s=E.initial(),d=s.decks[0];for(const mode of E.MODES){E.applyAnswer(s,E.question(s,d,d.words[0],mode),true,true);E.applyAnswer(s,E.question(s,d,d.words[1],mode),false);}
 assert.equal(s.wallet.balance,0);assert.deepEqual(s.wallet.counts,[0,0,0]);
 E.applyAnswer(s,E.question(s,d,d.words[2],'build'),true);assert.equal(E.stat(s,d,d.words[2]).s.ok,0);
});
test('mastery needs successes on separate days and errors revoke confident status',()=>{
 const s=E.initial(),d=s.decks[0],w=d.words[0],q=E.question(s,d,w,'write'),now=new Date('2026-09-08T12:00:00').getTime();
 E.applyAnswer(s,q,true,false,now);E.applyAnswer(s,q,true,false,now);assert.equal(E.mastered(E.stat(s,d,w).s),false);
 E.applyAnswer(s,q,true,false,now+86400000);assert.equal(E.mastered(E.stat(s,d,w).s),true);
 E.applyAnswer(s,q,false,false,now+86400001);assert.equal(E.mastered(E.stat(s,d,w).s),false);
});
test('daily cap cannot be exceeded and reward-off works',()=>{
 const s=E.initial(),d=s.decks[0];s.settings.dailyCap=3;
 d.words.forEach(w=>E.applyAnswer(s,E.question(s,d,w,'write'),true));assert.equal(s.wallet.balance,3);
 d.words.forEach(w=>E.applyAnswer(s,E.question(s,d,w,'enru'),true));assert.equal(s.wallet.balance,3);
 const a=E.initial();a.settings.rewards=[0,0,0];a.decks[0].words.forEach(w=>E.applyAnswer(a,E.question(a,a.decks[0],w,'write'),true));assert.equal(a.wallet.balance,0);
});
test('spending is validated, history balances, backup round trip is exact',()=>{
 const s=E.initial();E.entry(s,15,'adjust','Родитель: тест');const h=E.spend(s,5);assert.equal(h.delta,-5);assert.equal(s.wallet.balance,10);assert.throws(()=>E.spend(s,11));assert.throws(()=>E.spend(s,-1));assert.throws(()=>E.spend(s,1.2));
 assert.deepEqual(E.validateState(s),s);assert.deepEqual(E.decode(JSON.stringify({app:'mayusha-words',version:1,kind:'backup',state:s})).state,s);
 const bad=E.clone(s);bad.wallet.balance=99;assert.throws(()=>E.validateState(bad),/Баланс/);
});
test('single-word packs remain usable; synonyms cannot create multiple right choices',()=>{
 const s=E.initial(),d={id:'test',title:'Тест',due:'',words:[{id:'a',en:'big',ru:['большой']},{id:'b',en:'large',ru:['большой']},{id:'c',en:'small',ru:['маленький']}]};
 const q=E.question(s,d,d.words[0],'ruen');assert.equal(q.options.length,2);assert(!q.options.some(o=>o.text==='large'));
 const one={...d,words:[d.words[0]]};assert.equal(E.question(s,one,one.words[0],'enru').mode,'write');
});
test('answer normalization accepts case and whitespace but rejects missing letters',()=>{
 const s=E.initial(),d=s.decks[0],q=E.question(s,d,d.words[5],'write');assert(E.check(q,' YOUNG '));assert(!E.check(q,'yong'));
});
test('single-pack scheduling never adds older words from other packs',()=>{
 const s=E.initial(),d=s.decks[0],q=E.next(s,d.id);const n=E.next(s,d.id,'auto',{},E.key(q.deck,q.word));assert.notEqual(n.word.id,q.word.id);
 const old=E.cleanDeck({id:'old',title:'Раньше',words:[{id:'bird',en:'bird',ru:['птица']}]});E.install(s,old);E.markSeen(s,old,old.words[0]);const review=E.next(s,d.id,'auto',{},'',false,5);assert.equal(review.deck.id,d.id);
});
test('capitalizes new entries without lowercasing proper names and preserves IDs and case-only progress',()=>{
 const s=E.initial(),d=s.decks[0];E.applyAnswer(s,E.question(s,d,d.words[0],'write'),true);
 const words=E.parseLines('slow — медленный; неторопливый\nnew York — нью-Йорк',d);
 assert.equal(words[0].en,'Slow');assert.deepEqual(words[0].ru,['Медленный','Неторопливый']);assert.equal(words[0].id,d.words[0].id);assert.equal(words[1].en,'New York');
 const edited=E.clone(d);edited.words=E.parseLines(d.words.map(w=>w.en+' — '+w.ru.join('; ')).join('\n'),d);E.install(s,edited);
 assert.equal(E.stat(s,edited,edited.words[0]).s.ok,1);assert(E.check(E.question(s,edited,edited.words[0],'write'),'slow'));
});
test('all-active mode alternates packs, excludes archived packs and retains real progress keys',()=>{
 const s=E.initial(),first=s.decks[0];const second=E.cleanDeck({id:'pets',title:'Животные',words:[{id:'sample0',en:'cat',ru:['кошка']},{id:'dog',en:'dog',ru:['собака']}]});
 E.install(s,second);E.install(s,{id:'archive',title:'Архив',archived:true,words:[{id:'sun',en:'sun',ru:['солнце']}]});
 for(const mode of ['auto',...E.MODES]){let previous='',used={},ids=[];for(let n=0;n<10;n++){const q=E.next(s,'__all__',mode,used,previous,false,n);ids.push(q.deck.id);previous=E.key(q.deck,q.word);used[previous]=(used[previous]||0)+1;assert.notEqual(q.deck.id,'archive');}assert.equal(ids.filter(x=>x===first.id).length,5);assert.equal(ids.filter(x=>x===second.id).length,5);}
 const q=E.question(s,second,second.words[0],'write');E.applyAnswer(s,q,true);assert.equal(E.stat(s,second,second.words[0]).s.ok,1);assert.equal(E.stat(s,first,first.words[0]).s.ok,0);
 s.active='__all__';assert.equal(E.validateState(s).active,'__all__');
});
test('chosen pack wins over nearest date, and all-active cannot include an all-archived library',()=>{
 const s=E.initial();E.install(s,{id:'next',title:'Ближайший урок',due:'2099-01-01',words:[{id:'cat',en:'cat',ru:['кошка']}]});s.active=s.decks[0].id;assert.equal(E.preferred(s).id,s.active);
 s.decks.forEach(d=>d.archived=true);assert.throws(()=>E.next(s,'__all__'),/выбери набор/);
});
console.log(`${count} engine tests passed`);
