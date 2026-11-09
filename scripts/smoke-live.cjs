// Explicitly invoked against this project's testnet deployment; synthetic data only.
const {createRequire}=require('node:module');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');const crypto=require('node:crypto');
const req=createRequire(path.resolve('backend/package.json'));req('dotenv').config({path:'backend/.env',quiet:true});
const {privateKeyToAccount,generatePrivateKey}=req('viem/accounts');const {Keypair}=req('@solana/web3.js');const {speak}=require('../backend/dist/ai');
const origin=process.env.SMOKE_ORIGIN;if(!origin||process.env.SMOKE_ALLOW_EXTERNAL!=='true')throw new Error('Set SMOKE_ORIGIN and SMOKE_ALLOW_EXTERNAL=true');
const out=path.resolve('artifacts');fs.mkdirSync(out,{recursive:true});
async function call(route,body,cookie=''){const response=await fetch(`${origin}/api/${route}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(`${route}: ${response.status} ${data.message}`);return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};}
(async()=>{
 const login=await call('admin/login',{token:process.env.ADMIN_TOKEN});const admin=login.cookie;
 fs.writeFileSync(path.join(out,'synthetic.mp3'),await speak('어제 퇴근길 지하철에서 독서 기록을 남기려 했는데 저장 버튼을 세 번 눌러도 반응이 없어서 메모장에 적었어요.'));
 execFileSync('ffmpeg',['-y','-loglevel','error','-i',path.join(out,'synthetic.mp3'),'-c:a','libopus',path.join(out,'synthetic.webm')]);
 const audio=fs.readFileSync(path.join(out,'synthetic.webm')).toString('base64');const report=[];
 for(const [chain,provider,mode] of [['base','metamask','manual'],['base','phantom','automatic'],['solana','metamask','automatic'],['solana','phantom','manual']]){
  const link=(await call('admin/studies',{title:`QA 표본 ${chain}/${provider}/${mode}`,context:'독서 앱 사용성 검증을 위한 생성된 음성 표본',questions:['최근 앱을 사용하다 겪은 어려움을 구체적으로 말해주세요.'],mode},admin)).data;
  let account,address,sign;
  if(chain==='base'){account=privateKeyToAccount(generatePrivateKey());address=account.address;sign=message=>account.signMessage({message});}
  else{account=Keypair.generate();address=account.publicKey.toBase58();const key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(account.secretKey.subarray(0,32))]),type:'pkcs8',format:'der'});sign=async message=>crypto.sign(null,Buffer.from(message),key).toString('base64');}
  const c=(await call('auth/challenge',{invite:new URL(link.url).searchParams.get('invite'),chain,address})).data;
  const session=await call('auth/verify',{id:c.id,signature:await sign(c.message),provider,consent:true});const id=session.data.id;
  await call(`interviews/${id}/start`,{},session.cookie);await call(`interviews/${id}/question`,{},session.cookie);await call(`interviews/${id}/answer`,{audio,type:'audio/webm',index:0},session.cookie);await call(`interviews/${id}/finish`,{},session.cookie);
  let result;for(let n=0;n<90;n++){result=(await call(`interviews/${id}`,undefined,session.cookie)).data;if(result.status!=='evaluating')break;await new Promise(r=>setTimeout(r,1000));}
  if(result.status!=='completed')throw new Error(`${chain}/${provider}: ${result.status} ${result.error}`);
  const expected=mode==='manual'?'awaiting_approval':'queued';if(result.payout.status!==expected)throw new Error('Unexpected payout state');
  if(mode==='manual'){await call(`admin/payouts/${id}/approve`,{},admin);await call(`admin/payouts/${id}/approve`,{},admin);result=(await call(`interviews/${id}`,undefined,session.cookie)).data;if(result.payout.status!=='queued')throw new Error('Approval failed');}
  report.push({chain,provider,mode,id,score:result.score,evidenceItems:result.evaluation.items.length,stateBeforeApproval:expected,stateAfter:result.payout.status});
  console.log(JSON.stringify(report.at(-1)));
  if(chain==='base'&&provider==='metamask'){
   const domain=new URL(origin).hostname;fs.writeFileSync(path.join(out,'qa-browser-state.json'),JSON.stringify({cookies:[{name:'participant',value:session.cookie.split('=')[1],domain,path:'/api',expires:Math.floor(Date.now()/1000)+3600,httpOnly:true,secure:origin.startsWith('https'),sameSite:'Strict'}],origins:[{origin,localStorage:[]}]}),{mode:0o600});
   fs.writeFileSync(path.join(out,'qa-session.json'),JSON.stringify({id,url:link.url}),{mode:0o600});
  }
 }
 fs.writeFileSync(path.join(out,'live-api-qa.json'),JSON.stringify({origin,synthetic:true,walletExtensionUI:false,onChainTransfer:false,results:report},null,2));
})().catch(e=>{console.error(String(e.message).replace(/sk-[\w-]+/g,'[REDACTED]'));process.exitCode=1;});
