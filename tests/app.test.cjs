// DOM-level integration tests. Native Android services are explicit test doubles.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../android/assets/engine.js');
const assets=path.resolve(__dirname,'../android/assets');
let tests=0;
async function fixture(initial=null){
 const dom=new JSDOM(fs.readFileSync(assets+'/index.html','utf8'),{url:'https://words.mayusha.local/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const native={saved:initial?JSON.stringify(initial):'',pin:'',exports:[],shares:[],spoken:[],handwriting:[],fail:false,saveCalls:0};
 w.WordsAndroid={openHandwriting:(...a)=>native.handwriting.push(a),loadState:()=>native.saved,saveState:text=>{native.saveCalls++;if(native.fail)return false;native.saved=text;return true;},hasPin:()=>!!native.pin,setPin:p=>{native.pin=p;return true;},verifyPin:p=>p===native.pin?'ok':'Неверный PIN. Попробуйте ещё раз.',lockParent:()=>{},ready:()=>{},checkVoice:()=>{},speak:(...a)=>native.spoken.push(a),stopSpeech:()=>{},openSpeechSettings:()=>{},pickFile:()=>{},exportFile:(...a)=>native.exports.push(a),shareText:t=>native.shares.push(t)};
 w.eval(fs.readFileSync(assets+'/engine.js','utf8'));w.eval(fs.readFileSync(assets+'/app.js','utf8'));
 const tick=()=>new Promise(r=>setTimeout(r,0));
 async function click(selector){const e=w.document.querySelector(selector);assert(e,'Missing '+selector+' on '+w.document.body.textContent.slice(0,200));assert(!e.disabled,'Disabled '+selector);e.click();await tick();}
 const fill=(selector,value)=>{const e=w.document.querySelector(selector);assert(e,'Missing '+selector);e.value=value;};
 const act=(a,extra='')=>click(`[data-action="${a}"]${extra}`);
 const read=()=>JSON.parse(native.saved);
 async function setup(){fill('#welcome-pin','2468');fill('#welcome-confirm','2468');await act('setup');assert(read().profile.ready);}
 async function parent(){await act('parent');if(w.document.querySelector('#pin')){fill('#pin','2468');await act('modal-ok');}}
 const text=()=>w.document.body.textContent;
 return {w,dom,native,click,fill,act,read,setup,parent,text,tick};
}
async function test(name,fn){const f=await fixture();try{await fn(f);tests++;console.log('PASS',name);}finally{f.dom.window.close();}}
const pairs=Object.fromEntries(E.initial().decks[0].words.map(w=>[w.en,w.ru[0]]));
async function solve(f,good=true){
 const prompt=f.w.document.querySelector('.study-card .word').textContent;
 const choices=[...f.w.document.querySelectorAll('.choice')];
 if(choices.length){const answer=pairs[prompt]||Object.keys(pairs).find(k=>pairs[k]===prompt);const b=choices.find(b=>(b.textContent===answer)===good);assert(b,'No answer '+prompt);await f.click(`[data-action="choice"][data-id="${b.dataset.id}"]`);return;}
 if(f.w.document.querySelector('.letters')){const answer=Object.keys(pairs).find(k=>pairs[k]===prompt);assert(answer);for(let i=0;i<answer.length;i++)await f.act('letter',`[data-id="${i}"]`);await f.act('check');return;}
 if(prompt.includes('＿')){const answer=Object.keys(pairs).find(k=>k.length===prompt.length&&[...prompt].every((c,i)=>c==='＿'||c===k[i]));f.fill('#answer',good?answer[prompt.indexOf('＿')]:'z');}
 else f.fill('#answer',good?Object.keys(pairs).find(k=>pairs[k]===prompt):'wrong');
 await f.act('check');
}
(async()=>{
 await test('first run, parent PIN, settings persistence and no old brand labels',async f=>{
  await f.setup();assert(f.text().includes('Английские слова'));assert(!f.text().includes('Likee'));
  await f.act('parent');f.fill('#pin','1111');await f.act('modal-ok');assert(f.text().includes('Неверный PIN'));f.fill('#pin','2468');await f.act('modal-ok');
  await f.act('settings');f.fill('#setting-name','Майя');f.fill('#setting-gen','Майи');f.fill('#reward-0','4');f.fill('#daily-cap','20');await f.act('save-settings');assert.equal(f.read().settings.rewards[0],4);assert.equal(f.read().profile.genitive,'Майи');
  await f.act('lock');await f.act('parent');assert(f.w.document.querySelector('#pin'));
 });
 await test('auto lesson shows all new cards, counts 10 answers and retries a wrong word later',async f=>{
  await f.setup();await f.act('start-auto');for(let i=0;i<12;i++)await f.act('card-next');
  let wrongId;
  for(let i=0;i<10;i++){
   if(i===2)wrongId=f.w.document.querySelector('.study-card .word').textContent;
   if(i===6)assert.equal(f.w.document.querySelector('.study-card .word').textContent,wrongId);
   await solve(f,i!==2);await f.act('next');
  }
  assert(f.text().includes('Занятие завершено'));assert.equal(f.read().sessions[0].total,10);assert.equal(f.read().sessions[0].correct,9);
 });
 await test('all six modes, speech buttons, hints, shuffled repeated letters and non-rewarded practice',async f=>{
  await f.setup();
  for(const mode of E.MODES){
   await f.act('home');await f.act('choose-band',`[data-band="${E.band(mode)}"]`);await f.act('start-mode',`[data-mode="${mode}"]`);
   if(mode==='listen'){
    assert.equal(f.w.document.querySelector('.study-card .word').textContent,'🔊');await f.act('speak-question');const [word,slow,accent]=f.native.spoken.at(-1);assert(pairs[word]);assert.equal(slow,false);assert.equal(accent,'en-GB');await f.act('speak-slow');assert.equal(f.native.spoken.at(-1)[1],true);
    f.fill('#answer',word);await f.act('check');
   }else if(mode==='write'){
    const before=f.read().wallet.counts[2];await f.act('hint');await f.act('modal-ok');await solve(f);assert.equal(f.read().wallet.counts[2],before);
   }else await solve(f);
   assert(f.w.document.querySelector('#feedback .feedback'));await f.act('exit-session');await f.act('modal-ok');
  }
 });
 await test('pack creation, export, duplicate update and preserving unrelated wallet',async f=>{
  await f.setup();await f.parent();await f.act('new-deck');f.fill('#deck-title','К пятнице');f.fill('#deck-due','2026-09-11');f.fill('#deck-lines','cat — кошка\ndog — собака');await f.act('save-deck');await f.act('modal-ok');assert(f.text().includes('2 слова'));await f.act('export-deck');
  const exported=f.native.exports[0];const x=E.decode(exported[0]);assert.equal(x.deck.words.length,2);assert(exported[1].endsWith('.maywords'));x.deck.words[0].ru=['кот'];
  f.w.WordsApp.receiveFile(E.exportDeck(x.deck));await f.tick();assert(f.text().includes('Такой набор уже есть'));await f.act('accept-import');assert.equal(f.read().decks.length,2);assert.equal(f.read().decks[1].words[0].ru[0],'кот');assert.equal(f.read().wallet.balance,0);
 });
 await test('wallet spending is single-use and share retry is idempotent across reloads',async f=>{
  await f.setup();await f.parent();await f.act('adjust');f.fill('#balance-new','25');f.fill('#balance-reason','Тест');await f.act('modal-ok');assert.equal(f.read().wallet.balance,25);assert(f.w.document.querySelector('#spend-n'),'Wallet must render');
  f.fill('#spend-n','5');await f.act('spend');const button=f.w.document.querySelector('[data-action="modal-ok"]');button.click();button.click();await f.tick();assert.equal(f.read().wallet.balance,20);assert.equal(f.read().wallet.history.filter(h=>h.type==='spend').length,1);assert.equal(f.native.shares.length,1);
  await f.act('reshare');assert.equal(f.read().wallet.balance,20);assert.equal(f.native.shares.length,2);assert.equal(f.native.shares[0],f.native.shares[1]);assert(f.native.shares[0].includes('Family Link'));
  const next=await fixture(f.read());assert(next.text().includes('20'));next.dom.window.close();
 });
 await test('backup restores all state after PIN and cannot restore a tampered balance',async f=>{
  await f.setup();await f.parent();await f.act('adjust');f.fill('#balance-new','25');f.fill('#balance-reason','Тест');await f.act('modal-ok');await f.parent();await f.act('backup');const backup=f.native.exports[0][0];
  await f.act('settings');f.fill('#reward-0','1');await f.act('save-settings');assert.equal(f.read().settings.rewards[0],1);
  f.w.WordsApp.receiveFile(backup);await f.tick();await f.act('restore');f.fill('#pin','2468');await f.act('modal-ok');await f.act('modal-ok');assert.equal(f.read().settings.rewards[0],5);assert.equal(f.read().wallet.balance,25);
  const bad=JSON.parse(backup);bad.state.wallet.balance=99;f.w.WordsApp.receiveFile(JSON.stringify(bad));assert(f.text().includes('Баланс не совпадает'));assert.equal(f.read().wallet.balance,25);
 });
 await test('failed native save does not spend or send and keeps the previous balance',async f=>{
  await f.setup();await f.parent();await f.act('adjust');f.fill('#balance-new','10');f.fill('#balance-reason','Тест');await f.act('modal-ok');f.fill('#spend-n','5');await f.act('spend');f.native.fail=true;await f.act('modal-ok');assert.equal(f.read().wallet.balance,10);assert.equal(f.native.shares.length,0);assert(f.text().includes('Не удалось сохранить'));f.native.fail=false;await f.act('modal-ok');assert.equal(f.read().wallet.balance,5);assert.equal(f.native.shares.length,1);
 });
 await test('import before first setup survives onboarding and previews untrusted text safely',async f=>{
  const d=E.initial().decks[0];d.id='received';d.title='<img src=x onerror=alert(1)>';d.words[0].ru=['<script>window.PWNED=1</script>'];
  f.w.WordsApp.receiveFile(E.exportDeck(d));await f.setup();assert(f.text().includes('Получен набор'));assert.equal(f.w.document.querySelectorAll('#app img').length,0);assert.equal(f.w.PWNED,undefined);await f.act('accept-import');assert.equal(f.read().decks.length,2);
 });
 await test('early exit keeps answers and rewards, cancelling a spend leaves balance intact',async f=>{
  await f.setup();await f.act('choose-band','[data-band="0"]');await f.act('start-mode','[data-mode="enru"]');await solve(f);await f.act('exit-session');await f.act('modal-close');assert(f.text().includes('Получилось'));await f.act('exit-session');await f.act('modal-ok');assert.equal(f.read().sessions[0].total,1);
  await f.parent();await f.act('adjust');f.fill('#balance-new','10');f.fill('#balance-reason','Тест');await f.act('modal-ok');f.fill('#spend-n','5');await f.act('spend');await f.act('modal-close');assert.equal(f.read().wallet.balance,10);assert.equal(f.native.shares.length,0);
 });
 await test('parent menu asks for PIN on every entry, even immediately after a successful entry',async f=>{
  await f.setup();await f.parent();await f.act('parent');assert(f.w.document.querySelector('#pin'));await f.act('modal-close');await f.act('home');await f.act('parent');assert(f.w.document.querySelector('#pin'));
  f.fill('#pin','2468');await f.act('modal-ok');await f.act('settings');await f.act('parent');assert(f.w.document.querySelector('#pin'));f.fill('#pin','2468');await f.act('modal-ok');await f.act('sets');await f.act('new-deck');assert(f.w.document.querySelector('#pin'));
 });
 await test('pack quick menu targets the right pack for share, edit and archive',async f=>{
  await f.setup();const received={id:'pets',title:'Животные',words:[{id:'cat',en:'cat',ru:['кошка']},{id:'dog',en:'dog',ru:['собака']}]};f.w.WordsApp.receiveFile(E.exportDeck(received));await f.act('accept-import');await f.act('sets');
  await f.act('quick-share','[data-id="pets"]');assert.equal(E.decode(f.native.exports.at(-1)[0]).deck.id,'pets');
  await f.act('deck-menu','[data-id="pets"]');await f.act('menu-edit');assert(f.w.document.querySelector('#pin'));f.fill('#pin','2468');await f.act('modal-ok');assert.equal(f.w.document.querySelector('#deck-title').value,'Животные');
  await f.act('editor-back');await f.act('modal-ok');await f.act('sets');await f.act('deck-menu','[data-id="pets"]');await f.act('menu-archive');f.fill('#pin','2468');await f.act('modal-ok');assert.equal(f.read().decks.find(d=>d.id==='pets').archived,true);assert.equal(f.read().decks[0].archived,false);
 });
 await test('home picker persists one-pack and all-active choices and cards respect the scope',async f=>{
  await f.setup();const received={id:'pets',title:'Животные',words:[{id:'cat',en:'cat',ru:['кошка']},{id:'dog',en:'dog',ru:['собака']}]};f.w.WordsApp.receiveFile(E.exportDeck(received));await f.act('accept-import');await f.act('home');
  await f.act('choose-scope');await f.act('select-scope','[data-id="pets"]');await f.act('start-auto');assert.equal(f.w.document.querySelector('.word').textContent,'cat');await f.act('card-next');assert.equal(f.w.document.querySelector('.word').textContent,'dog');await f.act('card-next');assert(f.text().includes('Животные'));await f.act('exit-session');await f.act('modal-ok');
  assert.equal(f.w.document.querySelector('#study-target').dataset.id,'pets');await f.act('choose-scope');await f.act('select-scope','[data-id="__all__"]');assert.equal(f.read().active,'__all__');assert(f.text().includes('Все активные наборы'));
  const next=await fixture(f.read());assert.equal(next.w.document.querySelector('#study-target').dataset.id,'__all__');next.dom.window.close();
  await f.act('choose-band','[data-band="2"]');await f.act('start-mode','[data-mode="write"]');let packs=new Set();for(let i=0;i<10;i++){packs.add(f.w.document.querySelector('.row.between .small.muted').textContent);f.fill('#answer','wrong');await f.act('check');await f.act('next');}assert.equal(packs.size,2);
 });
 await test('all six mode captions are separate blocks and new pack preview is capitalized',async f=>{
  await f.setup();for(let b=0;b<3;b++){await f.act('choose-band',`[data-band="${b}"]`);const buttons=f.w.document.querySelectorAll('[data-action="start-mode"]');assert.equal(buttons.length,2);buttons.forEach(button=>{assert(button.querySelector(':scope > strong'));assert(button.querySelector(':scope > small.caption'));});await f.act('modal-close');}
  await f.parent();await f.act('new-deck');f.fill('#deck-title','Кухня');f.fill('#deck-lines','kitchen — кухня\nwater — вода');await f.act('save-deck');assert(f.w.document.querySelector('.modal').textContent.includes('Kitchen — Кухня'));await f.act('modal-ok');assert.equal(f.read().decks.at(-1).words[1].en,'Water');assert.equal(f.read().decks.at(-1).words[1].ru[0],'Вода');
 });
 await test('holding a pack opens actions; scrolling cancels the hold',async f=>{
  await f.setup();await f.act('sets');const target=f.w.document.querySelector('.deck-open');
  target.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,clientX:50,clientY:100}));await new Promise(r=>setTimeout(r,600));assert(f.w.document.querySelector('[data-action="menu-edit"]'));target.click();await f.act('modal-close');
  target.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,clientX:50,clientY:100}));target.dispatchEvent(new f.w.MouseEvent('pointermove',{bubbles:true,clientX:50,clientY:140}));await new Promise(r=>setTimeout(r,600));assert.equal(f.w.document.querySelector('.modal'),null);
 });

 await test('custom scope picker excludes archived packs and cancellation leaves selection intact',async f=>{
  await f.setup();const initial=f.read(), archived=E.clone(initial.decks[0]);archived.id='archived';archived.title='Archived';archived.archived=true;initial.decks.push(archived);
  const next=await fixture(initial);try{
   await next.act('choose-scope');assert.equal(next.w.document.querySelector('#study-target').getAttribute('aria-expanded'),'true');
   assert.equal(next.w.document.querySelectorAll('[data-action="select-scope"]').length,2);assert(!next.w.document.querySelector('[data-action="select-scope"][data-id="archived"]'));
   await next.act('modal-close');assert.equal(next.read().active,initial.active);assert.equal(next.w.document.querySelector('#study-target').getAttribute('aria-expanded'),'false');
   await next.act('choose-scope');next.native.fail=true;await next.act('select-scope','[data-id="__all__"]');assert.equal(next.read().active,initial.active);assert(next.text().includes('Не удалось сохранить'));
  }finally{next.dom.window.close();}
 });
 await test('independent handwriting opens native canvas, returns editable text, rejects stale results and does not reveal an answer',async f=>{
  await f.setup();await f.act('choose-band','[data-band="2"]');await f.act('start-mode','[data-mode="write"]');
  const prompt=f.w.document.querySelector('.study-card .word').textContent,answer=Object.keys(pairs).find(k=>pairs[k]===prompt);
  assert.equal(f.w.document.querySelectorAll('[data-action="input-method"]').length,0);
  await f.act('handwriting');const request=f.native.handwriting.at(-1);assert.equal(request.length,2);assert.equal(request[1],false);assert(!JSON.stringify(request).includes(answer));
  const before=JSON.stringify(f.read());f.w.WordsApp.onHandwriting(request[0],answer);assert.equal(f.w.document.querySelector('#answer').value,answer);assert.equal(JSON.stringify(f.read()),before);
  await f.act('handwriting');const latest=f.native.handwriting.at(-1);f.w.WordsApp.onHandwriting(request[0],'stale');assert.equal(f.w.document.querySelector('#answer').value,answer);
  f.w.WordsApp.onHandwriting(latest[0],'wrong');assert.equal(f.w.document.querySelector('#answer').value,'wrong');f.fill('#answer',answer);await f.act('check');assert(f.text().includes('Получилось'));
  f.w.WordsApp.onHandwriting(latest[0],'after-check');assert.equal(f.w.document.querySelector('#answer').value,answer);await f.act('next');f.w.WordsApp.onHandwriting(latest[0],'late');assert.equal(f.w.document.querySelector('#answer').value,'');
 });
 await test('single-letter handwriting and IME composition keep scoring explicit',async f=>{
  await f.setup();await f.act('choose-band','[data-band="1"]');await f.act('start-mode','[data-mode="gap"]');await f.act('handwriting');const request=f.native.handwriting.at(-1);assert.equal(request[1],true);
  f.w.WordsApp.onHandwriting(request[0],'a');assert.equal(f.w.document.querySelector('#answer').value,'a');const before=JSON.stringify(f.read());f.w.document.querySelector('#answer').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));await f.tick();assert.equal(JSON.stringify(f.read()),before);
 });
 console.log(`${tests} application integration tests passed (native services mocked)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
