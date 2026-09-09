(function (root, factory) {
  const E = factory(); if (typeof module === 'object') module.exports = E; else root.WordsEngine = E;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODES = ['enru', 'ruen', 'gap', 'build', 'write', 'listen'];
  const LABELS = ['Узнаю слово', 'Собираю слово', 'Пишу сама'];
  const uid = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const day = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const band = mode => Math.floor(MODES.indexOf(mode) / 2);
  const key = (d, w) => d.id + '/' + w.id;
  const clone = o => JSON.parse(JSON.stringify(o));
  const capital = s => {s=String(s).trim();return s.charAt(0).toUpperCase()+s.slice(1);};
  const shuffle = a => { a = a.slice(); for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  function need(ok, text) { if (!ok) throw Error(text); }
  const validDate = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
  function cleanDeck(raw) {
    need(raw && typeof raw==='object','В файле нет набора слов.');
    need(typeof raw.id==='string' && raw.id!=='__all__' && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id), 'Неверный номер набора.');
    need(typeof raw.title==='string' && raw.title.trim().length>0 && raw.title.length<=100, 'Название должно содержать от 1 до 100 символов.');
    need(!raw.due || validDate(raw.due), 'Проверь дату урока.');
    need(Array.isArray(raw.words) && raw.words.length>0 && raw.words.length<=100, 'В одном наборе должно быть от 1 до 100 слов.');
    const ids = new Set(), ens = new Set();
    const words = raw.words.map(w => {
      need(w && typeof w.id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(w.id) && !ids.has(w.id),'Повторяющийся или неверный номер слова.'); ids.add(w.id);
      need(typeof w.en==='string' && /^[A-Za-z][A-Za-z '’\-]{0,59}$/.test(w.en.trim()),'В английской части используй латинские буквы, пробел, дефис или апостроф.');
      const en=w.en.trim().replace(/’/g,"'").replace(/\s+/g,' ');
      need(!ens.has(norm(en)), `Слово «${en}» повторяется. Объедини переводы в одну строку.`); ens.add(norm(en));
      need(Array.isArray(w.ru) && w.ru.length>=1 && w.ru.length<=8,'У слова должен быть перевод.');
      const ru=[...new Set(w.ru.map(r=>{need(typeof r==='string' && r.trim().length>0 && r.length<=100,'Перевод должен содержать от 1 до 100 символов.'); return r.trim();}))];
      return {id:w.id,en,ru};
    });
    return {id:raw.id,title:raw.title.trim(),due:raw.due||'',archived:!!raw.archived,words};
  }
  function parseLines(text, old) {
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    return lines.map((s,i)=>{
      const m=s.match(/^(.+?)\s+(?:—|–|-)\s+(.+)$/) || s.match(/^(.+?)\t+(.+)$/);
      need(m, `Строка ${i+1}: напиши «слово — перевод» с пробелами вокруг тире.`);
      const en=capital(m[1]), ru=m[2].split(';').map(s=>capital(s)).filter(Boolean);
      const prior=old?.words.find(w=>norm(w.en)===norm(en));
      return {id:prior?.id||uid(),en,ru};
    });
  }
  function initial() {
    const raw={id:'sample-opposites-v1',title:'Слова и противоположности',due:'',words:[['slow','медленный'],['fast','быстрый'],['low','низкий'],['high','высокий'],['old','старый'],['young','молодой'],['big','большой'],['small','маленький'],['long','длинный'],['short','короткий'],['hot','горячий'],['cold','холодный']].map((a,i)=>({id:'sample'+i,en:a[0],ru:[a[1]]}))};
    return {version:1,profile:{name:'Майюша',genitive:'Майюши',ready:false},settings:{rewards:[5,7,10],dailyCap:30,accent:'en-GB'},decks:[cleanDeck(raw)],active:raw.id,progress:{},wallet:{balance:0,counts:[0,0,0],history:[],daily:{}},credits:{},sessions:[]};
  }
  function stat(s,d,w) { return s.progress[key(d,w)] || {seen:false,t:{ok:0,wrong:0,days:[],streak:0,due:0},s:{ok:0,wrong:0,days:[],streak:0,due:0},last:0}; }
  const mastered = p => p.streak>=2 && p.days.length>=2;
  function summary(s,d) { let translation=0, spelling=0, seen=0; d.words.forEach(w=>{const p=stat(s,d,w); if(p.seen)seen++;if(mastered(p.t))translation++;if(mastered(p.s))spelling++;});return {translation,spelling,seen,total:d.words.length}; }
  function install(s,raw) {
    const d=cleanDeck(raw), old=s.decks.find(x=>x.id===d.id);
    need(old || s.decks.length<100,'В приложении уже 100 наборов. Сначала удали ненужный.');
    if(old) {
      old.words.forEach(w=>{const n=d.words.find(n=>n.id===w.id);if(!n || norm(n.en)!==norm(w.en)||JSON.stringify(n.ru.map(norm))!==JSON.stringify(w.ru.map(norm))) delete s.progress[key(old,w)];});
      s.decks[s.decks.indexOf(old)]={...d,archived:old.archived};
    } else s.decks.push(d);
    s.active=d.id;return d;
  }
  function exportDeck(d) {return JSON.stringify({app:'mayusha-words',version:1,kind:'deck',deck:{...clone(d),archived:false}},null,2);}
  function decode(text) {
    need(typeof text==='string'&&text.length<=5*1024*1024,'Файл слишком большой (не более 5 МБ).');
    let x;try{x=JSON.parse(text.replace(/^\uFEFF/,''));}catch(e){throw Error('Не удалось прочитать файл. Выбери набор .maywords или резервную копию .maybackup.');}
    need(x && x.app==='mayusha-words'&&x.version===1,'Этот файл не подходит. Нужен набор из приложения «Английские слова».');
    if(x.kind==='deck')return {kind:'deck',deck:cleanDeck(x.deck)};
    if(x.kind==='backup')return {kind:'backup',state:validateState(x.state)};
    throw Error('Неизвестный тип файла.');
  }
  const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
  function validateState(s) {
    need(s&&s.version===1,'Неизвестная версия данных.');
    const out=initial();
    need(s.profile && typeof s.profile.name==='string'&&s.profile.name.length>=1&&s.profile.name.length<=30 && typeof s.profile.genitive==='string'&&s.profile.genitive.length>=1&&s.profile.genitive.length<=40,'Проверь имя в копии.');out.profile={name:s.profile.name,genitive:s.profile.genitive,ready:!!s.profile.ready};
    need(s.settings&&Array.isArray(s.settings.rewards)&&s.settings.rewards.length===3&&s.settings.rewards.every(x=>integer(x,0,60))&&integer(s.settings.dailyCap,0,180)&&['en-GB','en-US'].includes(s.settings.accent),'Неверные настройки наград.');out.settings={rewards:s.settings.rewards.slice(),dailyCap:s.settings.dailyCap,accent:s.settings.accent};
    need(Array.isArray(s.decks)&&s.decks.length<=100,'Слишком много наборов.');out.decks=s.decks.map(cleanDeck);need(new Set(out.decks.map(d=>d.id)).size===out.decks.length,'Повторяющиеся наборы.');out.active=s.active==='__all__'||out.decks.some(d=>d.id===s.active)?s.active:(out.decks[0]?.id||'');out.progress={};
    out.decks.forEach(d=>d.words.forEach(w=>{const p=s.progress?.[key(d,w)];if(!p)return;const q={seen:!!p.seen,last:0};need(integer(p.last,0,9e15),'Неверная дата прогресса.');q.last=p.last;for(const dim of ['t','s']){const v=p[dim];need(v&&integer(v.ok,0,1e7)&&integer(v.wrong,0,1e7)&&integer(v.streak,0,1e7)&&integer(v.due,0,9e15)&&Array.isArray(v.days)&&v.days.length<=60&&v.days.every(validDate),'Повреждён прогресс слова.');q[dim]={ok:v.ok,wrong:v.wrong,streak:v.streak,due:v.due,days:[...new Set(v.days)]};}out.progress[key(d,w)]=q;}));
    const a=s.wallet;need(a&&integer(a.balance,0,1e7)&&Array.isArray(a.counts)&&a.counts.length===3&&a.counts.every(n=>integer(n,0,9))&&Array.isArray(a.history)&&a.history.length<=20000,'Повреждена копилка.');
    let balance=0;const ids=new Set();const history=a.history.map(h=>{need(h&&typeof h.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(h.id)&&!ids.has(h.id)&&integer(h.at,0,9e15)&&integer(h.delta,-1e7,1e7)&&typeof h.label==='string'&&h.label.length<=200&&['earn','spend','adjust'].includes(h.type),'Повреждена история копилки.');ids.add(h.id);balance+=h.delta;need(balance>=0&&balance<=1e7,'Неверный баланс в истории.');need(h.type!=='spend'||h.delta<0,'Неверное списание.');need(h.type!=='earn'||h.delta>=0,'Неверная награда.');return {id:h.id,at:h.at,delta:h.delta,type:h.type,label:h.label};});need(balance===a.balance,'Баланс не совпадает с историей.');
    const daily={};need(a.daily&&typeof a.daily==='object'&&!Array.isArray(a.daily),'Неверный дневной счётчик.');Object.entries(a.daily).forEach(([k,v])=>{need(validDate(k)&&integer(v,0,1e7),'Неверная дневная награда.');daily[k]=v;});out.wallet={balance,counts:a.counts.slice(),history,daily};
    out.credits={};need(s.credits&&typeof s.credits==='object'&&!Array.isArray(s.credits),'Неверный счётчик ответов.');Object.entries(s.credits).forEach(([k,v])=>{need(k.length<=100&&/^.+\|[012]$/.test(k)&&validDate(v),'Неверный счётчик слов.');out.credits[k]=v;});
    need(Array.isArray(s.sessions)&&s.sessions.length<=2000,'Неверная история занятий.');out.sessions=s.sessions.map(r=>{need(r&&integer(r.at,0,9e15)&&integer(r.total,0,100)&&integer(r.correct,0,r.total)&&typeof r.title==='string'&&r.title.length<=100,'Повреждена история занятий.');return {at:r.at,total:r.total,correct:r.correct,title:r.title};});return out;
  }
  function markSeen(s,d,w) {const p=stat(s,d,w);p.seen=true;s.progress[key(d,w)]=p;}
  function reward(s,w,mode,now) {
    const b=band(mode),today=day(now),credit=norm(w.en)+'|'+b;
    if(s.credits[credit]===today)return {minutes:0,reason:'repeat'};
    const available=Math.max(0,s.settings.dailyCap-(s.wallet.daily[today]||0));
    if(!available)return {minutes:0,reason:'cap'};
    if(s.settings.rewards[b]===0)return {minutes:0,reason:'disabled'};
    s.credits[credit]=today;s.wallet.counts[b]++;
    if(s.wallet.counts[b]<10)return {minutes:0,reason:'counted'};
    s.wallet.counts[b]=0;const minutes=Math.min(s.settings.rewards[b],available);
    s.wallet.daily[today]=(s.wallet.daily[today]||0)+minutes;
    entry(s,minutes,'earn',LABELS[b],now);return {minutes,reason:'earned'};
  }
  function entry(s,delta,type,label,now=Date.now()) {
    need(integer(delta,-1e7,1e7)&&s.wallet.balance+delta>=0&&s.wallet.balance+delta<=1e7,'Недостаточно минут или слишком большое число.');
    need(s.wallet.history.length<20000,'История копилки заполнена. Сохрани резервную копию и обратись к родителю.');
    const e={id:uid(),at:now,delta,type,label};s.wallet.balance+=delta;s.wallet.history.push(e);return e;
  }
  function spend(s,n,now=Date.now()) {need(integer(n,1,s.wallet.balance),'Выбери количество в пределах баланса.');return entry(s,-n,'spend','Минуты на Roblox',now);}
  function applyAnswer(s,q,correct,hinted=false,now=Date.now()) {
    const p=stat(s,q.deck,q.word);p.seen=true;p.last=now;const b=band(q.mode);
    // Letter scaffolds are practice; they do not establish independent spelling mastery.
    if(b!==1){const v=p[b===0?'t':'s'];if(correct&&!hinted){v.ok++;v.streak++;if(!v.days.includes(day(now)))v.days.push(day(now));v.days=v.days.slice(-60);v.due=now+[1,2,4,7,14][Math.min(v.days.length-1,4)]*86400000;}else{v.wrong++;v.streak=0;v.due=now;}}
    s.progress[key(q.deck,q.word)]=p;
    return correct&&!hinted?reward(s,q.word,q.mode,now):{minutes:0,reason:'practice'};
  }
  function eligibleModes(s,d,w,selected) {
    if(selected!=='auto')return [selected];
    const p=stat(s,d,w);
    if(p.t.ok<2)return ['enru','ruen'];
    if(p.s.ok<1)return ['gap','build','write'];
    return ['write','ruen','write'];
  }
  function question(s,d,w,mode) {
    const q={deck:d,word:w,mode};
    if(mode==='enru'||mode==='ruen'){
      const overlap=(a,b)=>a.ru.some(x=>b.ru.some(y=>norm(x)===norm(y)));
      const others=d.words.filter(x=>x.id!==w.id&&!overlap(x,w));
      q.options=shuffle([w,...shuffle(others).slice(0,3)]).map(x=>({id:x.id,text:mode==='enru'?x.ru.join('; '):x.en}));
      if(q.options.length<2){q.mode='write';}
    }
    if(q.mode==='gap'){
      const positions=[...w.en].map((c,i)=>/[a-z]/i.test(c)?i:-1).filter(i=>i>=0);q.gap=positions[Math.floor(Math.random()*positions.length)];q.answer=w.en[q.gap];q.mask=w.en.slice(0,q.gap)+'＿'+w.en.slice(q.gap+1);
    }
    if(q.mode==='build')q.letters=shuffle([...w.en].map((c,i)=>({c,id:i})));
    return q;
  }
  function next(s, deckId, selected='auto', used={}, previous='', hard=false, n=0, now=Date.now()) {
    need(selected==='auto'||MODES.includes(selected),'Неизвестное упражнение.');
    const decks=studyDecks(s,deckId);need(decks.length,'Сначала выбери набор.');
    let pool=decks.flatMap(d=>d.words.map(w=>({d,w})));
    if(hard){const filtered=pool.filter(({d,w})=>{const p=stat(s,d,w);return !mastered(p.t)||!mastered(p.s);});if(filtered.length)pool=filtered;}
    const candidates=pool.filter(({d,w})=>key(d,w)!==previous);if(candidates.length)pool=candidates;
    if(deckId==='__all__'){
      const visits=Object.fromEntries(decks.map(d=>[d.id,d.words.reduce((n,w)=>n+(used[key(d,w)]||0),0)]));
      const least=Math.min(...pool.map(({d})=>visits[d.id]));pool=pool.filter(({d})=>visits[d.id]===least);
    }
    pool=shuffle(pool).sort((a,b)=>{
      function score({d,w}){const p=stat(s,d,w);return (used[key(d,w)]||0)*100 + (mastered(p.t)&&mastered(p.s)?20:0)+(p.t.due>now&&p.s.due>now?5:0);}
      return score(a)-score(b);
    });
    const {d,w}=pool[0], modes=eligibleModes(s,d,w,selected);return question(s,d,w,modes[Math.floor(Math.random()*modes.length)]);
  }
  function check(q,value) {return ['enru','ruen'].includes(q.mode)?value===q.word.id:norm(value)===norm(q.mode==='gap'?q.answer:q.word.en);}
  function studyDecks(s,id) {return id==='__all__'?s.decks.filter(d=>!d.archived):s.decks.filter(d=>d.id===id);}
  function preferred(s) {const active=s.decks.filter(d=>!d.archived);const upcoming=active.filter(d=>d.due&&d.due>=day()).sort((a,b)=>a.due.localeCompare(b.due));return active.find(d=>d.id===s.active)||upcoming[0]||active[0];}
  return {MODES,LABELS,uid,norm,day,band,key,clone,capital,shuffle,cleanDeck,parseLines,initial,stat,mastered,summary,install,exportDeck,decode,validateState,markSeen,applyAnswer,entry,spend,next,question,check,preferred,studyDecks};
});
