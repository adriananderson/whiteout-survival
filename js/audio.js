'use strict';

const Audio = (() => {
  let _ctx = null;
  let _out = null;
  let _bubbleTimer = 1.5;
  const _thr = {};   // throttle timestamps keyed by sound id

  function _gc() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _out = _ctx.createGain();
      _out.gain.value = 0.7;
      _out.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // Play fn() only if at least `gap` seconds have passed since last play for this key
  function _play(key, fn, gap = 0.15) {
    const now = performance.now() / 1000;
    if ((now - (_thr[key] || 0)) < gap) return;
    _thr[key] = now;
    try { fn(_gc()); } catch (_) {}
  }

  function _tone(c, freq, type, vol, dur, freqEnd) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g); g.connect(_out);
    osc.start(); osc.stop(c.currentTime + dur);
  }

  function _noise(c, dur, vol, filterFreq, q) {
    const n = Math.ceil(c.sampleRate * Math.min(dur, 1));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq; filt.Q.value = q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(_out);
    src.start(); src.stop(c.currentTime + dur);
  }

  function _bubble(c) {
    const freq = 380 + Math.random() * 680;
    const dur  = 0.07 + Math.random() * 0.04;
    const osc  = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * (1.8 + Math.random() * 1.2), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g); g.connect(_out);
    osc.start(); osc.stop(c.currentTime + dur + 0.01);
  }

  function _startAmbient(c) {
    const ag = c.createGain(); ag.gain.value = 0.14; ag.connect(_out);

    // Deep drone with slow LFO wobble
    const drone = c.createOscillator(); drone.type = 'sine'; drone.frequency.value = 46;
    const lfo   = c.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG  = c.createGain(); lfoG.gain.value = 10;
    lfo.connect(lfoG); lfoG.connect(drone.frequency);
    const dg = c.createGain(); dg.gain.value = 0.45;
    drone.connect(dg); dg.connect(ag);
    drone.start(); lfo.start();

    // Harmonic hum
    const hum = c.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 93;
    const hg  = c.createGain(); hg.gain.value = 0.18;
    hum.connect(hg); hg.connect(ag); hum.start();

    // Bandpass filtered noise (ocean current)
    const bufLen = c.sampleRate * 4;
    const nb = c.createBuffer(1, bufLen, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    const ns = c.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 155; nf.Q.value = 0.45;
    const ng = c.createGain(); ng.gain.value = 0.3;
    ns.connect(nf); nf.connect(ng); ng.connect(ag); ns.start();
  }

  return {
    // Called once game starts (after user interaction — satisfies autoplay policy)
    startAmbient() {
      _play('ambient', c => _startAmbient(c), 99999);
    },

    // Called every game tick to drive bubble timer
    tick(dt) {
      if (!_ctx) return;
      _bubbleTimer -= dt;
      if (_bubbleTimer <= 0) {
        try { _bubble(_gc()); } catch (_) {}
        _bubbleTimer = 2 + Math.random() * 4;
      }
    },

    // Building panel / expedition panel opened
    uiOpen() {
      _play('uiOpen', c => {
        _tone(c, 500, 'sine', 0.12, 0.15, 840);
        setTimeout(() => { try { _tone(_gc(), 820, 'sine', 0.06, 0.1); } catch(_){} }, 75);
      }, 0.25);
    },

    // Fort or building placed
    place() {
      _play('place', c => {
        _tone(c, 260, 'triangle', 0.13, 0.1, 410);
        setTimeout(() => { try { _tone(_gc(), 520, 'sine', 0.07, 0.12); } catch(_){} }, 60);
      }, 0.35);
    },

    // Wave inbound warning
    waveWarn() {
      _play('waveWarn', c => {
        _tone(c, 108, 'sawtooth', 0.12, 0.65, 64);
        setTimeout(() => { try { _tone(_gc(), 88, 'sawtooth', 0.09, 0.5, 56); } catch(_){} }, 380);
      }, 6);
    },

    // Friendly melee impact
    meleeHit() {
      _play('melee', c => _noise(c, 0.08, 0.18, 310, 2.5), 0.1);
    },

    // Friendly or fort ranged shot fired
    rangedFire() {
      _play('ranged', c => _tone(c, 680, 'sine', 0.06, 0.09, 190), 0.1);
    },

    // Building or fort takes a hit
    structureHit() {
      _play('structHit', c => {
        _noise(c, 0.2, 0.22, 190, 3);
        _tone(c, 72, 'sine', 0.13, 0.22);
      }, 0.18);
    },

    // Enemy fires a ranged shot
    enemyFire() {
      _play('enemyFire', c => _tone(c, 230, 'sawtooth', 0.06, 0.1, 115), 0.12);
    },

    // Enemy melee lands on a unit or building
    enemyMelee() {
      _play('enemyMelee', c => _noise(c, 0.1, 0.16, 400, 1.8), 0.1);
    },
  };
})();
