const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn,execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {PrismaClient}=require('@prisma/client');const {hash}=require('../dist/domain');const {privateKeyToAccount}=require('viem/accounts');
test('HTTP 권한·일회 서명·중복 승인·자동 지급 계약',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'interview-test-'));const dbPath=path.join(folder,'test.db');fs.writeFileSync(dbPath,'');const database='file:'+dbPath;const env={...process.env,DATABASE_URL:database,PORT:'3419',PUBLIC_ORIGIN:'http://localhost:3410',ADMIN_TOKEN:'integration-only-admin-token-32-bytes',OPENAI_API_KEY:'test-not-a-real-key',BASE_BUDGET:'1000000000000000000',PAYOUT_ENABLED:'false'};
 execFileSync('pnpm',['exec','prisma','migrate','deploy'],{env,stdio:'pipe'});const db=new PrismaClient({datasources:{db:{url:database}}});const server=spawn(process.execPath,['dist/main.js'],{env,stdio:['ignore','pipe','pipe']});let output='';server.stderr.on('data',b=>output+=b.toString());
 const request=(route,body,cookie='',method)=>fetch('http://127.0.0.1:3419/api/'+route,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:'http://localhost:3410','Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  let ready=false;for(let n=0;n<80;n++){try{if((await request('health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,output);
  assert.equal((await request('admin/interviews')).status,401);assert.equal((await request('admin/login',{token:'bad'})).status,401);
  const login=await request('admin/login',{token:env.ADMIN_TOKEN});assert.equal(login.status,201);const admin=login.headers.get('set-cookie').split(';')[0];
  const create=await request('admin/studies',{title:'test',context:'ctx',questions:['q'],mode:'manual'},admin);assert.equal(create.status,201);const link=await create.json();const invite=new URL(link.url).searchParams.get('invite');
  const account=privateKeyToAccount('0x'+'34'.repeat(32));const challenge=await (await request('auth/challenge',{invite,chain:'base',address:account.address})).json();const signature=await account.signMessage({message:challenge.message});const verified=await request('auth/verify',{id:challenge.id,signature,provider:'metamask',consent:true});assert.equal(verified.status,201);const participant=verified.headers.get('set-cookie').split(';')[0];const {id}=await verified.json();
  assert.equal((await request('auth/verify',{id:challenge.id,signature,provider:'metamask',consent:true})).status,401);
  assert.equal((await request('interviews/'+id)).status,401);assert.equal((await request('interviews/'+id,undefined,participant)).status,200);
  const own=await (await request('interviews/'+id,undefined,participant)).json();assert.equal(own.mode,'manual');assert.equal(own.sessionHash,undefined);
  assert.equal((await request(`interviews/${id}/finish`,{},participant)).status,409);
  await db.interview.update({where:{id},data:{status:'completed',transcript:JSON.stringify([{id:'0',question:'q',answer:'test'}])}});await db.payout.create({data:{interviewId:id,amount:'5',status:'awaiting_approval'}});
  assert.equal((await request(`admin/payouts/${id}/approve`,{},participant)).status,401);
  assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,201);assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,201);assert.equal(await db.audit.count({where:{action:'approve',targetId:id}}),1);assert.equal(await db.payout.count({where:{interviewId:id}}),1);
  await db.interview.update({where:{id},data:{mode:'automatic'}});assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,409);
  assert.equal((await fetch('http://127.0.0.1:3419/api/admin/login',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({token:env.ADMIN_TOKEN})})).status,403);
  assert.equal((await request(`interviews/${id}/data`,undefined,participant,'DELETE')).status,200);const after=await db.interview.findUnique({where:{id}});assert.equal(after.transcript,'[]');assert.equal(await db.payout.count({where:{interviewId:id}}),1);assert.notEqual(hash('x'),after.sessionHash);
 }finally{server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await db.$disconnect();fs.rmSync(folder,{recursive:true,force:true});}
});
