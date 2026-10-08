const {chromium} = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=pathToFileURL(path.resolve('index.html')).href;
 await page.goto(url);await page.waitForFunction(()=>ready);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#cls').selectOption('2');await page.locator('#group').selectOption('3');
 await page.locator('[data-next=t2]').click();await page.locator('#memberNum0').fill('5');await page.locator('#memberName0').fill('실험학생');await page.locator('[data-tab=t1]').click();
 await page.locator('#answer-q1').fill('거리가 늘면 밝기가 달라질 것이다.');
 await page.locator('#indep').selectOption('광원과 센서 사이의 거리');
 await page.locator('#dep').selectOption('빛의 밝기');await page.locator('#ctrl input').first().check();
 await page.locator('[data-next=t2]').click();await page.locator('#manual').check();await page.locator('#bg').fill('0');
 assert.match(await page.locator('#bgStatus').innerText(),/0 lx/);
 await page.locator('#start').click();await page.locator('#luxin').fill('100');await page.locator('#keep').click();
 let state=await page.evaluate(()=>clone(S));assert.equal(state.rows.length,1);assert.equal(state.rows[0].round,1);assert.equal(state.rows[0].bg,0);
 assert.match(await page.locator('#measureTable tbody tr').first().innerText(),/1\/3회/);
 await page.locator('[data-tab=t2]').click();await page.locator('#bg').fill('10');await page.locator('[data-tab=t3]').click();
 state=await page.evaluate(()=>clone(S));assert.equal(state.rows[0].bg,0,'new background does not rewrite old measurement');
 await page.locator('#din').selectOption('5');await page.locator('#luxin').fill('105');await page.locator('#keep').click();
 assert.equal(await page.evaluate(()=>S.history.length),1);
 assert.equal(await page.evaluate(()=>corr(S.rows.find(r=>r.d===5))),95);
 for(const round of [1,2,3]) {
   await page.locator('[data-round="'+round+'"]').click();
   for(const d of [5,10,15,20,25,30]) {
     if(round===1&&d===5)continue;
     await page.locator('#din').selectOption(String(d));
     await page.locator('#luxin').fill(String(d===30?5:1000/d+round));
     await page.locator('#keep').click();
   }
 }
 assert.equal(await page.evaluate(()=>S.rows.length),18);
 assert.equal(await page.evaluate(()=>mean(30)),-5);
 assert.match(await page.locator('#negativeStatus').innerText(),/음수/);
 await page.locator('#gsubmit').click();assert.match(await page.locator('#groupStatus').innerText(),/제출 완료/);
 await page.screenshot({path:'artifacts/measurement-desktop.png',fullPage:true});
 await page.locator('[data-next=t4]').click();await page.locator('#graphTitle').fill('거리에 따른 빛의 밝기');
 assert(await page.locator('#yaxis').getAttribute('readonly')!==null);
 await page.locator('#xaxis').selectOption('distance');await page.locator('#showTrials').check();await page.locator('#draw').click();
 assert(await page.locator('#chart').isVisible());
 await page.locator('#connectPoints').check();assert(await page.locator('#chart').isVisible());assert.match(await page.locator('#chart').getAttribute('aria-label'),/평균점 점선 연결/);
 await page.locator('#connectPoints').uncheck();assert(await page.locator('#chart').isVisible());assert(!(await page.locator('#chart').getAttribute('aria-label')).includes('평균점 점선 연결'));
 const png=page.waitForEvent('download');await page.locator('#png').click();assert.match((await png).suggestedFilename(),/그래프.png/);
 const csv=page.waitForEvent('download');await page.locator('#dataCsv').click();assert.equal((await csv).suggestedFilename(),'빛실험_측정표.csv');
 await page.locator('#axisObservation').fill('거리가 커지면 빛의 밝기가 감소한다.');
 await page.locator('#xaxis').selectOption('squared');await page.locator('#draw').click();assert.match(await page.locator('#chart').getAttribute('aria-label'),/cm²/);
 await page.locator('#axisObservation').fill('제곱축에서도 곡선이다.');
 await page.locator('#xaxis').selectOption('inverseSquared');await page.locator('#draw').click();assert.match(await page.locator('#graphTable').innerText(),/0.00111/);
 await page.locator('#axisObservation').fill('이 자료는 작은 빛의 밝기에서 직선에서 벗어난다.');
 await page.locator('#linearAxis').selectOption('inverseSquared');await page.locator('#originCheck').selectOption('unclear');await page.locator('#analysisReason').fill('음수 보정값이 있어 원점 관계를 확정하기 어렵다.');
 assert(await page.locator('#chart').isVisible(),'analysis editing must preserve the graph');
 await page.locator('#rsubmit').click();assert.match(await page.locator('#reportStatus').innerText(),/개인 기록 제출 완료/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dev-report')).graph.analysis.origin),'unclear');
 const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('dev-report')).data.rows[0].lux);
 await page.locator('#graphTitle').fill('새 제목');assert(!(await page.locator('#chart').isVisible()));assert(await page.locator('#png').isDisabled());
 await page.locator('#rsubmit').click();assert.match(await page.locator('#reportStatus').innerText(),/다시 그려/);
 // Each transform keeps its own observation; stale data must be re-submitted.
 await page.locator('#xaxis').selectOption('distance');assert.match(await page.locator('#axisObservation').inputValue(),/거리가 커지면/);
 await page.locator('#xaxis').selectOption('inverseSquared');await page.locator('#draw').click();
 assert.equal(await page.evaluate(()=>S.graph.xaxis),'inverseSquared');
 await page.evaluate(()=>$('#toast').hidden=true);await page.screenshot({path:'artifacts/graph-desktop.png',fullPage:true});
 await page.locator('[data-tab=t3]').click();await page.locator('[data-round="1"]').click();await page.locator('#din').selectOption('5');await page.locator('#luxin').fill('500');await page.locator('#keep').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dev-report')).data.rows[0].lux),snapshot);
 assert.match(await page.locator('#groupStatus').innerText(),/다시 제출/);
 // Import restores exact submitted rows, with confirmation before replacing local data.
 await page.reload();await page.waitForFunction(()=>ready);assert.equal(await page.evaluate(()=>S.rows.length),18);assert.equal(await page.evaluate(()=>S.graph.analysis.origin),'unclear');
 await page.locator('[data-tab=t3]').click();await page.locator('#measureTable [data-record="1:5"]').click();await page.locator('#deleteRecord').click();assert.equal(await page.evaluate(()=>mean(5)),null);assert.equal(await page.evaluate(()=>S.history.at(-1).action),'delete');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/measurement-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'student page must not overflow');
 // API failure persists next to the action; retry works.
 await page.evaluate(()=>{DEV.submitGroup=()=>{throw new Error('테스트 연결 실패');};});await page.locator('#gdraft').click();assert.match(await page.locator('#groupStatus').innerText(),/테스트 연결 실패/);
 // Reset and restore current measurements without deleting submitted snapshots.
 const beforeReset=await page.evaluate(()=>clone(S));
 await page.locator('#t3 [data-reset-measurements]').click();
 assert.equal(await page.evaluate(()=>S.rows.length),0);assert.equal(await page.evaluate(()=>S.bg),null);assert.equal(await page.evaluate(()=>S.round),1);
 assert.equal(await page.evaluate(()=>S.name),beforeReset.name);assert.equal(await page.evaluate(()=>S.graph.analysis.reason),'');
 await page.locator('#t2 [data-restore-measurements]').click();
 assert.deepEqual(await page.evaluate(()=>S.rows),beforeReset.rows);assert.equal(await page.evaluate(()=>S.graph.analysis.reason),beforeReset.graph.analysis.reason);
 // Legacy local data is imported into one trial, with the original local entry retained.
 const old=await browser.newPage();await old.goto(url);await old.evaluate(()=>{localStorage.removeItem('ldexp-v2');localStorage.setItem('ldexp-v1',JSON.stringify({cls:'2',group:'3',bg:0,rows:[{d:10,lux:100},{d:20,lux:30}],tab:'t4',ans:{q7:'이전 답변'}}));});await old.reload();await old.waitForFunction(()=>ready);
 assert.equal(await old.evaluate(()=>S.rows.length),2);assert.equal(await old.evaluate(()=>S.rows.every(r=>r.round===1)),true);assert.equal(await old.evaluate(()=>mean(10)),null);assert.equal(await old.evaluate(()=>JSON.parse(localStorage.getItem('ldexp-v1')).ans.q7),'이전 답변');
 // Explicit background correction and distance changes retain original evidence.
 old.on('dialog',dialog=>dialog.accept());
 await old.locator('[data-tab=t2]').click();await old.locator('#manual').check();await old.locator('#bg').fill('2');
 await old.locator('#t2 details').last().evaluate(el=>el.open=true);
 await old.locator('#rebackground').click();assert.equal(await old.evaluate(()=>S.rows.every(r=>r.bg===2)),true);assert.equal(await old.evaluate(()=>S.history.length),2);
 await old.locator('#distances').fill('5, 15, 20, 25, 30');await old.locator('#setDistances').click();assert.equal(await old.evaluate(()=>S.rows.length),1);assert.equal(await old.evaluate(()=>S.history.at(-1).action),'distance');
 await old.locator('#manual').uncheck();await old.locator('#manual').check();assert.equal(await old.evaluate(()=>S.rows.length),1);
 // Teacher's current and legacy contexts, grading and question editing.
 await page.goto(pathToFileURL(path.resolve('teacher.html')).href);await page.waitForSelector('#list tr[data-email]');
 await page.locator('#list tr[data-email="s1@school"]').click();assert.match(await page.locator('#snapshot').innerText(),/3회 측정/);assert.match(await page.locator('#detail').innerText(),/가로축: 거리/);assert(!(await page.locator('#detail').innerText()).includes('Q3.'));
 await page.evaluate(()=>{HISTORY=[{...structuredClone(REPORTS.find(r=>r.email==='s1@school')),id:'archive-example',at:'09/23 18:00'}];openReport(REPORTS.find(r=>r.email==='s1@school'));});await page.locator('#submissionHistory').selectOption('1');assert(await page.locator('#fb').getAttribute('readonly')!==null);assert(!(await page.locator('#gsave').isVisible()));await page.locator('#submissionHistory').selectOption('0');
 await page.screenshot({path:'artifacts/teacher-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'teacher page must not overflow');
 await page.setViewportSize({width:1366,height:900});await page.screenshot({path:'artifacts/teacher-desktop.png',fullPage:true});await page.locator('#list tr[data-email="s2@school"]').click();assert.match(await page.locator('#detail').innerText(),/당시 문항과 배점/);assert.match(await page.locator('#tot').innerText(),/5점/);
 await page.locator('#detail input[data-q=q7]').fill('3');await page.locator('#gsave').click();assert.match(await page.locator('#notice').innerText(),/저장/);
 await page.locator('nav button[data-tab=qs]').click();assert(!(await page.locator('#qedit').innerText()).includes('분석'));assert(!(await page.locator('#qedit').innerText()).includes('Q3.'));
 await page.screenshot({path:'artifacts/teacher-questions-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: manual 18 records, background zero/negative/history, stale graph, three axis transforms, observations/analysis, downloads, submission/import/reload/failure, legacy migration, teacher grading, responsive layout');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
