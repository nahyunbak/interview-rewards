const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn,execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {PrismaClient}=require('@prisma/client');const {hash}=require('../dist/domain');const {privateKeyToAccount}=require('viem/accounts');
test('HTTP 권한·일회 서명·중복 승인·자동 지급 계약',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'interview-test-'));const dbPath=path.join(folder,'test.db');fs.writeFileSync(dbPath,'');const database='file:'+dbPath;const env={...process.env,DATABASE_URL:database,PORT:'3419',PUBLIC_ORIGIN:'http://localhost:3410',ADMIN_TOKEN:'integration-only-admin-token-32-bytes',OPENAI_API_KEY:'test-not-a-real-key',BASE_BUDGET:'1000000000000000000',PAYOUT_ENABLED:'false'};
 execFileSync('pnpm',['exec','prisma','migrate','deploy'],{env,stdio:'pipe'});const db=new PrismaClient({datasources:{db:{url:database}}});const server=spawn(process.execPath,['dist/main.js'],{env,stdio:['ignore','pipe','pipe']});let output='';server.stderr.on('data',b=>output+=b.toString());
 const request=(route,body,cookie='',method)=>fetch('http://127.0.0.1:3419/api/'+route,{method:method||(body===undefined?'GET':'POST'),headers:{Origin:'http://localhost:3410','Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  let ready=false;for(let n=0;n<80;n++){try{if((await request('health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,output);
  const workspaceA=await request('workspace/session',{});assert.equal(workspaceA.status,201);const cookieA=workspaceA.headers.get('set-cookie').split(';')[0];
  const workspaceB=await request('workspace/session',{});const cookieB=workspaceB.headers.get('set-cookie').split(';')[0];
  const aData=await (await request('workspace',undefined,cookieA)).json();assert.equal(aData.campaigns.length,8);assert.equal(aData.mine.length,0);
  assert.equal(new Set(aData.campaigns.map(c=>c.title)).size,8);
  assert.equal(aData.campaigns.filter(c=>c.mode==='manual').length,4);
  assert.equal(aData.campaigns.filter(c=>c.mode==='automatic').length,4);
  for(const c of aData.campaigns){assert.ok(c.questions.length>=2&&c.questions.length<=4);assert.match(c.context,/목 인터뷰/);assert.equal(c.done,0);}
  assert.equal(aData.interviews.length,0);
  await request('workspace/session',{},cookieA);
  const reopened=await (await request('workspace',undefined,cookieA)).json();assert.deepEqual(reopened.campaigns,aData.campaigns);
  // 이전 두 캠페인만 있는 계정도 새 주제를 받되 기존 캠페인과 질문은 보존한다.
  const originals=aData.campaigns.filter(c=>c.title.startsWith('독서')||c.title.startsWith('온라인 쇼핑'));
  const owner=(await db.study.findUnique({where:{id:originals[0].id}})).workspaceId;
  await db.study.deleteMany({where:{workspaceId:owner,id:{notIn:originals.map(c=>c.id)}}});
  await db.study.update({where:{id:originals[0].id},data:{questions:JSON.stringify(['기존에 저장한 질문'])}});
  await request('workspace/session',{},cookieA);
  const restored=await (await request('workspace',undefined,cookieA)).json();assert.equal(restored.campaigns.length,8);assert.deepEqual(restored.campaigns.find(c=>c.id===originals[0].id).questions,['기존에 저장한 질문']);
  for(const c of restored.campaigns){
   const mockRoom=await (await request(`workspace/campaigns/${c.id}/invites`,{},cookieA)).json();
   const mockInvite=await (await request('invites/'+mockRoom.path.split('/').at(-1))).json();
   assert.equal(mockInvite.title,c.title);assert.equal(mockInvite.mode,c.mode);assert.equal(mockInvite.questionCount,c.questions.length);
  }
  const campaign=await (await request('workspace/campaigns',{title:'실제 질문 저장',context:'test',questions:['어떤 점이 어려웠나요?'],mode:'automatic'},cookieA)).json();
  assert.equal((await request(`workspace/campaigns/${campaign.id}/invites`,{},cookieB)).status,404);
  const room=await (await request(`workspace/campaigns/${campaign.id}/invites`,{},cookieA)).json();assert.match(room.path,/^\/room\/[a-f0-9]{64}$/);
  const publicInvite=await (await request('invites/'+room.path.split('/').at(-1))).json();assert.equal(publicInvite.title,'실제 질문 저장');assert.equal(publicInvite.mode,'automatic');
  assert.equal((await request('workspace/campaigns',{title:'열 번째 캠페인',context:'test',questions:['질문'],mode:'manual'},cookieA)).status,201);
  assert.equal((await request('workspace/campaigns',{title:'한도 초과 캠페인',context:'test',questions:['질문'],mode:'manual'},cookieA)).status,409);
  await request('workspace/session',{},cookieA);
  assert.equal((await (await request('workspace',undefined,cookieA)).json()).campaigns.length,10);
  const bData=await (await request('workspace',undefined,cookieB)).json();assert.equal(bData.campaigns.some(c=>c.id===campaign.id),false);
  assert.equal((await request('admin/interviews')).status,401);assert.equal((await request('admin/login',{token:'bad'})).status,401);
  const login=await request('admin/login',{token:env.ADMIN_TOKEN});assert.equal(login.status,201);const admin=login.headers.get('set-cookie').split(';')[0];
  const create=await request('admin/studies',{title:'test',context:'ctx',questions:['q'],mode:'manual'},admin);assert.equal(create.status,201);const link=await create.json();const invite=new URL(link.url).searchParams.get('invite');
  const account=privateKeyToAccount('0x'+'34'.repeat(32));const challenge=await (await request('auth/challenge',{invite,chain:'base',address:account.address})).json();const signature=await account.signMessage({message:challenge.message});const verified=await request('auth/verify',{id:challenge.id,signature,provider:'metamask',consent:true},cookieA);assert.equal(verified.status,201);const participant=verified.headers.get('set-cookie').split(';')[0];const {id}=await verified.json();
  assert.equal((await request('auth/verify',{id:challenge.id,signature,provider:'metamask',consent:true})).status,401);
  assert.equal((await request('interviews/'+id)).status,401);assert.equal((await request('interviews/'+id,undefined,participant)).status,200);assert.equal((await request('interviews/'+id,undefined,cookieA)).status,200);assert.equal((await request('interviews/'+id,undefined,cookieB)).status,401);const aMine=await (await request('workspace',undefined,cookieA)).json();assert.equal(aMine.mine.some(i=>i.id===id),true);
  const own=await (await request('interviews/'+id,undefined,participant)).json();assert.equal(own.mode,'manual');assert.equal(own.sessionHash,undefined);
  assert.equal((await request(`interviews/${id}/finish`,{},participant)).status,409);
  await db.interview.update({where:{id},data:{status:'completed',transcript:JSON.stringify([{id:'0',question:'q',answer:'test'}])}});await db.payout.create({data:{interviewId:id,amount:'5',status:'awaiting_approval'}});
  assert.equal((await request(`workspace/interviews/${id}/approve`,{},cookieB)).status,404);assert.equal((await request(`admin/payouts/${id}/approve`,{},participant)).status,401);
  assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,201);assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,201);assert.equal(await db.audit.count({where:{action:'approve',targetId:id}}),1);assert.equal(await db.payout.count({where:{interviewId:id}}),1);
  await db.interview.update({where:{id},data:{mode:'automatic'}});assert.equal((await request(`admin/payouts/${id}/approve`,{},admin)).status,409);
  assert.equal((await fetch('http://127.0.0.1:3419/api/admin/login',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({token:env.ADMIN_TOKEN})})).status,403);
  assert.equal((await request(`interviews/${id}/data`,undefined,participant,'DELETE')).status,200);const after=await db.interview.findUnique({where:{id}});assert.equal(after.transcript,'[]');assert.equal(await db.payout.count({where:{interviewId:id}}),1);assert.notEqual(hash('x'),after.sessionHash);
 }finally{server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));await db.$disconnect();fs.rmSync(folder,{recursive:true,force:true});}
});
