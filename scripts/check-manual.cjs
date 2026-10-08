const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf("let manualSignature = ''"),html.indexOf("$('#rebackground').onclick"));
function harness(bg=0){
  const S={distances:[5,10,15,20,25,30],bg,rows:[],history:[],manual:false},els={},inputs=[];
  const $=id=>els[id]||(els[id]={value:'',checked:false,open:false,innerHTML:''});
  const ctx=vm.createContext({S,$,console,Number,Set,JSON,document:{querySelectorAll:()=>inputs},
    now:()=> '2026-10-08T04:00:00Z',fmt:String,measurementOperationBusy:()=>ctx.busy,
    room:n=>{if(S.history.length+n>150)throw new Error('변경 이력은 최대 150건');},
    log:(action,before,after)=>S.history.push({action,before:structuredClone(before),after:structuredClone(after)}),
    confirm:()=>ctx.confirmed,applyMode:()=>{S.manual=$('#manual').checked;},save:()=>{ctx.saved=JSON.stringify(S);},renderData:()=>{},
    status:(id,text)=>{$(id).textContent=text;},busy:false,confirmed:true});
  vm.runInContext(source+'\nglobalThis.api={renderManualTable,manualChanges,applyManualTable};',ctx);
  const fill=values=>{inputs.splice(0,inputs.length,...values.map(v=>({dataset:{manualDistance:String(v.d),manualRound:String(v.round)},value:String(v.value)})));};
  ctx.api.renderManualTable();
  return {S,$,ctx,fill,api:ctx.api};
}
let h=harness();h.fill(h.S.distances.flatMap(d=>[1,2,3].map(round=>({d,round,value:d===30?0:1000/(d*d)+round}))));h.api.applyManualTable();
assert.equal(h.S.rows.length,18);assert(h.S.rows.every(r=>r.mode==='manual'&&r.bg===0));assert.equal(h.S.manual,true);assert.equal(h.S.rows.find(r=>r.d===30).lux,0);
assert.equal(JSON.parse(h.ctx.saved).rows.length,18,'batch entries persist through the normal local save');
assert(h.$('#manualTable').innerHTML.includes('30cm 3차 원래 빛의 밝기'));
h=harness(5);h.fill([{d:5,round:1,value:0},{d:10,round:1,value:''}]);h.api.applyManualTable();assert.equal(h.S.rows.length,1);assert.equal(h.S.rows[0].lux-h.S.rows[0].bg,-5);
for(const bad of [-1,'oops',Infinity]){h=harness();h.fill([{d:5,round:1,value:12},{d:10,round:1,value:bad}]);h.api.applyManualTable();assert.equal(h.S.rows.length,0,'validate all cells before changing any records');assert(h.$('#manualStatus').textContent.includes('실패'));}
h=harness(null);h.fill([{d:5,round:1,value:10}]);h.api.applyManualTable();assert.equal(h.S.rows.length,0);assert(h.$('#manualStatus').textContent.includes('배경'));
h=harness(10);h.S.rows=[{d:5,round:1,lux:25,bg:5,mode:'sensor',at:'old'}];h.api.renderManualTable();h.fill([{d:5,round:1,value:25}]);h.api.applyManualTable();assert.equal(h.S.rows[0].bg,5);assert.equal(h.S.rows[0].mode,'sensor','unchanged readings preserve their original background and source');
h.fill([{d:5,round:1,value:0}]);h.ctx.confirmed=false;h.api.applyManualTable();assert.equal(h.S.rows[0].lux,25);
h.ctx.confirmed=true;h.api.applyManualTable();assert.equal(h.S.rows[0].lux,0);assert.equal(h.S.rows[0].bg,10);assert.equal(h.S.history[0].before.lux,25);assert.equal(h.S.history[0].after.lux,0);
h=harness();h.fill([{d:5,round:1,value:10}]);h.ctx.busy=true;h.api.applyManualTable();assert.equal(h.S.rows.length,0);
h.ctx.busy=false;h.S.bg=2;h.api.applyManualTable();assert.equal(h.S.rows.length,0,'reject stale input after a background or measurement change');
h=harness();h.S.rows=[{d:5,round:1,lux:10},{d:10,round:1,lux:20}];h.S.history=Array(149).fill({});h.api.renderManualTable();h.fill([{d:5,round:1,value:11},{d:10,round:1,value:21}]);h.api.applyManualTable();assert.equal(h.S.rows[0].lux,10);assert.equal(h.S.history.length,149,'history overflow must not partially apply');
const modeSource=html.slice(html.indexOf('function applyMode()'),html.indexOf("$('#connect').onclick"));
h=harness();h.ctx.measuring=false;vm.runInContext(modeSource,h.ctx);h.$('#manualMeasure').checked=true;h.$('#manualMeasure').onchange();assert.equal(h.S.manual,true);assert.equal(h.$('#luxin').readOnly,false);assert.equal(h.$('#bgread').disabled,true);
h.$('#manual').checked=false;h.$('#manual').onchange();assert.equal(h.$('#manualMeasure').checked,false);assert.equal(h.$('#luxin').readOnly,true);
console.log('PASS: 18 manual values, zero/blank/background, atomic validation, correction history/cancel, stale/busy/overflow guards, persisted records, synchronized input modes');
