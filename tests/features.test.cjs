const assert=require('node:assert/strict');
const test=require('node:test');
const E=require('../android/assets/engine.js');
test('Фото: номера, повторы, дефисы, ограничения и посторонний текст',()=>{
 assert.deepEqual(E.photoWords('1. slow\n2. fast\nSLOW\nforty-nine\n<script>\nмедленный'),['Slow','Fast','Forty-nine']);
 assert.throws(()=>E.photoWords('a'.repeat(30001)));
 assert.deepEqual(E.photoWords(''),[]);
});
test('Альбом: только полные занятия, разные дни без серии, награды постоянны',()=>{
 const s=E.initial(),wallet=E.clone(s.wallet);s.sessions=[{at:1000,total:9}];assert.deepEqual(E.unlockStickers(s),[]);
 s.sessions=[1,4,10].map(n=>({at:new Date(2026,8,n,12).getTime(),total:10,correct:8}));
 assert.deepEqual(E.unlockStickers(s,123),['bunny','star']);assert.deepEqual(s.wallet,wallet);
 s.sessions=[];assert.deepEqual(E.unlockStickers(s,456),[]);assert.equal(s.stickers.star,123);
 assert.deepEqual(E.validateState(s).stickers,s.stickers);
});
test('Старые сохранения открываются, повреждённые наклейки отклоняются',()=>{
 const s=E.initial();delete s.stickers;assert.deepEqual(E.validateState(s).stickers,{});
 s.stickers={invented:1};assert.throws(()=>E.validateState(s));s.stickers={bunny:-1};assert.throws(()=>E.validateState(s));
});
