// engine/audio.js — Процедурный синтезатор звука ДВС, ротора, турбины, блоу-оффа, шин и ударов (Web Audio API)
(function (global) {
  'use strict';

  class DriftAudioEngine {
    constructor() {
      this.ctx = null;
      this.started = false;
      this.muted = false;
      this.isRotary = false;
      this.prevBoost = 0;
      this.bovCooldown = 0;
      this.backfireCooldown = 0;
    }

    init() {
      if (this.started) {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.ctx.destination);

      // Кривая мягкого перегруза (насыщенный рык выхлопа)
      const shaper = this.ctx.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        const x = (i * 2) / 512 - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      shaper.curve = curve;

      // Фильтр выхлопа ДВС
      this.engFilter = this.ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 340;
      this.engFilter.Q.value = 2.4;

      this.engGain = this.ctx.createGain();
      this.engGain.gain.value = 0.001;

      // 3 осциллятора для плотного многослойного звука двигателя
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.oscSub = this.ctx.createOscillator();
      this.oscSub.type = 'square';

      this.osc2Gain = this.ctx.createGain();
      this.osc2Gain.gain.value = 0.55;
      this.oscSubGain = this.ctx.createGain();
      this.oscSubGain.gain.value = 0.25;

      this.osc1.connect(shaper);
      this.osc2.connect(this.osc2Gain);
      this.osc2Gain.connect(shaper);
      this.oscSub.connect(this.oscSubGain);
      this.oscSubGain.connect(shaper);

      shaper.connect(this.engFilter);
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.master);

      this.osc1.start();
      this.osc2.start();
      this.oscSub.start();

      // Свист турбины (Turbo Spool)
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.value = 1800;
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.value = 0.0;
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.master);
      this.turboOsc.start();

      // Генератор шума (для визга резины, гравия, блоу-оффа и отстрелов)
      const bufSize = this.ctx.sampleRate * 2;
      const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuf = noiseBuf;

      // Постоянный канал визга шин
      this.tireNoise = this.ctx.createBufferSource();
      this.tireNoise.buffer = noiseBuf;
      this.tireNoise.loop = true;

      this.tireFilter = this.ctx.createBiquadFilter();
      this.tireFilter.type = 'bandpass';
      this.tireFilter.frequency.value = 1150;
      this.tireFilter.Q.value = 4.5;

      this.tireGain = this.ctx.createGain();
      this.tireGain.gain.value = 0.0;

      this.tireNoise.connect(this.tireFilter);
      this.tireFilter.connect(this.tireGain);
      this.tireGain.connect(this.master);
      this.tireNoise.start();

      this.started = true;
    }

    setMuted(m) {
      this.muted = m;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(m ? 0 : 0.42, this.ctx.currentTime, 0.05);
      }
    }

    setEngineProfile(isRotary) {
      this.isRotary = !!isRotary;
    }

    setDrivingActive(active) {
      if (!this.started || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (!active) {
        this.engGain.gain.setTargetAtTime(0.05, t, 0.08);
        this.tireGain.gain.setTargetAtTime(0.0, t, 0.05);
        this.turboGain.gain.setTargetAtTime(0.0, t, 0.05);
      }
    }

    update(state, dt) {
      if (!this.started || !this.ctx || this.muted) return;
      if (this.ctx.state === 'suspended') return;

      const t = this.ctx.currentTime;
      this.bovCooldown = Math.max(0, this.bovCooldown - dt);
      this.backfireCooldown = Math.max(0, this.backfireCooldown - dt);

      const rpmNorm = Math.max(0, Math.min(1, (state.rpm - 900) / (state.redline - 900)));
      const load = Math.max(0.15, state.throttle);

      if (this.isRotary) {
        // Характерный высокооборотистый жужжащий ротор 13B
        const baseFreq = 65 + rpmNorm * 285;
        this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.025);
        this.osc2.frequency.setTargetAtTime(baseFreq * 1.5, t, 0.025);
        this.oscSub.frequency.setTargetAtTime(baseFreq * 2.01, t, 0.025);
        this.engFilter.frequency.setTargetAtTime(380 + rpmNorm * 1950 + load * 600, t, 0.03);
      } else {
        // Басистый рядный японский турбо-мотор (JZ / SR20)
        const baseFreq = 38 + rpmNorm * 165;
        this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.03);
        this.osc2.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.03);
        this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.03);
        this.engFilter.frequency.setTargetAtTime(220 + rpmNorm * 1250 + load * 480, t, 0.035);
      }

      const targetEngVol = 0.14 + rpmNorm * 0.16 + load * 0.11;
      this.engGain.gain.setTargetAtTime(targetEngVol, t, 0.04);

      // Свист турбины
      const posBoost = Math.max(0, state.boost);
      this.turboOsc.frequency.setTargetAtTime(1600 + posBoost * 2400, t, 0.05);
      this.turboGain.gain.setTargetAtTime(posBoost * 0.035, t, 0.06);

      // Пшик блоу-оффа (BOV) при резком сбросе газа на высоком наддуве
      if (this.prevBoost > 0.65 && state.throttle < 0.12 && this.bovCooldown <= 0) {
        this.triggerBlowOff(this.prevBoost);
        this.bovCooldown = 0.55;
      }
      this.prevBoost = state.boost;

      // Визг резины (асфальт) или шуршание гравия
      const speed = Math.hypot(state.vx, state.vz);
      const slipIntensity = Math.min(1, (Math.abs(state.driftAngleDeg) / 48) * (speed > 4 ? 1 : 0) + state.wheelSpin * 0.45);
      if (state.onGravel && speed > 3) {
        this.tireFilter.frequency.setTargetAtTime(420, t, 0.04);
        this.tireFilter.Q.setTargetAtTime(1.1, t, 0.04);
        this.tireGain.gain.setTargetAtTime(Math.min(0.24, speed * 0.01), t, 0.05);
      } else if (slipIntensity > 0.18 && speed > 4.5) {
        this.tireFilter.frequency.setTargetAtTime(980 + slipIntensity * 480, t, 0.04);
        this.tireFilter.Q.setTargetAtTime(4.8, t, 0.04);
        this.tireGain.gain.setTargetAtTime(Math.min(0.22, (slipIntensity - 0.15) * 0.25), t, 0.04);
      } else {
        this.tireGain.gain.setTargetAtTime(0.0, t, 0.06);
      }
    }

    triggerBlowOff(boostLevel) {
      if (!this.started || !this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      // Японский "ту-ту-ту" флаттер + пшик
      for (let i = 0; i < 3; i++) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'bandpass';
        flt.frequency.setValueAtTime(3200 - i * 450, t + i * 0.065);
        flt.Q.value = 3.2;
        const g = this.ctx.createGain();
        const peak = Math.min(0.22, 0.08 + boostLevel * 0.08) * (1 - i * 0.25);
        g.gain.setValueAtTime(0.001, t + i * 0.065);
        g.gain.linearRampToValueAtTime(peak, t + i * 0.065 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.065 + 0.06);
        src.connect(flt);
        flt.connect(g);
        g.connect(this.master);
        src.start(t + i * 0.065);
        src.stop(t + i * 0.065 + 0.07);
      }
    }

    triggerBackfire() {
      if (!this.started || !this.ctx || this.muted || this.backfireCooldown > 0) return;
      this.backfireCooldown = 0.16;
      const t = this.ctx.currentTime;

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(900, t);
      flt.frequency.exponentialRampToValueAtTime(140, t + 0.14);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      src.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.16);
    }

    triggerImpact(strength = 0.6) {
      if (!this.started || !this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const s = Math.max(0.15, Math.min(1.0, strength));

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(320 + s * 280, t);
      flt.Q.value = 1.6;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.45 * s, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      src.connect(flt);
      flt.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + 0.24);
    }
  }

  global.DriftAudioEngine = DriftAudioEngine;
})(window);
