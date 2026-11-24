// game/main.js — Главный игровой цикл (fixedDeltaTime), машина состояний, камеры, подсчёт очков дрифта, гараж и сохранение
(function () {
  'use strict';

  const { clamp, lerp, damp, dampAngle, Vec3 } = window.Math3D;

  const STORAGE_KEY = 'sakura_night_drift_save_v1';
  const FIXED_DT = 1 / 60;

  // --- Хранилище (Android NativeBridge + localStorage fallback) ---
  function saveStorage(obj) {
    const str = JSON.stringify(obj);
    try {
      if (window.AndroidBridge && window.AndroidBridge.saveData) {
        window.AndroidBridge.saveData(STORAGE_KEY, str);
      }
      localStorage.setItem(STORAGE_KEY, str);
    } catch (e) {
      // Игнорируем ограничения приватного режима
    }
  }

  function loadStorage() {
    let raw = '';
    try {
      if (window.AndroidBridge && window.AndroidBridge.loadData) {
        raw = window.AndroidBridge.loadData(STORAGE_KEY) || '';
      }
      if (!raw) raw = localStorage.getItem(STORAGE_KEY) || '';
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // Игнорируем ошибку парсинга
    }
    return null;
  }

  function vibrate(ms, amp = 140) {
    try {
      if (window.AndroidBridge && window.AndroidBridge.vibrate) {
        window.AndroidBridge.vibrate(ms, amp);
      } else if (navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch (e) {
      // Безопасный пропуск
    }
  }

  // --- Основной контроллер игры ---
  class SakuraDriftGame {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.renderer = new window.Renderer3D(this.canvas);
      this.textures = window.TextureGen.createTextureLibrary(this.renderer);
      this.audio = new window.DriftAudioEngine();
      this.particles = new window.ParticleManager(this.renderer, this.textures);

      // Загружаем сохранённый прогресс и настройки
      const saved = loadStorage() || {};
      this.settings = Object.assign({
        steerMode: 'buttons', // 'buttons' | 'slider'
        assist: 0.45,
        quality: 'med',
        muted: false
      }, saved.settings || {});

      this.bestScore = saved.bestScore || 0;
      this.savedTunings = saved.tunings || {};
      this.selectedCarId = saved.selectedCarId || 'mark2_90';
      this.selectedTrackId = saved.selectedTrackId || 'hakone';
      this.activeCategory = 'НЕКРУХИ';

      // Машина состояний: 'GARAGE' | 'DRIVING' | 'PAUSED' | 'SUMMARY'
      this.state = 'GARAGE';

      // Камера заезда: 0 = 3-е лицо (Chase), 1 = Близкий дрифт (Low Chase), 2 = Капот (Hood)
      this.camMode = 0;
      this.camNames = ['Камера: 3-е лицо', 'Камера: Дрифт-низ', 'Камера: Капот'];
      this.camPos = Vec3.create(0, 3, -8);
      this.camTarget = Vec3.create(0, 1, 0);
      this.camYawSmooth = 0;
      this.camFovSmooth = 62;
      this.camShake = 0;

      // Орбитальная камера гаража
      this.orbitYaw = 0.65;
      this.orbitPitch = 0.24;
      this.orbitDist = 6.2;
      this.orbitDragging = false;
      this.orbitLastX = 0;
      this.orbitLastY = 0;

      // Состояние ввода
      this.input = {
        left: false,
        right: false,
        sliderSteer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        clutchKick: false,
        steer: 0
      };
      this.keys = {};

      // Счётчик дрифта (CarX стиль)
      this.resetScoring();

      // Инициализация трассы, машины и физики
      this.renderer.setQuality(this.settings.quality);
      this.audio.setMuted(this.settings.muted);
      this.loadTrack(this.selectedTrackId);
      this.selectCar(this.selectedCarId);

      this._bindUI();
      this._bindControls();
      this._bindLifecycle();
      this._renderGarageLists();
      this._syncSettingsUI();
      this._showState('GARAGE');

      this.lastTime = performance.now();
      this.accumulator = 0;
      requestAnimationFrame((t) => this._loop(t));
    }

    persist() {
      saveStorage({
        bestScore: this.bestScore,
        selectedCarId: this.selectedCarId,
        selectedTrackId: this.selectedTrackId,
        settings: this.settings,
        tunings: this.savedTunings
      });
    }

    getTuningFor(carId) {
      const spec = window.CAR_CATALOG.find((c) => c.id === carId) || window.CAR_CATALOG[0];
      if (!this.savedTunings[carId]) {
        this.savedTunings[carId] = Object.assign({}, spec.defaultTuning);
      }
      return this.savedTunings[carId];
    }

    loadTrack(trackId) {
      this.selectedTrackId = trackId;
      this.track = new window.NightJapanTrack(this.renderer, this.textures, trackId);
      this.renderer.fogColor = this.track.def.fogColor;
      this.renderer.fogDensity = this.track.def.fogDensity;
      this.particles.clearTrackMarks();
      if (this.physics) {
        const st = this.track.getStartTransform();
        this.physics.reset(st.x, st.y, st.z, st.yaw);
        this.camYawSmooth = st.yaw;
      }
      this.persist();
    }

    selectCar(carId) {
      const spec = window.CAR_CATALOG.find((c) => c.id === carId) || window.CAR_CATALOG[0];
      this.selectedCarId = spec.id;
      this.activeCategory = spec.category;
      this.carSpec = spec;
      this.tuning = this.getTuningFor(spec.id);
      this.carModel = new window.CarModel3D(this.renderer, this.textures, spec);
      this.audio.setEngineProfile(spec.isRotary);

      const st = this.track.getStartTransform();
      if (!this.physics) {
        this.physics = new window.DriftCarPhysics(spec, this.tuning);
      } else {
        this.physics.setCar(spec, this.tuning);
      }
      this.physics.reset(st.x, st.y, st.z, st.yaw);
      this.camYawSmooth = st.yaw;

      this._syncTuningUI();
      this.persist();
    }

    resetScoring() {
      this.totalScore = 0;
      this.livePoints = 0;
      this.combo = 1;
      this.comboProgress = 0;
      this.driftGraceTimer = 0;
      this.prevDriftSign = 0;
      this.wallTapCooldown = 0;
      this.bannerTimer = 0;

      // Статистика заезда для экрана итогов
      this.runStats = {
        bestCombo: 0,
        maxAngle: 0,
        wallTaps: 0,
        clipZones: 0
      };
    }

    showBanner(text, color = '#ff2a85') {
      const el = document.getElementById('hudBanner');
      el.textContent = text;
      el.style.color = color;
      this.bannerTimer = 1.65;
    }

    _showState(newState) {
      this.state = newState;
      const g = document.getElementById('garageOverlay');
      const h = document.getElementById('hudOverlay');
      const p = document.getElementById('pauseModal');
      const s = document.getElementById('summaryModal');

      g.classList.toggle('hidden', newState !== 'GARAGE');
      h.classList.toggle('hidden', newState !== 'DRIVING' && newState !== 'PAUSED');
      p.classList.toggle('hidden', newState !== 'PAUSED');
      s.classList.toggle('hidden', newState !== 'SUMMARY');

      if (newState === 'GARAGE') {
        const st = this.track.getStartTransform();
        this.physics.reset(st.x, st.y, st.z, st.yaw);
        this.particles.clearTrackMarks();
        this.audio.setDrivingActive(false);
        document.getElementById('garageBestScore').textContent = Math.floor(this.bestScore).toLocaleString('ru-RU');
      } else if (newState === 'DRIVING') {
        this.audio.init();
      } else if (newState === 'PAUSED' || newState === 'SUMMARY') {
        this.audio.setDrivingActive(false);
      }

      if (newState === 'SUMMARY') {
        this._bankLivePoints();
        document.getElementById('sumScore').textContent = Math.floor(this.totalScore).toLocaleString('ru-RU');
        document.getElementById('sumBest').textContent = Math.floor(this.bestScore).toLocaleString('ru-RU');
        document.getElementById('sumBestCombo').textContent = Math.floor(this.runStats.bestCombo).toLocaleString('ru-RU');
        document.getElementById('sumMaxAngle').textContent = Math.round(this.runStats.maxAngle) + '°';
        document.getElementById('sumWallTaps').textContent = String(this.runStats.wallTaps);
        document.getElementById('sumClips').textContent = String(this.runStats.clipZones);
      }
    }

    startNewRun() {
      this.audio.init();
      this.resetScoring();
      this.particles.clearTrackMarks();
      const st = this.track.getStartTransform();
      this.physics.reset(st.x, st.y, st.z, st.yaw);
      this.camYawSmooth = st.yaw;
      this._showState('DRIVING');
    }

    _bankLivePoints() {
      if (this.livePoints > 25) {
        const earned = Math.floor(this.livePoints * this.combo);
        this.totalScore += earned;
        if (earned > this.runStats.bestCombo) this.runStats.bestCombo = earned;
        if (this.totalScore > this.bestScore) {
          this.bestScore = this.totalScore;
          this.persist();
        }
      }
      this.livePoints = 0;
      this.combo = 1;
      this.comboProgress = 0;
    }

    _updateScoring(dt) {
      const ph = this.physics;
      const absAng = Math.abs(ph.driftAngleDeg);
      const isDrifting = absAng >= 12 && absAng <= 78 && ph.speedKmh >= 25;

      this.wallTapCooldown = Math.max(0, this.wallTapCooldown - dt);
      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById('hudBanner').textContent = '';
      }

      if (isDrifting) {
        if (absAng > this.runStats.maxAngle) this.runStats.maxAngle = absAng;

        // Начисление очков зависит от угла и скорости
        const rate = (absAng * 1.45 + ph.speedKmh * 0.55) * 1.35;
        this.livePoints += rate * dt;
        this.driftGraceTimer = 1.35;

        // Прогресс множителя комбо x1 -> x5
        this.comboProgress += dt * (0.24 + absAng * 0.004);
        if (this.comboProgress >= 1.0) {
          if (this.combo < 5) {
            this.combo++;
            this.comboProgress = 0;
            this.showBanner(`КОМБО x${this.combo}!`, '#00f0ff');
          } else {
            this.comboProgress = 1.0;
          }
        }

        // Детектор перекладки (смена знака угла заноса)
        const sign = Math.sign(ph.driftAngleDeg);
        if (this.prevDriftSign !== 0 && sign !== 0 && sign !== this.prevDriftSign && this.livePoints > 120) {
          this.livePoints += 250;
          this.comboProgress = Math.min(1, this.comboProgress + 0.35);
          this.showBanner('ПЕРЕКЛАДКА +250', '#ffdf40');
        }
        this.prevDriftSign = sign;
      } else {
        if (this.livePoints > 0) {
          this.driftGraceTimer -= dt;
          if (this.driftGraceTimer <= 0) {
            this._bankLivePoints();
            this.prevDriftSign = 0;
          }
        }
      }

      // Бонус Wall Tap (+500)
      if (ph.events.wallTap && this.wallTapCooldown <= 0) {
        this.livePoints += 500;
        this.runStats.wallTaps++;
        this.wallTapCooldown = 2.4;
        this.showBanner('WALL TAP +500!', '#ff77b7');
        vibrate(35, 110);
      }

      // Клиппинг-зона (+800)
      if (this.track.updateClippingZones(dt, ph.x, ph.z, isDrifting)) {
        this.livePoints += 800;
        this.combo = Math.min(5, this.combo + 1);
        this.runStats.clipZones++;
        this.showBanner('КЛИППИНГ-ЗОНА +800!', '#00f0ff');
        vibrate(45, 150);
      }

      // Столкновение со стеной: сгорание текущей связки
      if (ph.events.crash) {
        if (this.livePoints > 40) {
          this.livePoints = 0;
          this.combo = 1;
          this.comboProgress = 0;
          this.showBanner('CRASH! СВЯЗКА СГОРЕЛА', '#ff3344');
        }
        this.camShake = Math.max(this.camShake, 0.45);
        vibrate(140, 230);
      }
    }

    _updateCamera(dt) {
      const ph = this.physics;
      if (this.state === 'GARAGE') {
        if (!this.orbitDragging) {
          this.orbitYaw += dt * 0.28;
        }
        const cx = ph.x + Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
        const cy = ph.y + 0.85 + Math.sin(this.orbitPitch) * this.orbitDist;
        const cz = ph.z + Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
        Vec3.set(this.camPos, cx, cy, cz);
        Vec3.set(this.camTarget, ph.x, ph.y + 0.72, ph.z);
        this.renderer.setCamera(this.camPos, this.camTarget, 50);
        return;
      }

      // Тряска камеры от гравия или удара
      this.camShake = Math.max(0, this.camShake - dt * 1.8);
      const gravelShake = ph.onGravel && ph.speedKmh > 18 ? 0.06 : 0;
      const shakeAmp = this.camShake * 0.35 + gravelShake;
      const sx = (Math.random() - 0.5) * shakeAmp;
      const sy = (Math.random() - 0.5) * shakeAmp;

      // Динамический FOV от скорости
      const speedNorm = clamp(ph.speedKmh / 210, 0, 1);
      const targetFov = (this.camMode === 2 ? 72 : 60) + speedNorm * 16;
      this.camFovSmooth = damp(this.camFovSmooth, targetFov, 5.5, dt);

      if (this.camMode === 2) {
        // Камера 3 — Вид с капота (Hood Cam)
        const sY = Math.sin(ph.yaw), cY = Math.cos(ph.yaw);
        Vec3.set(this.camPos, ph.x + sY * 0.45 + sx, ph.y + 1.18 + sy, ph.z + cY * 0.45);
        Vec3.set(this.camTarget, ph.x + sY * 14, ph.y + 0.95 - ph.pitch * 4, ph.z + cY * 14);
        this.renderer.setCamera(this.camPos, this.camTarget, this.camFovSmooth);
        return;
      }

      // Камеры 1 и 2 — Динамическая Chase Cam с пружинным запаздыванием по курсу движения
      const moveYaw = ph.speedKmh > 12 ? Math.atan2(ph.vx, ph.vz) : ph.yaw;
      const desiredYaw = dampAngle(ph.yaw, moveYaw, 3.2, 0.25);
      this.camYawSmooth = dampAngle(this.camYawSmooth, desiredYaw, 5.2, dt);

      const dist = this.camMode === 1 ? 4.9 : 6.5;
      const height = this.camMode === 1 ? 1.55 : 2.35;
      const lookAhead = this.camMode === 1 ? 5.5 : 7.5;

      const sC = Math.sin(this.camYawSmooth);
      const cC = Math.cos(this.camYawSmooth);

      const targetEyeX = ph.x - sC * dist + sx;
      const targetEyeY = ph.y + height + sy;
      const targetEyeZ = ph.z - cC * dist;

      this.camPos[0] = damp(this.camPos[0], targetEyeX, 11, dt);
      this.camPos[1] = damp(this.camPos[1], targetEyeY, 10, dt);
      this.camPos[2] = damp(this.camPos[2], targetEyeZ, 11, dt);

      Vec3.set(
        this.camTarget,
        ph.x + Math.sin(ph.yaw) * lookAhead,
        ph.y + 0.95,
        ph.z + Math.cos(ph.yaw) * lookAhead
      );
      this.renderer.setCamera(this.camPos, this.camTarget, this.camFovSmooth);
    }

    _updateHUD() {
      const ph = this.physics;
      document.getElementById('hudSpeed').textContent = Math.round(ph.speedKmh);
      document.getElementById('hudGear').textContent = ph.gear === -1 ? 'R' : (ph.gear === 0 ? 'N' : String(ph.gear));

      const rpmPct = clamp((ph.rpm - 800) / (this.carSpec.phys.redline - 800), 0, 1) * 100;
      document.getElementById('hudRpmBar').style.width = rpmPct.toFixed(1) + '%';

      const boostPct = clamp((ph.boost + 0.8) / 2.6, 0, 1) * 100;
      document.getElementById('hudBoostBar').style.width = boostPct.toFixed(1) + '%';
      document.getElementById('hudBoostVal').textContent = (ph.boost >= 0 ? '+' : '') + ph.boost.toFixed(1);

      document.getElementById('hudTotalScore').textContent = Math.floor(this.totalScore).toLocaleString('ru-RU');
      document.getElementById('hudBestScore').textContent = Math.floor(this.bestScore).toLocaleString('ru-RU');
      document.getElementById('hudLivePoints').textContent = Math.floor(this.livePoints).toLocaleString('ru-RU');
      document.getElementById('hudCombo').textContent = 'x' + this.combo;
      document.getElementById('hudComboBar').style.width = (this.comboProgress * 100).toFixed(1) + '%';
      document.getElementById('hudAngle').textContent = Math.round(Math.abs(ph.driftAngleDeg)) + '°';

      const box = document.getElementById('driftCounterBox');
      box.classList.toggle('active', this.livePoints > 5);

      // Индикатор угла выворота руля
      const steerNorm = clamp(ph.steerAngle / ((this.tuning.steerAngleDeg || 54) * Math.PI / 180), -1, 1);
      document.getElementById('steerIndicatorThumb').style.left = (50 + steerNorm * 45) + '%';
    }

    _gatherInput() {
      // Объединяем сенсорный ввод и клавиатуру
      let steer = 0;
      if (this.settings.steerMode === 'slider') {
        steer = this.input.sliderSteer;
      } else {
        if (this.input.left) steer -= 1;
        if (this.input.right) steer += 1;
      }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer = -1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) steer = 1;

      const throttle = (this.input.throttle || this.keys['KeyW'] || this.keys['ArrowUp']) ? 1 : 0;
      const brake = (this.input.brake || this.keys['KeyS'] || this.keys['ArrowDown']) ? 1 : 0;
      const handbrake = !!(this.input.handbrake || this.keys['Space']);
      const clutchKick = !!(this.input.clutchKick || this.keys['ShiftLeft'] || this.keys['ShiftRight']);
      this.input.clutchKick = false;

      return { steer, throttle, brake, handbrake, clutchKick };
    }

    _loop(now) {
      const dt = Math.min((now - this.lastTime) * 0.001, 0.05);
      this.lastTime = now;

      if (this.state === 'DRIVING') {
        this.accumulator += dt;
        const inp = this._gatherInput();
        while (this.accumulator >= FIXED_DT) {
          this.physics.step(FIXED_DT, inp, this.track, this.settings.assist);
          this._updateScoring(FIXED_DT);

          // Звуковые и визуальные события
          if (this.physics.events.backfire) {
            this.audio.triggerBackfire();
            const anc = this.carModel.getWorldAnchors(this.physics, this.tuning);
            this.particles.emitExhaustFlame(anc.exhausts, this.physics.yaw, this.carSpec.flameColor);
          }
          if (this.physics.events.impactStrength > 0) {
            this.audio.triggerImpact(this.physics.events.impactStrength);
            if (this.physics.events.sparkPos) {
              this.particles.emitSparks(this.physics.events.sparkPos, 14);
            }
          }
          this.accumulator -= FIXED_DT;
        }
        this.audio.update(this.physics, dt);
        this._updateHUD();
      }

      const anchors = this.carModel.getWorldAnchors(this.physics, this.tuning);
      if (this.state !== 'PAUSED') {
        this.particles.update(dt, this.physics, anchors, this.state === 'GARAGE');
      }

      this._updateCamera(dt);

      // Динамическое освещение (фары + ближайшие фонари/неон + подсветка днища + стоп-сигналы)
      this.renderer.setHeadlights(anchors.hlL, anchors.hlR, anchors.dir, this.carSpec.headlightColor, true);
      const lights = this.track.getNearestLights(this.physics.x, this.physics.z, 4);
      if (this.carSpec.underglow) {
        const ug = this.carSpec.underglow;
        lights.push({
          x: this.physics.x,
          y: this.physics.y + 0.35,
          z: this.physics.z,
          r: ug[0] * 1.15,
          g: ug[1] * 1.15,
          b: ug[2] * 1.15,
          range: 7.5
        });
      }
      if (this.physics.braking) {
        lights.push({
          x: this.physics.x - Math.sin(this.physics.yaw) * 2.4,
          y: this.physics.y + 0.7,
          z: this.physics.z - Math.cos(this.physics.yaw) * 2.4,
          r: 1.4,
          g: 0.1,
          b: 0.12,
          range: 9.0
        });
      }
      this.renderer.setPointLights(lights);

      // Отрисовка 3D сцены
      this.renderer.beginFrame();
      this.track.render();
      this.carModel.render(this.physics, this.tuning, this.state === 'DRIVING' && this.camMode === 2);
      this.particles.render();

      requestAnimationFrame((t) => this._loop(t));
    }

    // ==================== ИНТЕРФЕЙС ГАРАЖА И НАСТРОЕК ====================
    _renderGarageLists() {
      const carList = document.getElementById('carList');
      carList.innerHTML = '';
      const filtered = window.CAR_CATALOG.filter((c) => c.category === this.activeCategory);
      for (const c of filtered) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'car-item' + (c.id === this.selectedCarId ? ' active' : '');
        btn.innerHTML = `<div class="item-title">${c.name}</div><div class="item-sub">${c.powerHp} л.с. • ${c.subtitle}</div>`;
        btn.onclick = () => {
          this.selectCar(c.id);
          this._renderGarageLists();
        };
        carList.appendChild(btn);
      }

      document.getElementById('tabBeaters').classList.toggle('active', this.activeCategory === 'НЕКРУХИ');
      document.getElementById('tabWidebody').classList.toggle('active', this.activeCategory === 'ВЗОРВАННЫЕ МАРКИ');

      const trackList = document.getElementById('trackList');
      trackList.innerHTML = '';
      for (const t of window.TRACK_DEFS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-item' + (t.id === this.selectedTrackId ? ' active' : '');
        btn.innerHTML = `<div class="item-title">${t.name}</div><div class="item-sub">${t.subtitle}</div>`;
        btn.onclick = () => {
          this.loadTrack(t.id);
          this._renderGarageLists();
        };
        trackList.appendChild(btn);
      }

      document.getElementById('selCarName').textContent = this.carSpec.name;
      const stageLabel = this.tuning.stage === 3 ? 'Stage 3 «Взорванный»' : `Stage ${this.tuning.stage}`;
      document.getElementById('selCarSub').textContent = `${this.carSpec.subtitle} • ${stageLabel}`;
    }

    _syncTuningUI() {
      const t = this.tuning;
      document.getElementById('tuneSteer').value = t.steerAngleDeg;
      document.getElementById('valSteer').textContent = t.steerAngleDeg + '°';

      document.getElementById('tuneCamberF').value = t.camberFront;
      document.getElementById('valCamberF').textContent = t.camberFront.toFixed(1) + '°';

      document.getElementById('tuneCamberR').value = t.camberRear;
      document.getElementById('valCamberR').textContent = t.camberRear.toFixed(1) + '°';

      const offCm = Math.round(t.wheelOffset * 100);
      document.getElementById('tuneOffset').value = offCm;
      document.getElementById('valOffset').textContent = '+' + offCm + ' см';

      const hCm = Math.round(t.rideHeight * 100);
      document.getElementById('tuneHeight').value = hCm;
      document.getElementById('valHeight').textContent = (hCm >= 0 ? '+' : '') + hCm + ' см';

      document.getElementById('tunePressure').value = t.rearPressure;
      document.getElementById('valPressure').textContent = t.rearPressure.toFixed(1) + ' бар';

      document.getElementById('tuneFinal').value = t.finalDrive;
      document.getElementById('valFinal').textContent = t.finalDrive.toFixed(1);

      document.querySelectorAll('.stage-btn').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.stage) === t.stage);
      });
    }

    _syncSettingsUI() {
      const isSlider = this.settings.steerMode === 'slider';
      document.getElementById('steerButtonsWrap').classList.toggle('hidden', isSlider);
      document.getElementById('steerSliderWrap').classList.toggle('hidden', !isSlider);
      document.getElementById('optSteerBtns').classList.toggle('active', !isSlider);
      document.getElementById('optSteerSlider').classList.toggle('active', isSlider);

      const aPct = Math.round(this.settings.assist * 100);
      document.getElementById('optAssist').value = aPct;
      document.getElementById('valAssist').textContent = aPct + '%';

      document.querySelectorAll('[data-q]').forEach((b) => {
        b.classList.toggle('active', b.dataset.q === this.settings.quality);
      });

      const muteBtn = document.getElementById('optMuteBtn');
      muteBtn.textContent = this.settings.muted ? 'Выключен' : 'Включён';
      muteBtn.classList.toggle('active', !this.settings.muted);
    }

    _bindUI() {
      document.getElementById('tabBeaters').onclick = () => {
        this.activeCategory = 'НЕКРУХИ';
        this._renderGarageLists();
      };
      document.getElementById('tabWidebody').onclick = () => {
        this.activeCategory = 'ВЗОРВАННЫЕ МАРКИ';
        this._renderGarageLists();
      };

      document.getElementById('btnZoomIn').onclick = () => {
        this.orbitDist = clamp(this.orbitDist - 0.8, 3.6, 9.0);
      };
      document.getElementById('btnZoomOut').onclick = () => {
        this.orbitDist = clamp(this.orbitDist + 0.8, 3.6, 9.0);
      };

      // Слайдеры тюнинга с мгновенным обновлением 3D-модели
      const bindSlider = (id, fn) => {
        document.getElementById(id).addEventListener('input', (e) => {
          fn(parseFloat(e.target.value));
          this.physics.updateTuning(this.tuning);
          this._syncTuningUI();
          this.persist();
        });
      };

      bindSlider('tuneSteer', (v) => { this.tuning.steerAngleDeg = v; });
      bindSlider('tuneCamberF', (v) => { this.tuning.camberFront = v; });
      bindSlider('tuneCamberR', (v) => { this.tuning.camberRear = v; });
      bindSlider('tuneOffset', (v) => { this.tuning.wheelOffset = v / 100; });
      bindSlider('tuneHeight', (v) => { this.tuning.rideHeight = v / 100; });
      bindSlider('tunePressure', (v) => { this.tuning.rearPressure = v; });
      bindSlider('tuneFinal', (v) => { this.tuning.finalDrive = v; });

      document.querySelectorAll('.stage-btn').forEach((btn) => {
        btn.onclick = () => {
          this.tuning.stage = Number(btn.dataset.stage);
          this.physics.updateTuning(this.tuning);
          this._syncTuningUI();
          this._renderGarageLists();
          this.persist();
        };
      });

      document.getElementById('btnResetTune').onclick = () => {
        this.savedTunings[this.selectedCarId] = Object.assign({}, this.carSpec.defaultTuning);
        this.tuning = this.savedTunings[this.selectedCarId];
        this.physics.updateTuning(this.tuning);
        this._syncTuningUI();
        this._renderGarageLists();
        this.persist();
      };

      document.getElementById('btnStartRace').onclick = () => this.startNewRun();
      document.getElementById('btnHudGarage').onclick = () => this._showState('GARAGE');
      document.getElementById('btnHudPause').onclick = () => this._showState('PAUSED');
      document.getElementById('btnHudTrack').onclick = () => {
        const nextId = this.selectedTrackId === 'hakone' ? 'shibuya' : 'hakone';
        this.loadTrack(nextId);
        this.startNewRun();
        this.showBanner(this.track.def.name, '#00f0ff');
      };

      document.getElementById('btnHudCam').onclick = () => {
        this.camMode = (this.camMode + 1) % 3;
        document.getElementById('btnHudCam').textContent = this.camNames[this.camMode];
      };

      // Настройки паузы
      document.getElementById('optSteerBtns').onclick = () => {
        this.settings.steerMode = 'buttons';
        this._syncSettingsUI();
        this.persist();
      };
      document.getElementById('optSteerSlider').onclick = () => {
        this.settings.steerMode = 'slider';
        this._syncSettingsUI();
        this.persist();
      };
      document.getElementById('optAssist').addEventListener('input', (e) => {
        this.settings.assist = parseFloat(e.target.value) / 100;
        this._syncSettingsUI();
        this.persist();
      });
      document.querySelectorAll('[data-q]').forEach((btn) => {
        btn.onclick = () => {
          this.settings.quality = btn.dataset.q;
          this.renderer.setQuality(this.settings.quality);
          this._syncSettingsUI();
          this.persist();
        };
      });
      document.getElementById('optMuteBtn').onclick = () => {
        this.settings.muted = !this.settings.muted;
        this.audio.setMuted(this.settings.muted);
        this._syncSettingsUI();
        this.persist();
      };

      document.getElementById('btnResume').onclick = () => this._showState('DRIVING');
      document.getElementById('btnRestart').onclick = () => this.startNewRun();
      document.getElementById('btnFinishRun').onclick = () => this._showState('SUMMARY');
      document.getElementById('btnPauseGarage').onclick = () => this._showState('GARAGE');
      document.getElementById('btnSummaryAgain').onclick = () => this.startNewRun();
      document.getElementById('btnSummaryGarage').onclick = () => this._showState('GARAGE');
    }

    _bindControls() {
      // Мультитач-привязка для кнопок
      const bindHold = (id, onChange) => {
        const el = document.getElementById(id);
        const set = (pressed) => {
          el.classList.toggle('pressed', pressed);
          onChange(pressed);
          if (pressed) this.audio.init();
        };
        el.addEventListener('touchstart', (e) => { e.preventDefault(); set(true); }, { passive: false }); el.addEventListener('mousedown', (e) => { e.preventDefault(); set(true); });
        el.addEventListener('touchend', (e) => { e.preventDefault(); set(false); }, { passive: false }); window.addEventListener('mouseup', () => set(false));
        el.addEventListener('touchcancel', () => set(false), { passive: false });
      };

      bindHold('btnLeft', (p) => { this.input.left = p; });
      bindHold('btnRight', (p) => { this.input.right = p; });
      bindHold('btnGas', (p) => { this.input.throttle = p ? 1 : 0; });
      bindHold('btnBrake', (p) => { this.input.brake = p ? 1 : 0; });
      bindHold('btnHandbrake', (p) => { this.input.handbrake = p; });
      bindHold('btnClutch', (p) => { if (p) this.input.clutchKick = true; });

      // Горизонтальный сенсорный слайдер руля
      const zone = document.getElementById('steerSliderZone');
      const knob = document.getElementById('steerSliderKnob');
      let sliderPtr = null;
      const updateSlider = (clientX) => {
        const rect = zone.getBoundingClientRect();
        const norm = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
        this.input.sliderSteer = norm;
        knob.style.left = (50 + norm * 38) + '%';
      };
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sliderPtr = e.pointerId;
        
        this.audio.init();
        updateSlider(e.clientX);
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId === sliderPtr) updateSlider(e.clientX);
      });
      const resetSlider = (e) => {
        if (e.pointerId === sliderPtr) {
          sliderPtr = null;
          this.input.sliderSteer = 0;
          knob.style.left = '50%';
        }
      };
      zone.addEventListener('pointerup', resetSlider);
      zone.addEventListener('pointercancel', resetSlider);

      // Орбитальное вращение 3D-машины пальцем в гараже
      this.canvas.addEventListener('pointerdown', (e) => {
        if (this.state !== 'GARAGE') return;
        this.orbitDragging = true;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
      });
      window.addEventListener('pointermove', (e) => {
        if (!this.orbitDragging || this.state !== 'GARAGE') return;
        const dx = e.clientX - this.orbitLastX;
        const dy = e.clientY - this.orbitLastY;
        this.orbitLastX = e.clientX;
        this.orbitLastY = e.clientY;
        this.orbitYaw -= dx * 0.008;
        this.orbitPitch = clamp(this.orbitPitch + dy * 0.006, 0.08, 0.85);
      });
      window.addEventListener('pointerup', () => { this.orbitDragging = false; });

      // Клавиатура (для тестов на ПК или Bluetooth-клавиатуры)
      window.addEventListener('keydown', (e) => {
        this.keys[e.code] = true;
        if (e.code === 'KeyC' && this.state === 'DRIVING') {
          document.getElementById('btnHudCam').click();
        } else if (e.code === 'Escape') {
          if (this.state === 'DRIVING') this._showState('PAUSED');
          else if (this.state === 'PAUSED') this._showState('DRIVING');
        }
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    _bindLifecycle() {
      window.addEventListener('resize', () => this.renderer.resize());

      window.onAndroidPause = () => {
        if (this.state === 'DRIVING') this._showState('PAUSED');
        this.audio.setDrivingActive(false);
      };
      window.onAndroidResume = () => {
        this.renderer.resize();
      };
      window.onAndroidBack = () => {
        if (this.state === 'DRIVING') this._showState('PAUSED');
        else if (this.state === 'PAUSED') this._showState('DRIVING');
        else if (this.state === 'SUMMARY') this._showState('GARAGE');
        else if (window.AndroidBridge && window.AndroidBridge.exitApp) {
          window.AndroidBridge.exitApp();
        }
      };
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.game = new SakuraDriftGame();
  });
})();
