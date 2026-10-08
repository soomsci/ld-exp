const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function run(){
  const html=fs.readFileSync('index.html','utf8'),source=html.slice(html.indexOf('const RemoteStudentAPI ='),html.indexOf('const localDevelopment='));
  let listener,frame,serial=0;const sent=[];
  const nonce='11111111-1111-4111-8111-111111111111',origin='https://n-test-script.googleusercontent.com';
  const target={postMessage:(message,to)=>sent.push({message,to})};
  const context=vm.createContext({URLSearchParams,Number,Map,Promise,Error,encodeURIComponent,setTimeout,clearTimeout,crypto:{randomUUID:()=>serial++===0?nonce:'request-'+serial},
    window:{addEventListener:(name,fn)=>listener=fn,removeEventListener:()=>{}},
    document:{createElement:()=>({remove:()=>{}}),body:{append:value=>frame=value}}});
  vm.runInContext(source+'\nglobalThis.remote=RemoteStudentAPI;',context);
  const config=context.remote.request('getConfig',['device-token']);
  assert(frame.src.includes('?page=relay&channel='+nonce));assert.equal(frame.hidden,true);
  listener({source:target,origin:'https://attacker.invalid',data:{type:'ldexp-ready',channel:nonce}});assert.equal(sent.length,0);
  listener({source:target,origin,data:{type:'ldexp-ready',channel:nonce}});await new Promise(setImmediate);
  const m=sent[0].message;assert.equal(m.fn,'getConfig');assert.deepEqual(Array.from(m.args),['device-token']);
  listener({source:target,origin,data:{type:'ldexp-response',channel:nonce,id:m.id,value:{studentToken:'saved'}}});assert.equal((await config).studentToken,'saved');
  const submitting=context.remote.request('submitGroup',[{cls:2,group:3},'token']);await new Promise(setImmediate);
  const call=sent.at(-1).message;assert.equal(call.fn,'submitGroup');listener({source:target,origin,data:{type:'ldexp-response',channel:nonce,id:call.id,error:'server rejected'}});await assert.rejects(submitting,/server rejected/);
  const relay=fs.readFileSync('relay.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= JSON.stringify(channel) ?>',JSON.stringify(nonce));
  let relayListener,invoked=0;const replies=[],top={postMessage:(m,to)=>replies.push({m,to})};
  const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getConfig(...args){invoked++;this.success({ok:args[0]});}};
  const ctx=vm.createContext({Set,Array,String,window:{top,addEventListener:(name,fn)=>relayListener=fn},google:{script:{run:runner}}});
  vm.runInContext(relay,ctx);assert.equal(replies[0].m.type,'ldexp-ready');
  const request={source:top,origin:'https://soomsci.github.io',data:{channel:nonce,type:'ldexp-request',id:'1',fn:'getConfig',args:['token']}};
  relayListener({...request,data:{...request.data,fn:'listReports'}});assert.equal(invoked,0,'teacher APIs are excluded from the public relay');
  relayListener({...request,origin:'https://attacker.invalid'});assert.equal(invoked,0);
  relayListener(request);assert.equal(invoked,1);assert.equal(replies[1].m.value.ok,'token');
  console.log('PASS: Pages-to-Apps-Script handshake, channel/origin isolation, persistent session arguments, server success/error, student-only relay whitelist');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
