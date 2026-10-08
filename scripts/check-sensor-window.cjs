const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('const PASCO ='),html.indexOf('const $ ='));
const native=html.slice(html.indexOf('const PASCO_NATIVE ='),html.indexOf('const PASCO =')).trim().replace('const PASCO_NATIVE =','const PASCO =');
assert.equal(fs.readFileSync('sensor/pasco.js','utf8').trim(),native,'the standalone reader must use the tested native sensor implementation');
const channel='11111111-1111-4111-8111-111111111111',origin='https://n-test-script.googleusercontent.com';
async function run(){
  let listener,opened,interval,disconnected=0,allow=false,blockPopup=false;
  const sent=[],popup={closed:false,postMessage:(message,target)=>sent.push({message,target}),close(){this.closed=true;}};
  const context=vm.createContext({URLSearchParams,Number,String,Map,Promise,Error,setTimeout,clearTimeout,crypto:{randomUUID:()=>channel},location:{origin},navigator:{bluetooth:{}},
    document:{featurePolicy:{allowsFeature:()=>allow}},
    window:{addEventListener:(name,fn)=>listener=fn,removeEventListener:()=>listener=null,open:url=>{opened=url;popup.closed=false;return blockPopup?null:popup;},setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>interval=null},
    PASCO_NATIVE:{connect:async()=> 'native',readOnce:async()=>12,readAvg:async()=>13,connected:true}});
  vm.runInContext(source+'\nglobalThis.sensor=PASCO;',context);const sensor=context.sensor;
  assert(sensor.needsExternal);const connecting=sensor.connect(()=>disconnected++);
  assert.equal(new URL(opened).hash.includes(channel),true);assert.equal(new URLSearchParams(new URL(opened).hash.slice(1)).get('origin'),origin);
  const receive=(m,overrides={})=>listener({source:popup,origin:new URL(opened).origin,data:{channel,...m},...overrides});
  receive({type:'connected',name:'wrong'},{origin:'https://attacker.invalid'});assert.equal(sensor.connected,false);
  receive({type:'connected',name:'Light TEST'});assert.equal(await connecting,'Light TEST');assert(sensor.connected);
  let reading=sensor.readOnce(),message=sent.at(-1).message;
  assert.equal(message.fn,'readOnce');receive({type:'result',id:message.id,lux:0});assert.equal(await reading,0);
  reading=sensor.readAvg(3);message=sent.at(-1).message;assert.equal(message.n,3);assert.equal(message.fn,'readAvg');receive({type:'result',id:message.id,lux:25});assert.equal(await reading,25);
  reading=sensor.readOnce();message=sent.at(-1).message;receive({type:'result',id:message.id,lux:'999'});await assert.rejects(reading,/빛의 밝기/);
  reading=sensor.readOnce();receive({type:'disconnected'});await assert.rejects(reading,/끊겼/);assert.equal(sensor.connected,false);assert.equal(disconnected,1);assert.equal(interval,null);
  blockPopup=true;await assert.rejects(sensor.connect(()=>{}),/팝업/);
  allow=true;assert.equal(await sensor.connect(()=>{}),'native');assert.equal(await sensor.readAvg(),13);
  console.log('PASS: blocked-frame popup transport, channel/origin/window isolation, zero/average readings, malformed results, disconnect cleanup, popup blocking, native fallback, identical native driver');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
