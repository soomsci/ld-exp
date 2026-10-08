const PASCO = (() => {
  const uuid = (s, c) => `4a5c000${s}-000${c}-0000-0000-5c1e741f1c00`;
  let dev, send, waiter, chain = Promise.resolve();
  const diagnostics = [];
  function debug(msg) {
    if (!new URLSearchParams(location.search).has('sensor-test')) return;
    diagnostics.push(new Date().toISOString() + ' ' + msg);
    if (diagnostics.length > 40) diagnostics.shift();
    let box = document.getElementById('sensorLog');
    if (!box) {
      const details = document.createElement('details');
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = '센서 연결 진단 (실물 검사)';
      box = document.createElement('pre'); box.id = 'sensorLog';
      box.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
      details.append(summary, box);
      document.getElementById('bstat').after(details);
    }
    box.replaceChildren(...diagnostics.map(line => {
      const entry = document.createElement('div'); entry.textContent = line; return entry;
    }));
  }

  async function connect(onDisconnect) {
    if (dev?.gatt.connected) dev.gatt.disconnect();
    dev = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'Light' }],
      optionalServices: [0, 1, 2].map(s => uuid(s, 0)),
    });
    debug('device ' + dev.name);
    dev.addEventListener('gattserverdisconnected', () => { send = null; onDisconnect(); });
    const server = await dev.gatt.connect();
    const svc = await server.getPrimaryService(uuid(1, 0));
    // Subscribe to all accessible PASCO services. The real PS-3213 tested on
    // 2026-10-07 returns channel 1 measurement responses on interface service 0.
    for (const service of await server.getPrimaryServices()) {
      debug('service ' + service.uuid);
      for (const ch of await service.getCharacteristics()) {
        debug('characteristic ' + ch.uuid + ' notify=' + ch.properties.notify + ' write=' + ch.properties.write + ' writeWithoutResponse=' + ch.properties.writeWithoutResponse);
        if (!ch.properties.notify) continue;
        ch.addEventListener('characteristicvaluechanged', e => {
          const v = new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength);
          debug('receive ' + ch.uuid + ' [' + Array.from(v, x => x.toString(16).padStart(2, '0')).join(' ') + ']');
          if (v.length >= 3 && v[0] === 0xC0 && v[2] === 0x05 && waiter) {
            if (v[1] !== 0) waiter(null, new Error('센서가 측정 요청을 거부했어요 (응답 코드 ' + v[1] + ').'));
            else if (v.length >= 17) waiter(v.slice(3));
          }
        });
        await ch.startNotifications();
      }
    }
    send = await svc.getCharacteristic(uuid(1, 2));
    return dev.name;
  }

  // 1회 측정: 채널0(센서 2030)은 2바이트 원시값 7개(R,G,B,IR,UVA,UVB,UVI) → 조도 = 2 × G
  // 공식 라이브러리의 기본 변환을 사용하며 공장 보정값은 읽지 않음. 절대 조도 정확도는 별도 비교가 필요함.
  function readOnce() {
    return chain = chain.catch(() => {}).then(() => new Promise((res, rej) => {
      if (!send) return rej(new Error('센서가 연결되지 않았어요.'));
      const t = setTimeout(() => { waiter = null; rej(new Error('센서 응답이 없어요.')); }, 2000);
      waiter = (p, error) => { clearTimeout(t); waiter = null; if (error) rej(error); else res(2 * (p[2] | p[3] << 8)); };
      debug('send [05 0e]');
      const command = new Uint8Array([0x05, 14]);
      const writing = send.properties.writeWithoutResponse
        ? send.writeValueWithoutResponse(command)
        : send.writeValueWithResponse(command);
      writing.then(() => debug('command sent')).catch(e => { clearTimeout(t); waiter = null; rej(e); });
    }));
  }

  async function readAvg(n = 5) {
    let sum = 0;
    for (let i = 0; i < n; i++) { sum += await readOnce(); await new Promise(r => setTimeout(r, 200)); }
    return sum / n;
  }

  return { connect, readOnce, readAvg, get connected() { return !!send; } };
})();
