const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const math=html.slice(html.indexOf('const XAXES='),html.indexOf('Object.entries(XAXES).forEach'));
const drawing=html.slice(html.indexOf('function graphValid()'),html.indexOf("$('#draw').onclick"));
const ds=[5,10,15,20,25,30],elements={},text=[],arcs=[],dashedPaths=[];
let dash=[],path=[],stack=[];
const methods={measureText:s=>({width:s.length*14}),fillText:(...args)=>text.push(args),arc:(...args)=>arcs.push(args),
 save:()=>stack.push(dash.slice()),restore:()=>{dash=stack.pop();},setLineDash:value=>{dash=[...value];},
 beginPath:()=>{path=[];},moveTo:(x,y)=>path.push([x,y]),lineTo:(x,y)=>path.push([x,y]),
 stroke:()=>{if(dash.length)dashedPaths.push(path.slice());}};
const ctx=new Proxy({}, {get:(_,key)=>methods[key]||(()=>{}),set:()=>true});
const $=id=>elements[id]||(elements[id]={value:'',textContent:'',hidden:true,getContext:()=>ctx,setAttribute:(key,value)=>elements[id][key]=value});
const S={distances:ds,rows:ds.map(d=>({d,round:1,lux:10000/(d*d),bg:0})),graph:{title:'역제곱 관계',xaxis:'distance',yaxis:'mean',showTrials:false}};
const context=vm.createContext({S,$,Object,Number,Math,Option:function(){},fmt:n=>n===null?'—':String(n),mean:d=>10000/(d*d),corr:r=>r.lux-r.bg,complete:()=>true,graphSig:()=>JSON.stringify(S.graph),status:(id,msg)=>$(id).textContent=msg});
vm.runInContext(math+drawing+'\nglobalThis.api={axisValue,axisNumber,normalizeGraph,graphTable,syncAxisView,drawChart,analysisValid};',context);
const api=context.api;api.normalizeGraph();
assert.equal(api.axisValue(20,'distance'),20);assert.equal(api.axisValue(20,'squared'),400);assert.equal(api.axisValue(20,'inverseSquared'),.0025);
assert.equal(api.axisNumber(1/900),'0.00111');assert.notEqual(api.axisNumber(1e-9),'0');
for(const axis of ['distance','squared','inverseSquared']){
 S.graph.xaxis=axis;text.length=arcs.length=dashedPaths.length=0;api.drawChart();assert.equal($('#chart').hidden,false);assert.equal(arcs.filter(a=>a[2]===8).length,6);assert.equal(dashedPaths.length,0);
 assert($('#chart')['aria-label'].includes('세로축 조도'));assert($('#chart')['aria-label'].includes(axis==='squared'?'cm²':axis==='inverseSquared'?'cm⁻²':'cm)'));
 if(axis==='inverseSquared'){
  const dots=arcs.filter(a=>a[2]===8),slopes=dots.map(a=>(545-a[1])/(a[0]-115));
  slopes.forEach(slope=>assert(Math.abs(slope-slopes[0])<1e-10,'ideal inverse-square samples form a straight line toward the origin'));
  assert.equal(new Set(text.filter(t=>t[2]===571).map(t=>t[0])).size,6,'inverse ticks must remain distinct');
  assert(api.graphTable().includes('0.00111'));
 }
 S.graph.connectPoints=true;arcs.length=dashedPaths.length=0;api.drawChart();
 assert.equal(dashedPaths.length,2,'measured-point line and its legend');
 const dots=arcs.filter(a=>a[2]===8).map(a=>a.slice(0,2)).sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(dashedPaths[0],dots,'connect only measured mean points in ascending transformed x order');
 assert.equal(dash.length,0,'dash style must not leak to points or axes');
 assert($('#chart')['aria-label'].includes('평균점 점선 연결'));
 S.graph.connectPoints=false;
}
S.graph.analysis.observations.distance='곡선';S.graph.xaxis='distance';api.syncAxisView();assert.equal($('#axisObservation').value,'곡선');
S.graph.xaxis='inverseSquared';api.syncAxisView();assert.equal($('#axisObservation').value,'');
assert.throws(()=>api.analysisValid(),/근거/);Object.assign(S.graph.analysis,{linearAxis:'inverseSquared',origin:'unclear',reason:'실제 자료를 더 확인해야 함'});api.analysisValid();
S.graph.xaxis='mean';S.graph.yaxis='distance';api.normalizeGraph();assert.equal(S.graph.xaxis,'distance');assert.equal(S.graph.yaxis,'mean');assert.equal(S.graph.analysis.origin,'unclear');
// Existing report answers remain displayable, including reversed historical axes.
const teacher=fs.readFileSync('teacher.html','utf8');
const teacherContext=vm.createContext({esc:s=>String(s??'').replaceAll('<','&lt;'),mark:()=>''});
vm.runInContext(teacher.slice(teacher.indexOf('function showAnswer('),teacher.indexOf('function dataTable('))+'\nglobalThis.answer=showAnswer;',teacherContext);
assert(teacherContext.answer({type:'graph'},{title:'old',xaxis:'mean',yaxis:'distance'}).includes('확장 이전 제출'));
assert(teacherContext.answer({type:'graph'},S.graph).includes('실제 자료를 더 확인해야 함'));
console.log('PASS: three transforms, fixed lux axis, inverse tick precision, measured-point dashed line/order, per-axis notes, analysis validation, legacy drafts/reports');
