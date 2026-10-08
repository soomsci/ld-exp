const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function measurementNotice('),html.indexOf('function log(action,'));
const initial={owner:'student@school',cls:'2',group:'3',num:'5',name:'학생',members:[{num:'1',name:'첫째'},{num:'2',name:'둘째'},{num:'3',name:'셋째'},{num:'4',name:'넷째'}],ans:{q1:'기존 설계'},vars:{indep:'거리'},manual:false,setup:[0,1],
 distances:[5,10,15,20,25,30],rows:[{d:5,round:1,lux:596,bg:566}],history:[{action:'remeasure'}],bg:566,round:3,legacy:false,tab:'t4',
 graph:{title:'조도 그래프',xaxis:'inverseSquared',yaxis:'mean',connectPoints:true,analysis:{observations:{inverseSquared:'기존 메모'},linearAxis:'inverseSquared',origin:'unclear',reason:'기존 근거'}},
 groupSig:'group-snapshot',sourceId:'source',sourceAt:'date',reportSig:'report-snapshot',reportAt:'date',reportId:'report'};
function harness(){
 const store=new Map([['ldexp-v2',JSON.stringify(initial)]]),els={},sets={},clone=x=>JSON.parse(JSON.stringify(x));
 const $=id=>els[id]||(els[id]={disabled:false,value:'',hidden:false});
 const all=selector=>sets[selector]||(sets[selector]=[{classList:{toggle:()=>{}},hidden:false,disabled:false}]);
 const ctx=vm.createContext({initial:clone(initial),clone,$,document:{querySelectorAll:all},Object,JSON,now:()=> '2026-10-07T07:00:00Z',
 localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>{if(ctx.failKey===key)throw new Error('저장 공간 부족');store.set(key,value);}},
 confirm:()=>{ctx.confirmCount++;return ctx.confirmed;},status:(id,msg)=>$(id).textContent=msg,
 syncControls:()=>{},renderData:()=>{},showTab:()=>{},confirmCount:0,confirmed:true,failKey:''});
 vm.runInContext("let S=initial,measuring=false,submittingReport=false,drawn='old',groupError='',reportError='';const KEY='ldexp-v2';"+source+"\nglobalThis.api={resetMeasurements,restoreMeasurements,measurementBackup,updateMeasurementBackupControls};",ctx);
 const state=()=>JSON.parse(vm.runInContext('JSON.stringify(S)',ctx));
 return {ctx,api:ctx.api,state,store,els,sets,$};
}
let h=harness();h.ctx.confirmed=false;h.api.resetMeasurements();assert.deepEqual(h.state(),initial);assert.equal(h.store.size,1);
h=harness();vm.runInContext('measuring=true',h.ctx);h.api.resetMeasurements();assert.equal(h.ctx.confirmCount,0);assert.deepEqual(h.state(),initial);
h=harness();h.$('#gload').disabled=true;h.api.resetMeasurements();assert.equal(h.ctx.confirmCount,0);assert.deepEqual(h.state(),initial);
for(const failKey of ['ldexp-v2-reset-backup','ldexp-v2']){
 h=harness();h.ctx.failKey=failKey;h.api.resetMeasurements();assert.deepEqual(h.state(),initial);assert.deepEqual(JSON.parse(h.store.get('ldexp-v2')),initial);
}
h=harness();h.api.resetMeasurements();let state=h.state();
assert.equal(state.rows.length,0);assert.equal(state.history.length,0);assert.equal(state.bg,null);assert.equal(state.round,1);assert.equal(state.tab,'t2');
for(const key of ['name','num','owner','cls','group','members','ans','vars','manual','setup','distances'])assert.deepEqual(state[key],initial[key]);
assert.equal(state.graph.title,initial.graph.title);assert.equal(state.graph.connectPoints,true);assert.equal(state.graph.analysis.reason,'');
for(const key of ['groupSig','sourceId','sourceAt','reportSig','reportAt','reportId'])assert(!Object.hasOwn(state,key));
assert.deepEqual(h.api.measurementBackup().state,initial);assert.equal(vm.runInContext('drawn',h.ctx),'');assert.equal(h.$('#chart').hidden,true);
h.api.resetMeasurements();assert.deepEqual(h.api.measurementBackup().state,initial,'empty repeat reset must not overwrite the original backup');
assert.deepEqual(JSON.parse(h.store.get('ldexp-v2')),state,'reset survives reload');
h.api.updateMeasurementBackupControls();assert.equal(h.sets['[data-restore-measurements]'][0].hidden,false);
vm.runInContext("S.group='4'",h.ctx);assert.equal(h.api.measurementBackup(),null);vm.runInContext("S.group='3'",h.ctx);
h.ctx.confirmed=false;h.api.restoreMeasurements();assert.equal(h.state().rows.length,0);
h.ctx.confirmed=true;h.ctx.failKey='ldexp-v2';h.api.restoreMeasurements();assert.equal(h.state().rows.length,0);
h.ctx.failKey='';vm.runInContext("S.ans.q1='초기화 뒤 수정한 설계'",h.ctx);h.api.restoreMeasurements();state=h.state();
assert.deepEqual(state.rows,initial.rows);assert.deepEqual(state.history,initial.history);assert.equal(state.bg,566);assert.equal(state.graph.analysis.reason,'기존 근거');assert.equal(state.sourceId,'source');
assert.equal(state.ans.q1,'초기화 뒤 수정한 설계','restore keeps current personal design answers');
assert.deepEqual(JSON.parse(h.store.get('ldexp-v2')),state,'restored measurements survive reload');
console.log('PASS: reset/cancel/busy, backup-before-reset, storage failure preservation, identity/design/sensor-mode preservation, group isolation, restore/cancel/failure, persisted state');
