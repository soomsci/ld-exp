const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const handler=html.split('\n').find(line=>line.startsWith("$('#rsubmit').onclick="));
async function run(savedSource,fail=false){
  const S={cls:'2',group:'1',ans:{q1:'가설'},vars:{},graph:{title:'측정 결과'},data:{rows:[{lux:100}]}};
  if(savedSource){S.groupSig=JSON.stringify(S.data);S.sourceId='existing';}
  const els=new Map(),calls=[],statuses=[];
  const $=id=>{if(!els.has(id))els.set(id,{disabled:false,toDataURL:()=> 'data:image/png;base64,aGVsbG8='});return els.get(id);};
  const dataSig=()=>JSON.stringify(S.data);
  const context=vm.createContext({S,$,QS:[{id:'q1',type:'text',required:true,text:'가설'}],
    drawn:'drawn',graphSig:()=> 'drawn',data:()=>S.data,dataSig,reportSig:()=>JSON.stringify(S),
    clone:structuredClone,requireIdentity(){},graphValid(){},analysisValid(){},validateMembers(){},save(){},renderStatus(){},toast(){},
    status:(id,text)=>statuses.push(text),ready:true,submittingReport:false,reportError:'',
    api:async(fn,payload)=>{calls.push({fn,payload});if(fail)throw new Error('서버 오류');return{id:'report',at:'now',sourceId:'saved-source',sourceAt:'saved-at'};},
  });
  vm.runInContext(handler,context);await $('#rsubmit').onclick();
  assert.equal(calls.length,1);assert.equal(calls[0].fn,'submitReport');
  assert.equal(calls[0].payload.sourceId,savedSource?'existing':undefined);
  assert.equal(calls[0].payload.data.rows[0].lux,100);
  assert.equal($('#rsubmit').disabled,false);
  if(fail){assert(context.reportError.includes('서버 오류'));assert.equal(S.data.rows[0].lux,100);assert.equal(S.reportId,undefined);}
  else{assert.equal(S.sourceId,'saved-source');assert.equal(S.groupSig,dataSig());assert.equal(S.reportId,'report');assert(statuses.some(s=>s.includes('함께 저장')));}
}
(async()=>{await run(false);await run(true);await run(false,true);assert(!html.includes('id="gload"'));assert(!html.includes('id="shareCode"'));console.log('PASS: direct final submission without prior measurement save/load, existing source reuse, returned source tracking, error preservation, removed student load controls');})().catch(e=>{console.error(e);process.exitCode=1;});
