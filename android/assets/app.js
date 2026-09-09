(() => {
  'use strict';
  const E=WordsEngine, A=window.WordsAndroid, $=s=>document.querySelector(s), root=$('#app');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modes={enru:['Английский → русский','Выбери перевод'],ruen:['Русский → английский','Найди английское слово'],gap:['Пропущенная буква','Вставь одну букву'],build:['Собери слово','Расставь буквы по местам'],write:['Напиши слово','Вспомни английское написание'],listen:['Мини-диктант','Послушай и напиши']};
  const symbols=['🔎','🧩','✍️'];
  const plural=(n,forms)=>forms[(n%100>=11&&n%100<=14)?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
  const wordCount=n=>n+' '+plural(n,['слово','слова','слов']);
  const minuteWord=n=>plural(n,['минута','минуты','минут']);
  let state, screen='home', selectedDeck='', modalAction=null, session=null, q=null, answered=false, hinted=false, chosen=[], editId='', draft=null, cardIndex=0, cardWords=[], cardReturn='home', imported=null, authUntil=0, spendAmount=5, fatal=false;
  let handwritingRequest=0;
  let audioStatus={ready:false,message:A?'Проверяем английский голос…':'В предпросмотре звук зависит от голосов компьютера.'};
  const stamp=t=>new Date(t).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const dateLabel=s=>s?new Date(s+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'Без даты урока';
  const deck=()=>state.decks.find(d=>d.id===selectedDeck)||E.preferred(state);
  const button=(label,action,cls='primary',extra='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
  const meter=(n,total)=>`<div class="progress" data-pct="${Math.min(100,total?n/total*100:0)}"><i></i></div>`;
  const brand=()=>'<div class="hero-art" aria-hidden="true"><div class="book">Aa</div><span class="star">✦</span><span class="star two">✧</span></div>';
  function persist(next) {
    const text=JSON.stringify(next);
    if(text.length>5*1024*1024)throw Error('Данные занимают слишком много места. Сначала сохрани резервную копию.');
    if(A){if(!A.saveState(text))throw Error('Не удалось сохранить данные на телефоне. Изменение не применено. Освободи место и попробуй ещё раз.');}
    else localStorage.setItem('mayusha-words-v1',text);
  }
  function change(fn) {const next=E.clone(state);const result=fn(next);persist(next);state=next;return result;}
  function toast(text) {$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4200);}
  function paint() {document.querySelectorAll('[data-pct]').forEach(el=>el.style.setProperty('--pct',el.dataset.pct+'%'));}
  function nav() {return `<nav class="bottom-nav" aria-label="Разделы">${[['home','⌂','Занятие'],['sets','▤','Наборы'],['wallet','♧','Копилка'],['parent','⚙','Родителям']].map(([a,i,t])=>`<button data-action="${a}" class="${screen===a?'active':''}"><span class="nav-icon" aria-hidden="true">${i}</span>${t}</button>`).join('')}</nav>`;}
  function top(title,back='home') {return `<div class="row top"><button class="iconbtn" data-action="${back}" aria-label="Назад">‹</button><span class="eyebrow grow center">${esc(title)}</span><div class="iconbtn" aria-hidden="true">✧</div></div>`;}
  function shell(content,withNav=true) {root.innerHTML=content+(withNav?nav():'');paint();window.scrollTo(0,0);}
  function closeModal() {$('#overlay').innerHTML='';modalAction=null;$('#study-target')?.setAttribute('aria-expanded','false');if(modal.focus?.isConnected)modal.focus.focus();}
  function modal(title,body,yes,fn,no='Отмена') {
    closeModal();const focus=document.activeElement;
    $('#overlay').innerHTML=`<div class="modal-bg"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(title)}</h2>${body}${yes?button(yes,'modal-ok'):''}${button(no,'modal-close','secondary')}<div class="error" id="modal-error" role="alert"></div></section></div>`;
    modalAction=fn;modal.focus=focus;setTimeout(()=>$('#overlay input, #overlay button')?.focus(),30);
  }
  function err(error){const el=$('#modal-error')||$('#form-error');if(el)el.textContent=error.message||String(error);else toast(error.message||String(error));}
  const protectedScreen=s=>['parent','settings','report','editor'].includes(s);
  function lockParent(){authUntil=0;if(A)A.lockParent();}
  function openScreen(s) {if(protectedScreen(screen)&&!protectedScreen(s))lockParent();screen=s;render();}
  function render() {
    if(fatal)return;
    if(!state.profile.ready){welcome();return;}
    ({home,sets,detail,train,cards,wallet,parent,editor,report,settings,result,importPreview}[screen]||home)();
  }
  function welcome() {
    shell(`<div class="intro"><div class="hero">${brand()}<div class="eyebrow">Маленькие слова · большие открытия</div><h1>Английские слова<span>для Майюши</span></h1><p class="muted">Слушаем, запоминаем и собираем<br>свою копилку маленьких побед.</p></div><section class="card form"><h2>Начнём со знакомства</h2><p class="note">Первую настройку проходит мама или папа. На каждом телефоне можно установить свой PIN.</p><label for="welcome-name">Как обращаться к ребёнку?</label><input id="welcome-name" maxlength="30" value="${esc(state.profile.name)}" autocomplete="off"><label for="welcome-gen">Для кого? Например, для Майюши</label><input id="welcome-gen" maxlength="40" value="${esc(state.profile.genitive)}" autocomplete="off"><label for="welcome-pin">Придумайте родительский PIN</label><input id="welcome-pin" type="password" inputmode="numeric" maxlength="6" placeholder="От 4 до 6 цифр" autocomplete="new-password"><label for="welcome-confirm">Повторите PIN</label><input id="welcome-confirm" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"><p class="note">Сохраните PIN у себя: он нужен для настройки наград и редактирования слов.</p><div class="divider"></div><h3>Проверим английский голос</h3><p class="note" id="voice-status">${esc(audioStatus.message)}</p><div class="two mt-sm">${button('🔊 Проверить звук','test-voice','secondary')}${button('Настроить голос','tts-settings','secondary')}</div><div class="error" id="form-error" role="alert"></div><div class="mt">${button('Начать приключение →','setup')}</div></section></div>`,false);
  }
  function home() {
    const active=state.decks.filter(d=>!d.archived),all=state.active==='__all__'&&active.length>0;
    const one=E.preferred(state);selectedDeck=all?'__all__':one?.id||'';
    const d=all?{id:'__all__',title:'Все активные наборы',due:''}:one;
    const p=all?active.reduce((a,x)=>{const b=E.summary(state,x);for(const k of Object.keys(a))a[k]+=b[k];return a;},{translation:0,spelling:0,seen:0,total:0}):d?E.summary(state,d):null;
    shell(`<div class="row between top"><span class="eyebrow"><span class="brand-dot"></span>Маленькие открытия</span>${button('⚙','parent','iconbtn','aria-label="Родителям"')}</div><div class="hero">${brand()}<div class="eyebrow">Твоя английская история</div><h1>Английские слова<span>для ${esc(state.profile.genitive)}</span></h1><p class="muted">По одному слову к новым открытиям</p></div><button class="wallet-link" data-action="wallet"><span class="gift">🎁</span><div class="grow"><strong class="smallword">Копилка времени</strong><div class="caption">Твои минуты на Roblox</div></div><div class="balance"><strong>${state.wallet.balance}</strong><small>МИНУТ ›</small></div></button><div class="row between section-title"><h3>Твоё занятие</h3>${d?.due?`<span class="badge">${esc(dateLabel(d.due))}</span>`:''}</div>${d?`<section class="card"><div class="study-picker"><span id="study-label">Что будем практиковать?</span><button id="study-target" class="scope-trigger" data-action="choose-scope" data-id="${esc(selectedDeck)}" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="study-label study-value"><span id="study-value">${esc(d.title)}</span><span class="scope-chevron" aria-hidden="true">⌄</span></button></div><div class="eyebrow mt">${all?'Смешанная тренировка':'Только выбранный набор'}</div><h2 class="mt-sm">${esc(d.title)}</h2><p class="note">${wordCount(p.total)} · 10 заданий · в своём темпе</p><div class="meter-label"><span>Помню перевод</span><strong>${p.translation} / ${p.total}</strong></div>${meter(p.translation,p.total)}<div class="meter-label"><span>Пишу самостоятельно</span><strong>${p.spelling} / ${p.total}</strong></div>${meter(p.spelling,p.total)}<div class="mt">${button('Начать занятие <span aria-hidden="true">→</span>','start-auto')}</div>${button('Сначала посмотреть карточки','open-cards','textbtn')}</section>`:`<section class="card empty"><span class="symbol">💌</span><h2>Ждём первые слова</h2><p class="note">Открой набор, который прислал папа, или попроси взрослого создать его здесь.</p><div class="mt">${button('Открыть файл со словами','pick-file')}</div></section>`}<div class="row between section-title"><h3>Потренируемся?</h3></div><div class="levels">${E.LABELS.map((l,i)=>`<button class="level" data-action="choose-band" data-band="${i}" ${!d?'disabled':''}><span class="symbol">${symbols[i]}</span><strong>${l}</strong><small>+${state.settings.rewards[i]} мин / 10 верных</small></button>`).join('')}</div>${d?`<div class="mt-sm">${button('Повторить трудные слова','start-hard','secondary')}</div>`:''}<p class="quote">С любовью для ${esc(state.profile.genitive)} ♡</p>`);
  }
  function chooseScope() {
    const active=state.decks.filter(d=>!d.archived);
    const option=(id,title,note,icon)=>button(`<span class="scope-icon" aria-hidden="true">${icon}</span><span class="scope-copy"><strong>${esc(title)}</strong><small>${esc(note)}</small></span><span class="scope-check" aria-hidden="true">${selectedDeck===id?'✓':''}</span>`,'select-scope',`scope-option ${id==='__all__'?'scope-all ':''}${selectedDeck===id?'selected':''}`,`data-id="${esc(id)}" aria-pressed="${selectedDeck===id}"`);
    modal('Что будем практиковать?',`<p>Выбери слова для сегодняшнего занятия.</p><div class="scope-options">${option('__all__','Все активные наборы',`${active.length} ${plural(active.length,['набор','набора','наборов'])} · ${wordCount(active.reduce((n,d)=>n+d.words.length,0))}`,'✦')}<div class="eyebrow scope-group">Один набор</div>${active.map(d=>option(d.id,d.title,`${wordCount(d.words.length)} · ${dateLabel(d.due)}`,'▤')).join('')}</div>`,null,null,'Готово');
    $('#overlay .modal').classList.add('scope-dialog');
    $('#study-target')?.setAttribute('aria-expanded','true');
  }
  function sets() {
    shell(`${top('Мои наборы')}<div class="row between"><h1>Слова к урокам</h1><span class="badge">${state.decks.filter(d=>!d.archived).length} ${plural(state.decks.filter(d=>!d.archived).length,['набор','набора','наборов'])}</span></div><p class="note">У каждого урока — своя маленькая история.</p><div class="two mt">${button('↓ Открыть файл','pick-file','secondary')}${button('+ Создать','new-deck','secondary tint')}</div>${state.decks.some(d=>!d.archived)?`<div class="mt-sm">${button('Практиковать все активные наборы','study-all','secondary tint')}</div>`:''}<div class="stack mt">${state.decks.filter(d=>!d.archived).map(deckCard).join('')||'<div class="card empty">Пока нет наборов. Добавь первый файл со словами.</div>'}</div>${state.decks.some(d=>d.archived)?`<h3 class="section-title">В архиве</h3><div class="stack">${state.decks.filter(d=>d.archived).map(deckCard).join('')}</div>`:''}<p class="note mt">Если мессенджер не предложил открыть файл в приложении, сначала сохрани его, затем нажми «Открыть файл» здесь.</p>`);
  }
  function deckCard(d) {const p=E.summary(state,d);return `<article class="card deck-card" data-deck-id="${d.id}"><div class="row between"><span class="eyebrow">${esc(dateLabel(d.due))}${d.archived?' · архив':''}</span>${button('⋯','deck-menu','iconbtn',`data-id="${d.id}" aria-label="Действия с набором ${esc(d.title)}"`)}</div><button class="deck-open" data-action="deck" data-id="${d.id}"><h3>${esc(d.title)}</h3><p class="note">${wordCount(d.words.length)} · пишу ${p.spelling} из ${p.total}</p>${meter(p.spelling,p.total)}</button><div class="deck-actions">${button('Заниматься →','study-deck','secondary tint',`data-id="${d.id}"`)}${button('Отправить','quick-share','secondary',`data-id="${d.id}"`)}</div></article>`;}
  function deckMenu(id) {
    const d=state.decks.find(d=>d.id===id);if(!d)return;selectedDeck=id;
    modal(d.title,`<div class="stack mt">${button('Редактировать','menu-edit','secondary')}${button('Отправить набор','menu-share','secondary')}${button(d.archived?'Вернуть из архива':'В архив','menu-archive','secondary')}</div>`,null,null,'Закрыть');
  }
  function detail() {
    const d=deck();if(!d){openScreen('sets');return;}
    const p=E.summary(state,d);
    shell(`${top('Набор слов','sets')}<div class="eyebrow">${esc(dateLabel(d.due))}${d.archived?' · архив':''}</div><h1 class="mt-sm">${esc(d.title)}</h1><p class="note">${wordCount(d.words.length)} · ${p.seen} уже знакомы</p><div class="two mt">${button('Карточки 🔊','open-cards','secondary')}${button('Заниматься →','start-auto','secondary tint')}</div><div class="card mt">${d.words.map(w=>{const p=E.stat(state,d,w);return `<div class="listrow"><div class="grow"><strong lang="en">${esc(w.en)}</strong><p>${esc(w.ru.join('; '))}</p><div class="chips">${E.mastered(p.t)?'<span class="chip done">Перевод ✓</span>':''}${E.mastered(p.s)?'<span class="chip done">Написание ✓</span>':''}</div></div>${button('🔊','speak-word','iconbtn',`data-id="${w.id}" aria-label="Послушать ${esc(w.en)}"`)}</div>`;}).join('')}</div><div class="two mt">${button('Отправить набор','export-deck','secondary')}${button('Редактировать','edit-deck','secondary')}</div>${button(d.archived?'Вернуть из архива':'В архив','archive','textbtn')}${button('Удалить набор','delete-deck','textbtn danger')}`);
  }
  function start(mode='auto',hard=false) {
    const decks=E.studyDecks(state,selectedDeck);if(!decks.length)return;const all=selectedDeck==='__all__',d=decks[0];
    session={deckId:selectedDeck,title:all?'Все активные наборы':d.title,mode,hard,used:{},previous:'',retries:[],total:0,correct:0,minutes:0,goal:10,started:Date.now()};
    if(mode==='auto'){cardWords=decks.flatMap(d=>d.words.map((w,i)=>({deck:d,word:w,index:i}))).filter(x=>!E.stat(state,x.deck,x.word).seen);if(all)cardWords=cardWords.sort((a,b)=>a.index-b.index).slice(0,10);if(cardWords.length){cardIndex=0;cardReturn='session';screen='cards';cards();return;}}
    advance();
  }
  function advance() {
    if(!session)return;
    if(session.total>=session.goal){finish();return;}
    const retry=session.retries.findIndex(r=>r.after<=session.total&&E.key(r.deck,r.word)!==session.previous);
    if(retry>=0){const r=session.retries.splice(retry,1)[0];q=E.question(state,r.deck,r.word,r.mode);}
    else q=E.next(state,session.deckId,session.mode,session.used,session.previous,session.hard,session.total);
    handwritingRequest++;answered=false;hinted=false;chosen=[];screen='train';train();
  }
  function soundControls(text,dictation=false) {
    return `<div class="soundrow">${button('🔊 Послушать','speak-question','sound')}${button('Помедленнее','speak-slow','sound')}</div>${dictation?'<p class="note" id="audio-note">Нажми «Послушать», затем напиши слово.</p>':''}`;
  }
  function train() {
    if(!q||!session){openScreen('home');return;}
    const w=q.word;const prompt=['enru'].includes(q.mode)?w.en:['ruen','write','build'].includes(q.mode)?w.ru.join('; '):q.mode==='gap'?q.mask:'🔊';
    shell(`${top('Твоя тренировка','exit-session')}<div class="row between"><span class="small muted">${esc(q.deck.title)}</span><strong class="small purple">${session.total+1} / ${session.goal}</strong></div>${meter(session.total,session.goal)}<div class="study-head"><div class="eyebrow mt">${esc(modes[q.mode][1])}</div></div><section class="card study-card"><div class="word ${prompt.length>22?'smallword':''}" ${['enru','gap'].includes(q.mode)?'lang="en"':''}>${esc(prompt)}</div>${q.mode==='listen'?soundControls(w.en,true):['enru','gap','build'].includes(q.mode)?soundControls(w.en):''}</section><div id="answer-area" class="mt">${answerUI()}</div><div id="feedback" aria-live="polite"></div>${button('Показать слово и потренироваться','hint','textbtn','id="hint-button"')}`,false);
  }
  function answerUI() {
    if(['enru','ruen'].includes(q.mode))return `<div class="stack">${q.options.map(o=>button(esc(o.text),'choice','choice',`data-id="${o.id}"`)).join('')}</div>`;
    if(q.mode==='build')return `<div id="built" class="built" aria-label="Собранное слово"></div><div class="letters">${q.letters.map(l=>button(l.c===' '?'␣':esc(l.c),'letter','letter',`data-id="${l.id}" aria-label="${l.c===' '?'Пробел':esc(l.c)}"`)).join('')}</div>${button('Проверить','check','primary')}`;
    return `<label class="sr-only" for="answer">${q.mode==='gap'?'Пропущенная буква':'Ответ на английском'}</label><div class="center"><input id="answer" class="answer ${q.mode==='gap'?'gap':''}" type="text" lang="en" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" maxlength="${q.mode==='gap'?1:80}" placeholder="${q.mode==='gap'?'?':'Твой ответ'}" enterkeyhint="done"></div><div class="mt-sm">${button('✎ Написать рукой','handwriting','secondary tint')}</div><p class="note center">Пальцем или стилусом · менять клавиатуру не нужно</p><div class="mt-sm">${button('Проверить','check')}</div>`;
  }

  function submit(value) {
    if(answered)return;
    if(!String(value).trim()){toast('Сначала напиши ответ.');return;}
    const correct=E.check(q,value), result=change(s=>E.applyAnswer(s,q,correct,hinted));
    answered=true;session.total++;if(correct&&!hinted)session.correct++;session.minutes+=result.minutes;
    if((!correct||hinted)&&session.total+3<session.goal)session.retries.push({deck:q.deck,word:q.word,mode:q.mode,after:session.total+3});
    session.used[E.key(q.deck,q.word)]=(session.used[E.key(q.deck,q.word)]||0)+1;session.previous=E.key(q.deck,q.word);
    $('#answer-area').querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);$('#hint-button').hidden=true;
    if(['enru','ruen'].includes(q.mode))$('#answer-area').querySelectorAll('button').forEach(b=>{if(b.dataset.id===q.word.id)b.classList.add('correct');else if(b.dataset.id===value)b.classList.add('wrong');});
    const message=correct?(hinted?'Хорошая тренировка!':'Получилось! ✨'):'Давай запомним вместе';
    const info=result.minutes?`+${result.minutes} минут в копилку!`:result.reason==='repeat'?'Это слово сегодня уже принесло балл на этом уровне. Сейчас закрепляем.':result.reason==='cap'?'Сегодняшние минуты уже заработаны. Можно продолжить для себя.':hinted?'Позже попробуем вспомнить без подсказки.':correct?'Ещё одно слово стало ближе.':'Посмотри на написание. Слово встретится снова.';
    $('#feedback').innerHTML=`<section class="feedback ${correct?'good':''}"><h3>${message}</h3><div class="correct-word" lang="en">${esc(q.word.en)}</div><p class="muted">${esc(q.word.ru.join('; '))}</p><p class="note">${info}</p>${button('🔊 Послушать','speak-question','textbtn')}${button(session.total===session.goal?'Посмотреть результат →':'Дальше →','next')}</section>`;
    document.activeElement?.blur();$('#feedback').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function finish() {
    if(session.total)change(s=>{s.sessions.push({at:Date.now(),title:session.title,total:session.total,correct:session.correct});s.sessions=s.sessions.slice(-2000);});
    screen='result';result();
  }
  function result() {
    if(!session){openScreen('home');return;}
    shell(`${top('Маленькая победа')}<div class="hero"><div class="word">✨</div><div class="eyebrow">${esc(state.profile.name)}, молодец!</div><h1>Занятие завершено</h1><p class="muted">Каждая попытка помогает запомнить.</p></div><div class="two"><div class="statbox"><strong>${session.correct} / ${session.total}</strong><small>верно без подсказки</small></div><div class="statbox"><strong>+${session.minutes}</strong><small>минут на Roblox</small></div></div><div class="card mt"><h3>Следующий шаг</h3><p class="note">Вернись к словам в другой день — проверим, что осталось в памяти. Ошибки тоже помогают понять, что повторить.</p></div><div class="mt">${button('Вернуться к словам','home')}</div>${button('Ещё 10 заданий','again','secondary')}${button('Открыть копилку','wallet','textbtn')}`);
  }
  function cards() {
    const item=cardWords[cardIndex];if(!item){if(cardReturn==='session')advance();else openScreen(cardReturn);return;}
    const w=item.word;
    shell(`${top('Знакомимся со словами',cardReturn==='session'?'exit-session':cardReturn)}<div class="row between"><span class="small muted">${esc(item.deck.title)}</span><strong class="small purple">${cardIndex+1} / ${cardWords.length}</strong></div>${meter(cardIndex+1,cardWords.length)}<section class="card study-card mt"><div class="eyebrow">Посмотри и послушай</div><div class="word mt" lang="en">${esc(w.en)}</div><div class="translation">${esc(w.ru.join('; '))}</div>${soundControls(w.en)}</section><p class="note center mt">Можно произнести слово про себя и представить его значение.</p><div class="mt">${button(cardIndex===cardWords.length-1?(cardReturn==='session'?'Перейти к заданиям →':'Готово ✓'):'Следующее слово →','card-next')}</div>${cardIndex?button('Предыдущее слово','card-prev','textbtn'):''}`,false);
  }
  function wallet() {
    spendAmount=Math.min(spendAmount,state.wallet.balance)||Math.min(5,state.wallet.balance);
    const w=state.wallet;
    shell(`${top('Твоя копилка')}<div class="hero"><div class="word">🎁</div><div class="eyebrow">Маленькие победы · настоящие награды</div><div class="wallet-number num">${w.balance} <small>${minuteWord(w.balance)}</small></div><p class="muted">На твои приключения в Roblox</p></div><section class="card lavender"><h3>До следующей награды</h3>${E.LABELS.map((l,i)=>`<div class="meter-label"><strong>${symbols[i]} ${l} · +${state.settings.rewards[i]} мин</strong><span>${w.counts[i]} / 10</span></div>${meter(w.counts[i],10)}`).join('')}<p class="note">Сегодня заработано ${w.daily[E.day()]||0} из ${state.settings.dailyCap} минут. За одно слово на каждом уровне — один балл в день. Счётчики сохраняются между занятиями.</p></section><section class="card mt"><h2>🎮 Пора в Roblox?</h2><p class="note">Выбери минуты из копилки. Подготовим просьбу маме, а она добавит время в Family Link.</p>${w.balance?`<div class="pills mt">${[5,10,15,30].filter(n=>n<=w.balance).map(n=>button(n+' мин','amount','pill '+(n===spendAmount?'selected':''),`data-n="${n}"`)).join('')}</div><div class="form"><label for="spend-n">Количество минут</label><input id="spend-n" type="number" inputmode="numeric" min="1" max="${w.balance}" value="${spendAmount}"></div><div class="mt">${button('Потратить минуты на Roblox','spend')}</div>`:'<p class="note mt">Первые минуты появятся здесь после верных ответов. Начнём?</p>'+button('К занятию','home','secondary')}</section><h3 class="section-title">История копилки</h3><div class="card">${w.history.length?w.history.slice().reverse().slice(0,100).map(h=>`<div class="listrow"><div class="grow"><strong>${esc(h.label)}</strong><p>${stamp(h.at)}</p>${h.type==='spend'?button('Написать маме ↗','reshare','textbtn',`data-id="${h.id}"`):''}</div><strong class="${h.delta>0?'earned':'muted'} num">${h.delta>0?'+':''}${h.delta} мин</strong></div>`).join(''):'<p class="muted center">Здесь будут твои первые награды.</p>'}</div>${w.history.length>100?'<p class="note">Показаны последние 100 записей. Полная история сохраняется в резервной копии.</p>':''}`);
  }
  async function digest(pin,salt) {const bytes=new TextEncoder().encode(salt+':'+pin);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function hasPin(){return A?A.hasPin():!!localStorage.getItem('words-pin');}
  async function setPin(pin){if(A){if(!A.setPin(pin))throw Error('Не удалось сохранить PIN. Войдите в родительский раздел ещё раз.');}else{const salt=E.uid();localStorage.setItem('words-pin',JSON.stringify({salt,hash:await digest(pin,salt)}));}}
  async function verifyPin(pin){if(A){const result=A.verifyPin(pin);if(result==='ok')return true;throw Error(result);}const x=JSON.parse(localStorage.getItem('words-pin'));if(x&&x.hash===await digest(pin,x.salt))return true;throw Error('Неверный PIN. Попробуйте ещё раз.');}
  function authorized(){return Date.now()<authUntil;}
  async function requireParent(fn,force=false) {
    if(force)lockParent();
    if(authorized()){fn();return;}
    const exists=await hasPin();
    modal(exists?'Родительский раздел':'Установите родительский PIN',`<p>${exists?'Введите PIN, чтобы изменить слова или настройки.':'От 4 до 6 цифр. Сохраните PIN у себя.'}</p><div class="form"><label for="pin">PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>`,exists?'Войти':'Сохранить PIN',async()=>{const pin=$('#pin').value;if(!/^\d{4,6}$/.test(pin))throw Error('Введите от 4 до 6 цифр.');if(exists)await verifyPin(pin);else await setPin(pin);authUntil=Date.now()+5*60000;closeModal();fn();});
  }
  function parent() {
    if(!authorized()){screen='home';home();requireParent(()=>openScreen('parent'));return;}
    shell(`${top('Для мамы и папы')}<h1>Родительский уголок</h1><p class="note">Слова к уроку, маленькие успехи и правила наград.</p><div class="stack mt">${button('＋ Создать набор слов','new-deck','secondary')}${button('▤ Посмотреть прогресс','report','secondary')}${button('⚙ Имя, голос и награды','settings','secondary')}${button('↑ Сохранить резервную копию','backup','secondary')}${button('↓ Восстановить из файла','pick-backup','secondary')}${button('± Исправить баланс копилки','adjust','secondary')}${button('Изменить PIN','change-pin','secondary')}</div><section class="card soft mt"><h3>Как передать слова</h3><p class="note">Создайте набор на своём телефоне → откройте его → «Отправить набор» → выберите мессенджер. На телефоне Майюши откройте полученный файл и добавьте слова.</p><p class="note">Копилка и прогресс у каждого телефона свои. Резервная копия переносит все данные целиком; используйте её для сохранения или смены телефона.</p></section>${button('Закрыть родительский раздел','lock','textbtn')}`);
  }
  function editor() {
    if(!authorized()){requireParent(()=>editor());return;}
    const d=state.decks.find(x=>x.id===editId);
    const x=draft||{title:d?.title||'',due:d?.due||'',lines:d?.words.map(w=>w.en+' — '+w.ru.join('; ')).join('\n')||''};
    shell(`${top(d?'Редактируем набор':'Новый набор','editor-back')}<h1>${d?'Слова к уроку':'Добавим новые слова'}</h1><div class="form"><label for="deck-title">Название набора</label><input id="deck-title" maxlength="100" value="${esc(x.title)}" placeholder="Например, к уроку в четверг"><label for="deck-due">Дата урока</label><input id="deck-due" type="date" value="${esc(x.due)}"><label for="deck-lines">Слова и переводы</label><textarea id="deck-lines" rows="10" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="slow — медленный&#10;fast — быстрый&#10;young — молодой">${esc(x.lines)}</textarea><p class="note">Одна строка — одно слово. Несколько переводов разделяйте точкой с запятой: short — короткий; невысокий. Первая буква английского слова и каждого перевода станет заглавной при сохранении. Чтобы удалить слово, удалите его строку.</p><div class="error" id="form-error" role="alert"></div><div class="mt">${button('Проверить и сохранить','save-deck')}</div></div>`,false);
  }
  function report() {
    shell(`${top('Прогресс','parent')}<h1>Как идут дела</h1><p class="note">Отмечаем уверенное знание после самостоятельных верных ответов в разные дни.</p><div class="stack mt">${state.decks.map(d=>{const a=E.summary(state,d);return `<section class="card"><h2>${esc(d.title)}</h2><div class="two mt-sm"><div class="statbox"><strong>${a.translation}/${a.total}</strong><small>помнит перевод</small></div><div class="statbox"><strong>${a.spelling}/${a.total}</strong><small>пишет сама</small></div></div>${d.words.map(w=>{const p=E.stat(state,d,w);return `<div class="listrow"><div class="grow"><strong>${esc(w.en)}</strong><p>${p.last?'Последняя попытка: '+stamp(p.last):'Ещё не проверяли'}</p><div class="chips"><span class="chip ${E.mastered(p.t)?'done':''}">Перевод: ${E.mastered(p.t)?'получается':p.t.ok?'закрепляем':'изучаем'}</span><span class="chip ${E.mastered(p.s)?'done':''}">Письмо: ${E.mastered(p.s)?'получается':p.s.ok?'закрепляем':'изучаем'}</span></div><p>Ошибки и подсказки: перевод ${p.t.wrong}, письмо ${p.s.wrong}</p></div></div>`;}).join('')}</section>`;}).join('')}</div><h3 class="section-title">Последние занятия</h3><div class="card">${state.sessions.length?state.sessions.slice(-20).reverse().map(r=>`<div class="listrow"><div class="grow"><strong>${esc(r.title)}</strong><p>${stamp(r.at)}</p></div><span class="badge">${r.correct} / ${r.total}</span></div>`).join(''):'<p class="muted">Завершённых занятий пока нет.</p>'}</div>`);
  }
  function settings() {
    shell(`${top('Настройки','parent')}<h1>Всё для ${esc(state.profile.genitive)}</h1><div class="form"><label for="setting-name">Имя</label><input id="setting-name" value="${esc(state.profile.name)}" maxlength="30"><label for="setting-gen">Для кого?</label><input id="setting-gen" value="${esc(state.profile.genitive)}" maxlength="40"><label for="accent">Английское произношение</label><select id="accent"><option value="en-GB" ${state.settings.accent==='en-GB'?'selected':''}>Британское</option><option value="en-US" ${state.settings.accent==='en-US'?'selected':''}>Американское</option></select><p class="note" id="voice-status">${esc(audioStatus.message)}</p><div class="two mt-sm">${button('🔊 Проверить голос','test-voice','secondary')}${button('Настроить голос','tts-settings','secondary')}</div><h3 class="section-title">Минуты за 10 верных ответов</h3>${E.LABELS.map((l,i)=>`<label for="reward-${i}">${symbols[i]} ${l}</label><input id="reward-${i}" type="number" inputmode="numeric" min="0" max="60" value="${state.settings.rewards[i]}">`).join('')}<label for="daily-cap">Максимум заработанных минут за день</label><input id="daily-cap" type="number" inputmode="numeric" min="0" max="180" value="${state.settings.dailyCap}"><p class="note">0 отключает начисление. Баланс и уже заработанные минуты сохраняются. Один и тот же ответ на слово приносит балл не чаще раза в день на каждом уровне.</p><div class="error" id="form-error" role="alert"></div><div class="mt">${button('Сохранить настройки','save-settings')}</div></div>`);
  }
  function importPreview() {
    if(!imported){openScreen('sets');return;}
    if(imported.kind==='backup'){
      const x=imported.state; shell(`${top('Резервная копия','cancel-import')}<h1>Восстановить данные?</h1><section class="card mt"><h3>Копия для ${esc(x.profile.genitive)}</h3><p class="note">Наборов: ${x.decks.length}<br>В копилке: ${x.wallet.balance} минут<br>Занятий: ${x.sessions.length}</p><p class="note">Текущие слова, прогресс, настройки и копилка будут заменены целиком. PIN этого телефона сохранится.</p></section><div class="mt">${button('Восстановить с родительским PIN','restore')}</div>${button('Отмена','cancel-import','secondary')}`,false);return;
    }
    const d=imported.deck, old=state.decks.find(x=>x.id===d.id);
    shell(`${top('Получен набор','cancel-import')}<h1>${esc(d.title)}</h1><p class="note">${esc(dateLabel(d.due))} · ${wordCount(d.words.length)}</p>${old?'<section class="card lavender mt"><h3>Такой набор уже есть</h3><p class="note">Обновим слова. Прогресс неизменённых слов сохраним. Для исправленных слов начнём проверку заново. Копилка не изменится.</p></section>':''}<div class="card mt">${d.words.map(w=>`<div class="listrow"><div class="grow"><strong>${esc(w.en)}</strong><p>${esc(w.ru.join('; '))}</p></div></div>`).join('')}</div><div class="mt">${button(old?'Обновить набор':'Добавить слова','accept-import')}</div>${button('Отмена','cancel-import','secondary')}`,false);
  }
  function pickFile() {if(A)A.pickFile();else{$('#file').value='';$('#file').click();}}
  function exportFile(text,name,kind) {
    if(A){A.exportFile(text,name,kind);return;}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Файл подготовлен.');
  }
  function receiveFile(text) {
    try {const value=E.decode(text);const apply=()=>{imported=value;session=null;q=null;draft=null;closeModal();openScreen('importPreview');};if(screen==='train'||screen==='cards'||screen==='editor')modal('Открыть полученный файл?','<p>Текущее упражнение или несохранённые изменения будут закрыты. Уже заработанные минуты сохранятся.</p>','Открыть файл',apply);else apply();}catch(e){toast(e.message);}
  }
  function shareRequest(h) {
    const text=`Мама, я заработала время в приложении «Английские слова»! Добавь, пожалуйста, ${-h.delta} минут на Roblox в Family Link.\n\nИз копилки списано: ${-h.delta} мин.\nДата: ${stamp(h.at)}\nНомер просьбы: ${h.id}\n${state.profile.name}`;
    if(A)A.shareText(text);else if(navigator.share)navigator.share({text}).catch(()=>toast('Просьбу можно открыть повторно из истории.'));else modal('Просьба маме',`<div class="form"><textarea rows="8" readonly>${esc(text)}</textarea></div>`,null,null,'Закрыть');
  }
  function speak(text,slow=false,accent) {
    if(A){A.speak(text,slow,accent||state.settings.accent);return;}
    if(!('speechSynthesis' in window)){toast('Озвучивание будет доступно в Android-приложении.');return;}
    const voices=speechSynthesis.getVoices(),lang=accent||state.settings.accent;
    const voice=voices.find(v=>v.lang===lang&&v.localService)||voices.find(v=>v.lang.startsWith('en')&&v.localService);
    if(!voice){toast('В этом просмотре нет английского голоса. На телефоне проверим голос Android.');return;}
    speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.rate=slow?.7:.9;speechSynthesis.speak(u);
  }
  function stopAudio(){if(A)A.stopSpeech();else if('speechSynthesis'in window)speechSynthesis.cancel();}
  async function action(a,el) {
    switch(a){
      case 'modal-close':closeModal();return;
      case 'modal-ok':if(modalAction){const f=modalAction;el.disabled=true;try{await f();}finally{el.disabled=false;}}return;
      case 'setup':{const name=$('#welcome-name').value.trim(),genitive=$('#welcome-gen').value.trim(),pin=$('#welcome-pin').value;if(!name||!genitive)throw Error('Заполните имя и форму «для кого».');if(!/^\d{4,6}$/.test(pin)||pin!==$('#welcome-confirm').value)throw Error('PIN должен состоять из 4–6 цифр и совпадать в обоих полях.');if(await hasPin())await verifyPin(pin);else await setPin(pin);change(s=>{s.profile={name,genitive,ready:true};});openScreen(imported?'importPreview':'home');return;}
      case 'home':session=null;q=null;openScreen('home');return;
      case 'sets':openScreen('sets');return;
      case 'wallet':openScreen('wallet');return;
      case 'parent':await requireParent(()=>openScreen('parent'),true);return;
      case 'lock':lockParent();openScreen('home');return;
      case 'deck':selectedDeck=el.dataset.id;change(s=>{s.active=selectedDeck;});openScreen('detail');return;
      case 'detail':openScreen('detail');return;
      case 'study-all':change(s=>{s.active='__all__';});openScreen('home');return;
      case 'study-deck':selectedDeck=el.dataset.id;change(s=>{s.active=selectedDeck;});start();return;
      case 'deck-menu':deckMenu(el.dataset.id);return;
      case 'quick-share':{const d=state.decks.find(d=>d.id===el.dataset.id);if(d)exportFile(E.exportDeck(d),'slova-'+d.id+'.maywords','deck');return;}
      case 'menu-edit':closeModal();await action('edit-deck');return;
      case 'menu-share':closeModal();await action('export-deck');return;
      case 'menu-archive':closeModal();await action('archive');return;
      case 'pick-file':pickFile();return;
      case 'pick-backup':await requireParent(pickFile);return;
      case 'choose-scope':chooseScope();return;
      case 'select-scope':{const id=el.dataset.id;if(id!=='__all__'&&!state.decks.some(d=>d.id===id&&!d.archived))return;change(s=>{s.active=id;});closeModal();home();$('#study-target')?.focus();return;}
      case 'handwriting':if(answered||!$('#answer'))return;if(A?.openHandwriting){A.openHandwriting(String(++handwritingRequest),q.mode==='gap');}else{toast('Самостоятельное рукописное поле доступно в Android-приложении.');}return;
      case 'start-auto':start();return;
      case 'start-hard':start('auto',true);return;
      case 'choose-band':{const b=Number(el.dataset.band);modal(E.LABELS[b],`<div class="stack mt">${E.MODES.slice(b*2,b*2+2).map(m=>button(`<strong>${esc(modes[m][0])}</strong><small class="caption">${esc(modes[m][1])}</small>`,'start-mode','secondary mode-card',`data-mode="${m}"`)).join('')}</div>`,null,null,'Назад');return;}
      case 'start-mode':closeModal();start(el.dataset.mode);return;
      case 'open-cards':cardWords=E.studyDecks(state,selectedDeck).flatMap(d=>d.words.map(w=>({deck:d,word:w})));cardIndex=0;cardReturn=screen==='home'?'home':'detail';openScreen('cards');return;
      case 'card-prev':cardIndex=Math.max(0,cardIndex-1);cards();return;
      case 'card-next':{const x=cardWords[cardIndex];change(s=>E.markSeen(s,x.deck,x.word));cardIndex++;cards();return;}
      case 'speak-question':case 'speak-slow':{const w=screen==='cards'?cardWords[cardIndex]?.word:q?.word;if(w)speak(w.en,a==='speak-slow');return;}
      case 'speak-word':{const w=deck()?.words.find(w=>w.id===el.dataset.id);if(w)speak(w.en);return;}
      case 'choice':submit(el.dataset.id);return;
      case 'check':submit(q.mode==='build'?chosen.map(i=>q.word.en[i]).join(''):$('#answer').value);return;
      case 'letter':{if(answered)return;const i=Number(el.dataset.id);if(chosen.includes(i))return;chosen.push(i);el.disabled=true;drawBuilt();return;}
      case 'unletter':{if(answered)return;const i=Number(el.dataset.id);chosen=chosen.filter(n=>n!==i);document.querySelector(`[data-action="letter"][data-id="${i}"]`).disabled=false;drawBuilt();return;}
      case 'hint':if(answered)return;hinted=true;modal('Посмотрим вместе',`<div class="center"><div class="word" lang="en">${esc(q.word.en)}</div><p class="mt-sm">${esc(q.word.ru.join('; '))}</p><p class="note">Сейчас потренируемся. Балл за это слово можно получить позже, ответив самостоятельно.</p></div>`,'Попробовать',()=>{closeModal();$('#answer')?.focus();},'Закрыть');return;
      case 'next':stopAudio();advance();return;
      case 'again':selectedDeck=session.deckId;start(session.mode,session.hard);return;
      case 'exit-session':modal('Закончить занятие?','<p>Прогресс ответов и заработанные минуты уже сохранены. К словам можно вернуться позже.</p>','Закончить',()=>{closeModal();if(session?.total)finish();else{session=null;openScreen('home');}},'Продолжить занятие');return;
      case 'amount':spendAmount=Number(el.dataset.n);wallet();return;
      case 'spend':{const n=Number($('#spend-n').value);if(!Number.isSafeInteger(n)||n<1||n>state.wallet.balance)throw Error('Выбери количество минут в пределах баланса.');modal(`${n} минут на Roblox?`,`<p>Сейчас в копилке ${state.wallet.balance} минут. После списания останется ${state.wallet.balance-n}.</p><p>В меню отправки выбери MAX, затем маму и подтверди сообщение.</p><p>Минуты спишутся сейчас. Если закроешь отправку, просьба останется в истории — без нового списания.</p>`,'Списать и написать маме',()=>{const h=change(s=>E.spend(s,n));closeModal();wallet();shareRequest(h);},'Пока не списывать');return;}
      case 'reshare':{const h=state.wallet.history.find(h=>h.id===el.dataset.id&&h.type==='spend');if(h)shareRequest(h);return;}
      case 'new-deck':await requireParent(()=>{editId='';draft=null;openScreen('editor');});return;
      case 'edit-deck':await requireParent(()=>{editId=deck().id;draft=null;openScreen('editor');});return;
      case 'editor-back':modal('Закрыть редактор?','<p>Несохранённые изменения будут потеряны.</p>','Закрыть',()=>{draft=null;closeModal();openScreen(editId?'detail':'sets');},'Продолжить редактирование');return;
      case 'save-deck':{draft={title:$('#deck-title').value,due:$('#deck-due').value,lines:$('#deck-lines').value};await requireParent(()=>{const old=state.decks.find(d=>d.id===editId);const d=E.cleanDeck({id:editId||E.uid(),title:draft.title,due:draft.due,words:E.parseLines(draft.lines,old)});modal('Сохранить набор?',`<p><strong>${esc(d.title)}</strong> · ${wordCount(d.words.length)}</p><p>${esc(d.words.map(w=>w.en+' — '+w.ru.join('; ')).join('\n')).replace(/\n/g,'<br>')}</p>`,'Сохранить',()=>{change(s=>E.install(s,d));selectedDeck=d.id;draft=null;closeModal();openScreen('detail');});});return;}
      case 'export-deck':exportFile(E.exportDeck(deck()),'slova-'+deck().id+'.maywords','deck');return;
      case 'archive':await requireParent(()=>{change(s=>{const d=s.decks.find(d=>d.id===selectedDeck);d.archived=!d.archived;if(d.archived&&s.active===d.id)s.active=E.preferred(s)?.id||'';});openScreen('sets');});return;
      case 'delete-deck':await requireParent(()=>{const d=deck();modal('Удалить набор?',`<p>«${esc(d.title)}» и его учебный прогресс будут удалены. Заработанные минуты сохранятся.</p>`,'Удалить набор',()=>{change(s=>{s.decks=s.decks.filter(x=>x.id!==d.id);d.words.forEach(w=>delete s.progress[E.key(d,w)]);});closeModal();openScreen('sets');});});return;
      case 'settings':case 'report':await requireParent(()=>openScreen(a));return;
      case 'save-settings':{const values={name:$('#setting-name').value.trim(),gen:$('#setting-gen').value.trim(),rewards:[0,1,2].map(i=>Number($('#reward-'+i).value)),dailyCap:Number($('#daily-cap').value),accent:$('#accent').value};if(!values.name||!values.gen)throw Error('Заполните обе формы имени.');if(values.rewards.some(n=>!Number.isInteger(n)||n<0||n>60)||!Number.isInteger(values.dailyCap)||values.dailyCap<0||values.dailyCap>180)throw Error('Награды: 0–60 минут. Дневной предел: 0–180 минут.');await requireParent(()=>{change(s=>{s.profile.name=values.name;s.profile.genitive=values.gen;s.settings={rewards:values.rewards,dailyCap:values.dailyCap,accent:values.accent};});if(A)A.checkVoice(values.accent);toast('Настройки сохранены.');openScreen('parent');});return;}
      case 'test-voice':speak('Hello, young, high',false,$('#accent')?.value);return;
      case 'tts-settings':if(A)A.openSpeechSettings();else toast('Настройка голоса доступна на телефоне.');return;
      case 'backup':await requireParent(()=>exportFile(JSON.stringify({app:'mayusha-words',version:1,kind:'backup',state}),`mayusha-${E.day()}.maybackup`,'backup'));return;
      case 'accept-import':{if(imported?.kind!=='deck')return;const d=change(s=>E.install(s,imported.deck));selectedDeck=d.id;imported=null;openScreen('detail');toast('Слова добавлены.');return;}
      case 'cancel-import':imported=null;openScreen('sets');return;
      case 'restore':await requireParent(()=>{modal('Заменить данные на этом телефоне?','<p>Текущие данные будут заменены выбранной копией. Если нужна текущая версия, сначала отмените восстановление и сохраните её в родительском разделе.</p>','Заменить и восстановить',()=>{const next=E.validateState(imported.state);next.profile.ready=true;persist(next);state=next;imported=null;closeModal();if(A)A.checkVoice(state.settings.accent);openScreen('home');toast('Данные восстановлены.');});});return;
      case 'adjust':await requireParent(()=>modal('Исправить баланс',`<p>Текущий баланс: ${state.wallet.balance} минут. Корректировка появится в истории.</p><div class="form"><label for="balance-new">Новый баланс</label><input id="balance-new" type="number" inputmode="numeric" min="0" max="100000" value="${state.wallet.balance}"><label for="balance-reason">Причина</label><input id="balance-reason" maxlength="100" placeholder="Например, отмена просьбы"></div>`,'Сохранить',()=>{const n=Number($('#balance-new').value),reason=$('#balance-reason').value.trim();if(!Number.isInteger(n)||n<0||n>100000||!reason)throw Error('Укажите баланс от 0 до 100000 и причину.');change(s=>E.entry(s,n-s.wallet.balance,'adjust','Родитель: '+reason));closeModal();openScreen('wallet');}));return;
      case 'change-pin':await requireParent(()=>modal('Новый родительский PIN','<div class="form"><label for="new-pin">От 4 до 6 цифр</label><input id="new-pin" type="password" inputmode="numeric" maxlength="6"><label for="new-pin-confirm">Повторите PIN</label><input id="new-pin-confirm" type="password" inputmode="numeric" maxlength="6"></div>','Сохранить PIN',async()=>{const pin=$('#new-pin').value;if(!/^\d{4,6}$/.test(pin)||pin!==$('#new-pin-confirm').value)throw Error('Введите одинаковый PIN из 4–6 цифр.');await setPin(pin);closeModal();toast('PIN изменён.');}));return;
    }
  }
  function drawBuilt(){ $('#built').innerHTML=chosen.map(i=>button(q.word.en[i]===' '?'␣':esc(q.word.en[i]),'unletter','',`data-id="${i}" aria-label="Убрать ${esc(q.word.en[i])}"`)).join('');}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;Promise.resolve(action(b.dataset.action,b)).catch(err);});

  let hold=null,holdStart=null,suppressClickUntil=0;
  const cancelHold=()=>{clearTimeout(hold);hold=null;holdStart=null;};
  document.addEventListener('pointerdown',e=>{const card=e.target.closest('[data-deck-id]');if(!card||e.target.closest('.deck-actions,[data-action="deck-menu"]'))return;cancelHold();holdStart={x:e.clientX,y:e.clientY};hold=setTimeout(()=>{suppressClickUntil=Date.now()+800;deckMenu(card.dataset.deckId);cancelHold();},550);});
  document.addEventListener('pointermove',e=>{if(holdStart&&Math.hypot(e.clientX-holdStart.x,e.clientY-holdStart.y)>12)cancelHold();});
  for(const name of ['pointerup','pointercancel','scroll'])document.addEventListener(name,cancelHold,true);
  document.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){suppressClickUntil=0;e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('contextmenu',e=>{const card=e.target.closest('[data-deck-id]');if(card){e.preventDefault();if(!$('#overlay').children.length)deckMenu(card.dataset.deckId);}});
  document.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.id==='answer'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();action('check',e.target).catch(err);}
    if(e.key==='Escape')back();
    if(e.key==='Tab'&&$('#overlay .modal')){const nodes=[...$('#overlay').querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
  $('#file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(f.size>5*1024*1024){toast('Файл слишком большой.');return;}receiveFile(await f.text());});
  function back(){if($('#overlay').children.length){closeModal();return true;}if(screen==='train'||screen==='cards'&&session){action('exit-session').catch(err);return true;}if(screen==='editor'){action('editor-back').catch(err);return true;}if(screen!=='home'){openScreen('home');return true;}return false;}
  window.WordsApp={onHandwriting:(request,text)=>{if(String(handwritingRequest)!==request||screen!=='train'||answered||!$('#answer')||typeof text!=='string')return;$('#answer').value=text.slice(0,q.mode==='gap'?1:80);$('#answer').scrollIntoView({block:'center',behavior:'smooth'});toast('Проверь распознанное слово, затем нажми «Проверить».');},back,receiveFile,notify:toast,pause:()=>{stopAudio();lockParent();},onVoiceStatus:(ready,message)=>{audioStatus={ready,message};const v=$('#voice-status');if(v)v.textContent=message;},onSpeechError:message=>{toast(message);if($('#audio-note'))$('#audio-note').textContent=message;}};
  try {const raw=A?A.loadState():localStorage.getItem('mayusha-words-v1');state=raw?E.validateState(JSON.parse(raw)):E.initial();render();if(A){A.ready();A.checkVoice(state.settings.accent);} }
  catch(e){fatal=true;root.innerHTML=`<section class="card mt"><h2>Не удалось открыть сохранённые данные</h2><p class="note">Данные не перезаписаны. Закрой и снова открой приложение. Если ошибка повторится, сохрани сообщение и обратись к взрослому.</p><p class="error">${esc(e.message)}</p></section>`;}
})();
