import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,fixture} from './native-fixture.mjs';
import {sealVerified} from '../native/snapshot.mjs';

test('native DDL seal pin and source catalog pin are distinct and both required',async t=>{
 const nativePin='e'.repeat(64),r=await setup(t,{NATIVE_SCHEMA_SHA256:nativePin});
 assert.equal((await r.fetch('/__ready')).status,503);
 await r.db.prepare("UPDATE native_seal SET schema_sha256=? WHERE id='verified'").bind(nativePin).run();
 assert.equal((await r.fetch('/__ready')).status,200);
 await r.db.prepare("UPDATE native_catalog SET schema_sha256=? WHERE id='source'").bind(nativePin).run();
 assert.equal((await r.fetch('/__ready')).status,503);
});

test('real-source seal generation cannot silently substitute a catalog hash for the native DDL pin',async t=>{
 const r=await setup(t),source=fixture(),snapshot={...source.snapshot,provenance:'actual-source'};
 await assert.rejects(sealVerified(r.db,r.bucket,snapshot,source.pin),/Independent reviewed native DDL pin is mandatory/);
 const blocked=await setup(t,{NATIVE_SCHEMA_SHA256:'blocked'});
 assert.equal((await blocked.fetch('/__ready')).status,503);
});
