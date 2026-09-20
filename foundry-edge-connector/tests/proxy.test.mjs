import test from 'node:test';
import assert from 'node:assert/strict';
import {clientAddress} from '../src/auth.js';
test('only exact trusted proxies can supply a client address; nearest valid hop wins',()=>{
 const req={socket:{remoteAddress:'172.16.5.1'},headers:{'x-forwarded-for':'spoofed, 198.51.100.20'}};
 assert.equal(clientAddress(req,[]),'172.16.5.1');
 assert.equal(clientAddress(req,['172.16.5.1']),'198.51.100.20');
 req.headers['x-forwarded-for']='198.51.100.20, malformed';assert.equal(clientAddress(req,['172.16.5.1']),'172.16.5.1');
 req.socket.remoteAddress='::ffff:172.16.5.1';req.headers['x-forwarded-for']='2001:db8::1';assert.equal(clientAddress(req,['172.16.5.1']),'2001:db8::1');
});
