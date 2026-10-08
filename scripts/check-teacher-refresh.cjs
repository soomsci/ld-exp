const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('teacher.html','utf8');
const source=html.slice(html.indexOf('async function load() {'),html.indexOf("$('#reload').onclick"));
function harness(selected=null,shown=null){
  const elements={},requests=[],opened=[];let timeout;
  const context=vm.createContext({Promise,Error,String,Date,Object,refreshing:false,QS:[],HISTORY:[],REPORTS:[{email:'old'}],cur:selected,dirty:false,groupCache:{old:true},
    $:id=>elements[id]||(elements[id]={textContent:'',disabled:false,hidden:false,innerHTML:''}),
    api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){},
    renderList(){},renderQEdit(){},filtered:()=>shown===null?context.REPORTS:Array(shown).fill({}),
    openReport:r=>{opened.push(r);context.cur=r;},toast:msg=>context.$('#notice').textContent=msg});
  vm.runInContext(source,context);
  return{context,elements,requests,opened,timeout:()=>timeout()};
}
const response=reports=>({questions:[],history:[],sheetUrl:'#sheet',reports});
(async()=>{
  let h=harness({email:'measurement:2:3',groupActivity:true,cls:2,group:3});
  const first=h.context.load();await h.context.load();assert.equal(h.requests.length,1,'duplicate refresh is blocked');assert(h.elements['#reload'].disabled);
  const report={email:'group:2:3',groupActivity:true,cls:2,group:3,id:'new'};
  h.requests[0].resolve(response([report]));await first;
  assert.equal(h.opened[0],report,'measurement selection follows its final report');assert.equal(Object.keys(h.context.groupCache).length,0);
  assert(h.elements['#refreshStatus'].textContent.includes('갱신 완료'));assert.equal(h.elements['#reload'].disabled,false);
  const second=h.context.load();const newer={...report,id:'newer'};h.requests[1].resolve(response([newer]));await second;assert.equal(h.opened.at(-1),newer,'selected detail is refreshed');
  h=harness();const failed=h.context.load();h.requests[0].reject(new Error('offline'));await failed;
  assert.equal(h.context.REPORTS[0].email,'old');assert(h.elements['#notice'].textContent.includes('offline'));assert.equal(h.context.refreshing,false);
  h=harness();const timed=h.context.load();h.timeout();await timed;h.requests[0].resolve(response([{email:'late'}]));await new Promise(setImmediate);
  assert.equal(h.context.REPORTS[0].email,'old','late response after timeout cannot overwrite current data');assert.equal(h.elements['#reload'].disabled,false);
  h=harness(null,0);const filtered=h.context.load();h.requests[0].resolve(response([report]));await filtered;assert(h.elements['#refreshStatus'].textContent.includes('현재 필터 0건'));assert(h.elements['#notice'].textContent.includes('전체'));
  h=harness(report);const removed=h.context.load();h.requests[0].resolve(response([]));await removed;assert.equal(h.context.cur,null);
  console.log('PASS: refresh busy/success/error/timeout, stale response isolation, measurement-to-report selection, latest detail, cache reset, filter indication');
})().catch(e=>{console.error(e);process.exitCode=1;});
