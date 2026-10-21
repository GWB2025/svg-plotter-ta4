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
