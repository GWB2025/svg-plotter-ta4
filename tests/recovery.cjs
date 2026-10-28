const {test} = require('node:test');
const assert = require('node:assert/strict');
const {permissions} = require('../assets/plotting.js');

test('saved plot requires confirmation and blocks file changes, Home and restart', () => {
 const s={phase:'interrupted',connected:false,busy:false,saved_plot:true,recovery_available:true};
 assert.equal(permissions(s,true,false).resume,false);
 const p=permissions(s,true,true);
 assert.equal(p.resume,true);assert.equal(p.discard,true);
 for(const key of ['file','connect','home','start'])assert.equal(p[key],false,key);
 assert.equal(permissions({...s,busy:true},true,true).resume,false);
 assert.equal(permissions({...s,recovery_available:false},true,true).resume,false);
});

test('reset recovery has its own confirmation and only works for a stopped saved job', () => {
 const s={phase:'interrupted',connected:false,busy:false,saved_plot:true,recovery_available:false,rehome_available:true};
 assert.equal(permissions(s,true,true,false).rehome,false);
 assert.equal(permissions(s,true,false,true).rehome,true);
 for(const change of [{busy:true},{connected:true},{rehome_available:false},{saved_plot:false}]) {
  assert.equal(permissions({...s,...change},true,false,true).rehome,false);
 }
 assert.equal(permissions(s,false,false,true).rehome,false);
});

test('restored position waits for the current pen and allows cancellation', () => {
 const s={phase:'recovery_pen',connected:true,busy:true,saved_plot:true};
 assert.equal(permissions(s,true,false).continue,false);
 assert.equal(permissions(s,true,true).continue,true);
 assert.equal(permissions(s,true,true).cancel,true);
 assert.equal(permissions({...s,phase:'rehome'},true,false).cancel,true);
 assert.equal(permissions({...s,phase:'rehome'},true,false).pause,false);
});
