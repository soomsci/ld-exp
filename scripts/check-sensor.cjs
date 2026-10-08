const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('const PASCO_NATIVE ='), html.indexOf('const $ ='));
const uuid = (s,n) => `4a5c000${s}-000${n}-0000-0000-5c1e741f1c00`;
async function test(withoutResponse) {
  let receiver, onDisconnect, active = 0, maxActive = 0, errorCode = 0, notifications = 0;
  const packets = [];
  // The real Light 671-389 returns channel 1 commands on interface service 0.
  const notify = {uuid:uuid(0,3),properties:{notify:true},addEventListener:(event,callback)=>{receiver=callback;},startNotifications:async()=>{notifications++;}};
  const channelNotify = {uuid:uuid(1,3),properties:{notify:true},addEventListener:()=>{},startNotifications:async()=>{notifications++;}};
  const command = {uuid:uuid(1,2),properties:{notify:false,write:!withoutResponse,writeWithoutResponse:withoutResponse}};
  const write = async bytes => {
    packets.push([...bytes]);active++;maxActive=Math.max(active,maxActive);
    setTimeout(()=>{
      receiver({target:{value:new DataView(new Uint8Array([0x85,0,0]).buffer)}});
      // BLE DataViews may represent a slice of a larger buffer.
      const packet = new Uint8Array(21);packet.set([0xc0,errorCode,0x05],2);packet[7]=0x34;packet[8]=0x12;
      active--;receiver({target:{value:new DataView(packet.buffer,2,17)}});
    },1);
  };
  command.writeValueWithoutResponse = withoutResponse ? write : ()=>{throw new Error('wrong write mode');};
  command.writeValueWithResponse = withoutResponse ? ()=>{throw new Error('wrong write mode');} : write;
  const service = {uuid:uuid(1,0),getCharacteristics:async()=>[command,channelNotify],getCharacteristic:async()=>command};
  const interfaceService = {uuid:uuid(0,0),getCharacteristics:async()=>[notify]};
  const dev = {name:'Light TEST>68',addEventListener:(event,callback)=>onDisconnect=callback,
    gatt:{connected:false,connect:async()=>{dev.gatt.connected=true;return{getPrimaryService:async()=>service,getPrimaryServices:async()=>[service,interfaceService]};},disconnect:()=>{dev.gatt.connected=false;onDisconnect();}}};
  const context = vm.createContext({navigator:{bluetooth:{requestDevice:async()=>dev}},location:{search:''},URLSearchParams,Uint8Array,Date,Array,Promise,Error,setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,50)),clearTimeout});
  vm.runInContext(source+'\nglobalThis.sensor = PASCO;', context);
  const sensor = context.sensor;
  assert.equal(await sensor.connect(()=>{}),'Light TEST>68');assert.equal(notifications,2);
  assert.equal(await sensor.readOnce(),0x1234*2);
  const results=await Promise.all([sensor.readOnce(),sensor.readOnce()]);assert.equal(results.length,2);assert.equal(maxActive,1,'reads must serialize');
  assert.deepEqual(packets[0],[5,14]);
  errorCode=1;await assert.rejects(sensor.readOnce(),/응답 코드 1/);
  errorCode=0;assert.equal(await sensor.readAvg(3),0x1234*2);
  dev.gatt.disconnect();assert.equal(sensor.connected,false);await assert.rejects(sensor.readOnce(),/연결되지/);
}
(async()=>{await test(true);await test(false);console.log('PASS: interface-service response, sensor write mode, sliced packet decoding, serialized reads, average, response error, disconnect');})().catch(e=>{console.error(e);process.exitCode=1;});
