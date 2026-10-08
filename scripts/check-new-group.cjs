const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const fresh=html.split('\n').find(s=>s.startsWith('function fresh()'));
const reset=html.slice(html.indexOf('function resetNewGroup(){'),html.indexOf("$('#newGroup').onclick="));
function check({cancel=false,busy=false,failAt=0}={}){
  const original={owner:'guest:device',cls:'2',group:'4',members:[{num:'1',name:'이전'}],ans:{q1:'답변'},vars:{dep:'빛의 밝기'},rows:[{lux:100}],history:[{}],bg:10,graph:{title:'이전 그래프'},sourceId:'submitted',reportId:'report'};
  const writes=[],states=[];let count=0,redrawn=false;
  const ctx=vm.createContext({S:structuredClone(original),ready:true,storageError:'',measurementOperationBusy:()=>busy,
    confirm:()=>!cancel,clone:structuredClone,now:()=> 'now',Date,
    KEY:'ldexp-v2',localStorage:{setItem:(k,v)=>{if(++count===failAt)throw new Error('quota');writes.push({k,value:JSON.parse(v)});}},
    renderQuestions:()=>redrawn=true,refreshMeasurementState(){},status:(...args)=>states.push(args),toast(){}});
  vm.runInContext(fresh+'\n'+reset,ctx);ctx.resetNewGroup();
  if(cancel||busy||failAt){assert.deepEqual(JSON.parse(JSON.stringify(ctx.S)),original);if(cancel||busy)assert.equal(writes.length,0);else assert(states[0][1].includes('기존 자료는 유지'));}
  else{assert.equal(writes.length,2);assert(writes[0].k.includes('group-backup'));assert.deepEqual(writes[0].value.state,original);assert.equal(writes[1].k,'ldexp-v2');assert.equal(ctx.S.owner,original.owner);assert.equal(ctx.S.cls,'');assert.equal(ctx.S.group,'');assert.equal(ctx.S.members.length,4);assert.equal(ctx.S.rows.length,0);assert.equal(ctx.S.bg,null);assert.equal(ctx.S.sourceId,undefined);assert.equal(ctx.S.reportId,undefined);assert.deepEqual(JSON.parse(JSON.stringify(ctx.S.ans)),{});assert.equal(ctx.S.graph.title,'');assert.equal(ctx.S.tab,'t1');assert(redrawn);}
}
check();check({cancel:true});check({busy:true});check({failAt:1});check({failAt:2});
console.log('PASS: new group clears identity/members/answers/measurements/report state, backs up first, preserves session, guards cancellation/busy/storage failures');
