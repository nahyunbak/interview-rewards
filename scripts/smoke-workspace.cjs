const fs=require('node:fs');const path=require('node:path');const {createRequire}=require('node:module');const {execFileSync}=require('node:child_process');const req=createRequire(path.resolve('backend/package.json'));req('dotenv').config({path:'backend/.env',quiet:true});const {privateKeyToAccount,generatePrivateKey}=req('viem/accounts');const {speak}=require('../backend/dist/ai');
const origin=process.env.SMOKE_ORIGIN;if(!origin||process.env.SMOKE_ALLOW_EXTERNAL!=='true')throw new Error('Explicit smoke origin required');
async function call(route,body,cookie=''){const r=await fetch(origin+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(`${route}: ${r.status} ${d.message}`);return {data:d,cookie:r.headers.get('set-cookie')?.split(';')[0]||''};}
(async()=>{const session=await call('workspace/session',{});const workspace=session.cookie;const results=[];const question='최근 독서 기록 앱을 쓰다 겪은 불편한 경험과 이유를 구체적으로 알려주세요.';
for(const [name,text,mode] of [['brief','몰라요.','automatic'],['detailed','어제 퇴근길 지하철에서 책을 읽고 기록하려고 했는데 저장 버튼을 세 번 눌러도 반응이 없어서 휴대폰 메모장에 적었어요. 인터넷이 약한 구간에서 이런 일이 반복돼서 불편했어요. 오프라인 저장 후 동기화가 되면 좋겠습니다.','manual']]){
 const campaign=(await call('workspace/campaigns',{title:`음성 퀄리티 검증 · ${name}`,context:'합성 음성으로 수행하는 테스트',questions:[question],mode},workspace)).data;
 const room=(await call(`workspace/campaigns/${campaign.id}/invites`,{},workspace)).data;
 const invite=room.path.split('/').at(-1);const account=privateKeyToAccount(generatePrivateKey());
 const c=(await call('auth/challenge',{invite,chain:'base',address:account.address},workspace)).data;
 const participant=await call('auth/verify',{id:c.id,signature:await account.signMessage({message:c.message}),provider:'metamask',consent:true},workspace);const cookies=workspace+'; '+participant.cookie;const id=participant.data.id;
 await call(`interviews/${id}/start`,{},cookies);await call(`interviews/${id}/question`,{},cookies);
 const mp3=path.resolve(`artifacts/${name}-workspace.mp3`),webm=path.resolve(`artifacts/${name}-workspace.webm`);fs.writeFileSync(mp3,await speak(text));execFileSync('ffmpeg',['-y','-loglevel','error','-i',mp3,'-c:a','libopus',webm]);
 await call(`interviews/${id}/answer`,{audio:fs.readFileSync(webm).toString('base64'),type:'audio/webm',index:0},cookies);await call(`interviews/${id}/finish`,{},cookies);
 let result;for(let t=0;t<90;t++){result=(await call(`interviews/${id}`,undefined,cookies)).data;if(result.status!=='evaluating')break;await new Promise(r=>setTimeout(r,1000));}
 if(result.status!=='completed')throw new Error('Evaluation did not complete: '+result.error);
 const before=result.payout.status;if(mode==='manual'&&before==='awaiting_approval')await call(`workspace/interviews/${id}/approve`,{},workspace);
 const after=(await call(`interviews/${id}`,undefined,cookies)).data;results.push({sample:name,campaignId:campaign.id,interviewId:id,mode,score:after.score,wei:after.payout.amount,beforeApproval:before,afterApproval:after.payout.status});console.log(JSON.stringify(results.at(-1)));
}
if(results[0].score>=results[1].score||BigInt(results[0].wei)>=BigInt(results[1].wei))throw new Error('Quality/reward differentiation failed');const data=(await call('workspace',undefined,workspace)).data;if(data.mine.length!==2)throw new Error('Participant history not associated');fs.writeFileSync('artifacts/workspace-live-qa.json',JSON.stringify({origin,synthetic:true,actualOnChainTransfer:false,mineCount:data.mine.length,results},null,2));})().catch(e=>{console.error(String(e.message).replace(/sk-[\w-]+/g,'[REDACTED]'));process.exitCode=1});
