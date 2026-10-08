const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  appendRow(row) { this.rows.push([...row]); }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  setFrozenRows() {}
  getSheetId() { return 1; }
  clearContents() { this.rows = []; }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, col, count = 1, width = 1) {
    return {
      getValues: () => Array.from({length:count}, (_,i) => Array.from({length:width}, (_,j) => this.rows[row+i-1]?.[col+j-1] ?? '')),
      setValues: values => values.forEach((r,i) => r.forEach((v,j) => { (this.rows[row+i-1] ||= [])[col+j-1] = v; })),
      clearContent: () => { for(let i=0;i<count;i++) for(let j=0;j<width;j++) (this.rows[row+i-1] ||= [])[col+j-1] = ''; },
    };
  }
}
const sheets = new Map(), images = new Map();
let user = 'student@school', teacher = 'teacher@school', serial = 0;
const ss = { getSheetByName:n=>sheets.get(n), insertSheet:n=>{const s = new Sheet(n);sheets.set(n,s);return s;}, getUrl:()=> 'https://example.invalid/sheet' };
const context = vm.createContext({console, Date, Set, Math, JSON, isFinite,
  Session:{getActiveUser:()=>({getEmail:()=>user}),getEffectiveUser:()=>({getEmail:()=>teacher})},
  SpreadsheetApp:{getActive:()=>ss},
  HtmlService:{createHtmlOutput:html=>({html})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,s)=>Array.from(crypto.createHash(alg).update(s).digest()),base64Decode:s=>Buffer.from(s,'base64'),base64Encode:b=>Buffer.from(b).toString('base64'),newBlob:()=>({}),formatDate:d=>d.toISOString()},
  DriveApp:{getFoldersByName:()=>({hasNext:()=>true,next:()=>({createFile:()=>{const id='img-'+(++serial);images.set(id,true);return{getId:()=>id};}})}),getFileById:id=>({setTrashed:()=>images.delete(id)})},
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
const call = (fn,...args) => context[fn](...args);
const legacyText = fs.readFileSync('scripts/legacy-questions.json','utf8');
const legacy = ss.insertSheet('문항');legacy.rows=[['id','순서','단계','유형','발문','배점','필수'],...JSON.parse(legacyText)];
const config = call('getConfig');
assert.equal(config.questions.reduce((s,q)=>s+q.points,0),8);
assert(config.questions.every(q=>q.stage!=='분석'));
assert.equal(legacy.rows.length,11);
const ds=[5,10,15,20,25,30];
const data={version:2,cls:2,group:3,bg:0,distances:ds,history:[],rows:[1,2,3].flatMap(round=>ds.map(d=>({round,d,lux:d===30?0:1000/d+round,bg:d===30?10:0,mode:'manual',at:'2026-10-01T03:00:00Z'})))};
assert.equal(call('validateData_',data,true).members.length,4,'older measurements remain compatible');
data.members=[{num:'01',name:' 첫째 '},{num:'2',name:'둘째'},{num:'3',name:'셋째'},{num:'4',name:'넷째'}];
assert.throws(()=>call('submitGroup',{...data,members:[{num:'1',name:'첫째'},{num:'01',name:'둘째'}]}),/중복/);
assert.throws(()=>call('submitGroup',{...data,members:[{num:'1',name:''}]}),/함께/);
assert.throws(()=>call('submitGroup',{...data,members:[{num:'41',name:'학생'}]}),/1~40/);
assert.throws(()=>call('submitGroup',{...data,members:Array(5).fill({})}),/최대 4명/);
call('submitGroup',{...data,status:'draft',members:[{num:'1',name:''}],rows:[]});
assert.throws(()=>call('submitGroup',{...data,rows:data.rows.slice(1)}),/모든 거리/);
assert.throws(()=>call('submitGroup',{...data,rows:[...data.rows.slice(1),data.rows[1]]}),/중복/);
assert.throws(()=>call('submitGroup',{...data,rows:data.rows.map((r,i)=>i? r:{...r,lux:''})}),/빛의 밝기/);
assert.throws(()=>call('submitGroup',{...data,distances:[1,3,7,11,17]}),/두 배/);
assert.throws(()=>call('submitGroup',{...data,bg:null}),/모든 거리/);
call('submitGroup',{...data,status:'draft',rows:[]});
assert.equal(call('loadGroup',2,3),null);
const first=call('submitGroup',data);
assert.equal(call('loadGroup',2,3).id,first.id);
assert.equal(call('loadGroup',2,3).members[0].num,'1');
assert.equal(call('loadGroup',2,3).members[0].name,'첫째');
assert.equal(first.rows.find(r=>r.d===30).lux-first.rows.find(r=>r.d===30).bg,-10);
const graph={title:'측정 결과',xaxis:'inverseSquared',yaxis:'mean',showTrials:true,analysis:{observations:{distance:'감소하는 곡선',squared:'곡선',inverseSquared:'직선에 가까움'},linearAxis:'inverseSquared',origin:'unclear',reason:'음수 보정값이 있어 비례를 확정하기 어렵다.'}};
const payload={cls:2,group:3,num:5,name:'학생',answers:{q1:'가설',q2:{indep:'거리',dep:'빛의 밝기',ctrl:'LED'},q3:''},graph,data,sourceId:first.id,png:'data:image/png;base64,aGVsbG8='};
assert.throws(()=>call('submitReport',{...payload,graph:{...graph,yaxis:'distance'}}),/빛의 밝기로 고정/);
assert.throws(()=>call('submitReport',{...payload,graph:{...graph,xaxis:'mean'}}),/가로축/);
assert.throws(()=>call('submitReport',{...payload,graph:{...graph,analysis:{...graph.analysis,reason:''}}}),/분석/);
for(const axis of ['distance','squared','inverseSquared'])assert.equal(call('graph_', {...graph,xaxis:axis}).xaxis,axis);
assert.equal(call('graph_', graph).connectPoints,false);
assert.equal(call('graph_', {...graph,connectPoints:true}).connectPoints,true);
assert.throws(()=>call('submitReport',{...payload,sourceId:'missing'}),/먼저/);
call('submitReport',payload);
const submission=sheets.get('제출').rows[1];const image=submission[7];
assert.equal(JSON.parse(submission[15]).rows.length,18);
assert.equal(JSON.parse(submission[15]).members[3].name,'넷째');
assert.equal(JSON.parse(submission[6]).q4.xaxis,'inverseSquared');
assert.equal(JSON.parse(submission[6]).q4.analysis.origin,'unclear');
assert.equal(JSON.parse(submission[6]).q4.analysis.reason,graph.analysis.reason);
// Latest group edits cannot change the student's previously saved evidence.
const changed=structuredClone(data);changed.rows[0].lux=9999;
changed.members[0].name='변경된 이름';
const second=call('submitGroup',changed);
assert.notEqual(second.id,first.id);
assert.equal(JSON.parse(sheets.get('제출').rows[1][15]).rows[0].lux,data.rows[0].lux);
assert.equal(JSON.parse(sheets.get('제출').rows[1][15]).members[0].name,'첫째','group edits preserve submitted member snapshot');
assert.throws(()=>call('submitReport',{...payload,data:changed}),/변경/);
call('submitReport',{...payload,data:changed,sourceId:second.id});
assert.equal(sheets.get('제출이력').rows.length,2);
assert(images.has(image),'prior graph must remain available');
// Legacy measurements remain one trial; legacy grading uses the old question sheet.
sheets.get('모둠데이터').appendRow([new Date(),1,1,'old@school',12,1,JSON.stringify([{d:10,lux:1010}])]);
assert.equal(call('loadGroup',1,1).rows.length,1);
assert.equal(call('loadGroup',1,1).version,1);
sheets.get('제출').appendRow(['old@school',1,1,'이전학생',1,new Date(),JSON.stringify({q7:'관계'}),'',JSON.stringify({q7:3}),'',3,'','제출']);
user=teacher;
const list=call('listReports');assert.equal(list.history.length,1);
assert.equal(list.reports.find(r=>r.email==='old@school').questions.length,10);
assert.equal(call('saveGrade','old@school',{q7:3},'기존 채점'),3);
assert.throws(()=>call('saveQuestions',config.questions.filter(q=>q.type!=='graph')),/그래프 작성/);
call('saveQuestions',config.questions.map(q=>({...q,points:q.points+1})));
assert.equal(call('listReports').reports.find(r=>r.email==='student@school').questions.reduce((s,q)=>s+q.points,0),8);
const grades=call('gradeTable');assert(grades.rows.some(r=>r.includes(20)),'legacy maximum preserved');
user='student@school';
const roster=ss.insertSheet('명렬표');roster.rows=[['이메일','반','번호','이름','모둠'],['student@school',2,5,'학생',3]];
assert.equal(call('loadGroup',1,1).group,3,'roster enforces own group');
user='outsider@school';assert.throws(()=>call('submitGroup',data),/명렬표/);
// Public students have opaque device credentials; teacher data stays protected.
user='';
const guest=call('getConfig'), other=call('getConfig');
assert(!guest.error);assert(guest.studentToken);assert.notEqual(guest.email,other.email);
assert.equal(call('getConfig',guest.studentToken).email,guest.email);
assert(!guest.email.includes(guest.studentToken),'never expose the bearer credential as a report/group identifier');
assert.throws(()=>call('submitGroup',data,'forged'),/접속 정보/);
assert.throws(()=>call('submitGroup',data),/로그인/);
const publicData={...data,cls:4,group:12};
const shared=call('submitGroup',publicData,guest.studentToken);
user=teacher;
const measurement=call('listReports').reports.find(r=>r.cls===4&&r.group===12);
assert(measurement.measurementOnly,'measurement submission is visible before final report');
assert.equal(measurement.status,'측정 자료 제출');
assert.equal(measurement.data.rows.length,18);
assert.equal(measurement.data.members[0].name,'첫째');
assert(!call('gradeTable').rows.some(r=>r[0]===4&&r[1]===12),'measurement-only rows are excluded from grades');
assert.throws(()=>call('saveGrade',measurement.email,{},''),/제출 기록/);
const draft=call('submitGroup',{...publicData,cls:3,group:10,status:'draft',rows:[]},guest.studentToken);
assert.equal(call('listReports').reports.find(r=>r.cls===3&&r.group===10).status,'측정 중');
user='';
assert.match(shared.shareCode,/^[0-9a-f]{12}$/);
assert.throws(()=>call('loadGroup',4,12,'',other.studentToken),/자료 코드/);
assert.throws(()=>call('loadGroup',4,12,'wrong',other.studentToken),/자료 코드/);
assert.equal(call('loadGroup',4,12,'',guest.studentToken).id,shared.id);
assert.equal(call('loadGroup',4,12,shared.shareCode,other.studentToken).members[0].name,'첫째');
call('submitReport',{...payload,cls:4,group:12,num:undefined,name:undefined,data:publicData,sourceId:shared.id},guest.studentToken);
const sharedActivity=call('loadGroup',4,12,shared.shareCode,other.studentToken);
assert.equal(sharedActivity.activity.answers.q1,'가설');
call('submitReport',{...payload,cls:4,group:12,num:undefined,name:undefined,data:publicData,sourceId:shared.id},other.studentToken);
assert.equal(sheets.get('제출').rows.filter(r=>r[0]==='group:4:12').length,1,'one final report per group across devices');
for(const fn of ['listReports','gradeTable','exportGrades','getImage','saveGrade','saveQuestions'])assert.throws(()=>call(fn),/교사/);
assert(call('doGet',{parameter:{page:'teacher'}}).html.includes('교사 계정'));
user=teacher;
assert(call('listReports').reports.find(r=>r.email==='group:4:12').groupActivity);
assert.equal(call('listReports').reports.filter(r=>r.cls===4&&r.group===12).length,1,'final report replaces measurement-only listing');
assert(!call('listReports').reports.find(r=>r.email==='group:4:12').measurementOnly);
assert(call('gradeTable').header.includes('모둠원4 이름'));
user='';
const direct={...payload,cls:3,group:11,data:{...data,cls:3,group:11},sourceId:undefined};
const before=sheets.get('모둠데이터').rows.length;
assert.throws(()=>call('submitReport',{...direct,png:'invalid'},guest.studentToken),/PNG/);
assert.equal(sheets.get('모둠데이터').rows.length,before,'validate final submission before storing measurements');
const saved=call('submitReport',direct,guest.studentToken);
assert(saved.sourceId&&saved.sourceAt,'one final submission also stores its measurement source');
assert.equal(sheets.get('모둠데이터').rows.length,before+1);
user=teacher;
const final=call('listReports').reports.find(r=>r.email==='group:3:11');
assert.equal(final.sourceId,saved.sourceId);assert.equal(final.data.rows.length,18);
assert.equal(call('listReports').reports.filter(r=>r.cls===3&&r.group===11).length,1);
console.log('PASS: validation, evidence/history, sessions, teacher measurement monitoring, direct final submission, one report per group, teacher-only APIs');
