const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateEvaluation,amount,score,payoutStatus,parseStudy}=require('../dist/domain');
const {verifyWallet,addressValid}=require('../dist/chain');
const {privateKeyToAccount}=require('viem/accounts');
const {generateKeyPairSync,sign}=require('node:crypto');
const {PublicKey}=require('@solana/web3.js');
const turns=[{id:'0',question:'어려움은?',answer:'어제 결제 버튼을 누르니 화면이 멈췄어요.'}];
function evaluation(){return {items:['specificity','evidence','relevance'].map(criterion=>({question_id:'0',criterion,score:2,reason:'구체적 경험',evidence:'어제 결제 버튼'})),needs_review:false,review_reason:''};}
test('근거가 있는 평가와 정수 리워드 산식',()=>{const e=validateEvaluation(evaluation(),turns);assert.equal(score(e),100);assert.equal(amount(e,'100000000000000000000'), '100000000000000000000');e.items[0].score=1;assert.equal(amount(e,'100'), '83');});
test('수동은 승인 전 지급 대기에 들어가지 않는다',()=>{assert.equal(payoutStatus('manual','10'),'awaiting_approval');assert.equal(payoutStatus('automatic','10'),'queued');assert.equal(payoutStatus('automatic','0'),'not_payable');});
test('발언에 없는 근거, 중복 항목, 범위 밖 점수 거부',()=>{for(const mutate of [e=>e.items[0].evidence='가짜',e=>e.items[1]=e.items[0],e=>e.items[0].score=3,e=>e.items.pop()]){const e=evaluation();mutate(e);assert.throws(()=>validateEvaluation(e,turns));}});
test('질문 수와 모드 검증',()=>{assert.throws(()=>parseStudy({title:'x',context:'x',questions:[],mode:'manual'}));assert.throws(()=>parseStudy({title:'x',context:'x',questions:['q'],mode:'other'}));assert.equal(parseStudy({title:'x',context:'x',questions:['q'],mode:'manual'}).mode,'manual');});
test('Base 서명은 메시지와 주소에 결합',async()=>{const account=privateKeyToAccount('0x'+'12'.repeat(32));const signature=await account.signMessage({message:'nonce-1'});assert.equal(await verifyWallet('base',account.address,'nonce-1',signature),true);assert.equal(await verifyWallet('base',account.address,'nonce-2',signature),false);assert.equal(addressValid('base','abc'),false);});
test('Solana ed25519 서명 검증과 잘못된 메시지 거부',async()=>{const {publicKey,privateKey}=generateKeyPairSync('ed25519');const address=new PublicKey(publicKey.export({type:'spki',format:'der'}).subarray(-32)).toBase58();const signature=sign(null,Buffer.from('nonce-1'),privateKey).toString('base64');assert.equal(await verifyWallet('solana',address,'nonce-1',signature),true);assert.equal(await verifyWallet('solana',address,'nonce-2',signature),false);assert.equal(addressValid('solana','abc'),false);});
