// game/cars.js — Каталог 6 автомобилей («Некрухи» и «Взорванные марки») и 3D-конструктор кузовов и колёс
(function (global) {
  'use strict';

  const { Mat4, DEG2RAD } = global.Math3D;
  const G = global.Geometry;

  const CAR_CATALOG = [
    // ================= КАТЕГОРИЯ А: НЕКРУХИ =================
    {
      id: 'mark2_90',
      category: 'НЕКРУХИ',
      name: 'Марк II 90 — Боевой Дед',
      subtitle: 'JZX90 • 1JZ-GTE • Заваренный дифф',
      powerHp: 310,
      isRotary: false,
      style: 'beater_sedan',
      bodyColor: [0.80, 0.81, 0.78, 1],
      mismatchedFender: [0.44, 0.31, 0.25, 1], // грунтованное/ржавое левое крыло
      rimColor: [0.62, 0.64, 0.68, 1],
      caliperColor: [0.35, 0.35, 0.38, 1],
      headlightColor: [1.0, 0.94, 0.76],
      underglow: null,
      flameColor: [1.0, 0.52, 0.12],
      liveryTex: 'rust_missile',
      widebody: false,
      popups: false,
      missingFrontBumper: false,
      crookedRearBumper: true,
      singleCrookedExhaust: true,
      rollCage: false,
      spoiler: 'none',
      dims: { w: 1.82, l: 4.72, wheelbase: 2.74, track: 1.62 },
      phys: {
        mass: 1420,
        wheelbase: 2.74,
        weightBiasFront: 0.53,
        cgHeight: 0.54,
        engineForce: 10800,
        brakeForce: 14200,
        gripFront: 1.24,
        gripRear: 1.04,
        maxSpeedKmh: 235,
        redline: 7800,
        maxBoost: 1.15,
        softSuspension: true
      },
      defaultTuning: {
        steerAngleDeg: 48,
        camberFront: -2.5,
        camberRear: -1.0,
        wheelOffset: 0.02,
        rideHeight: -0.02,
        rearPressure: 2.5,
        stage: 1,
        finalDrive: 4.1
      }
    },
    {
      id: 'silvia_s13',
      category: 'НЕКРУХИ',
      name: 'Слива S13 — Ржавая Миссл',
      subtitle: 'S13 Drift Missile • SR20DET • Без бампера',
      powerHp: 345,
      isRotary: false,
      style: 'missile_coupe',
      bodyColor: [0.64, 0.68, 0.73, 1],
      mismatchedFender: [0.36, 0.38, 0.42, 1],
      rimColor: [0.85, 0.85, 0.88, 1],
      rearRimColor: [0.22, 0.22, 0.25, 1], // разнопарные диски спереди и сзади
      caliperColor: [0.75, 0.2, 0.2, 1],
      headlightColor: [0.95, 0.92, 0.82],
      underglow: null,
      flameColor: [1.0, 0.48, 0.1],
      liveryTex: 'rust_missile',
      widebody: false,
      popups: true, // одна фара приоткрыта ("подмигивает")
      missingFrontBumper: true,
      crookedRearBumper: false,
      singleCrookedExhaust: true,
      rollCage: true,
      spoiler: 'ducktail',
      dims: { w: 1.76, l: 4.46, wheelbase: 2.52, track: 1.58 },
      phys: {
        mass: 1210,
        wheelbase: 2.52,
        weightBiasFront: 0.54,
        cgHeight: 0.48,
        engineForce: 10900,
        brakeForce: 14800,
        gripFront: 1.32,
        gripRear: 1.08,
        maxSpeedKmh: 242,
        redline: 8100,
        maxBoost: 1.30,
        softSuspension: false
      },
      defaultTuning: {
        steerAngleDeg: 55,
        camberFront: -4.5,
        camberRear: -1.5,
        wheelOffset: 0.04,
        rideHeight: -0.06,
        rearPressure: 2.4,
        stage: 1,
        finalDrive: 4.3
      }
    },
    {
      id: 'chaser_100',
      category: 'НЕКРУХИ',
      name: 'Чайзер 100 — Ночной Бродяга',
      subtitle: 'JZX100 Tourer V • Матовый капот • Прямоток',
      powerHp: 420,
      isRotary: false,
      style: 'street_sedan',
      bodyColor: [0.12, 0.26, 0.20, 1],
      hoodColor: [0.13, 0.14, 0.16, 1],
      rimColor: [0.80, 0.66, 0.36, 1],
      caliperColor: [0.9, 0.18, 0.18, 1],
      headlightColor: [0.92, 0.96, 1.0],
      underglow: null,
      flameColor: [1.0, 0.55, 0.12],
      liveryTex: null,
      widebody: false,
      popups: false,
      missingFrontBumper: false,
      crookedRearBumper: false,
      singleCrookedExhaust: true,
      rollCage: true,
      spoiler: 'lip',
      dims: { w: 1.84, l: 4.74, wheelbase: 2.75, track: 1.66 },
      phys: {
        mass: 1450,
        wheelbase: 2.75,
        weightBiasFront: 0.53,
        cgHeight: 0.50,
        engineForce: 12800,
        brakeForce: 15500,
        gripFront: 1.30,
        gripRear: 1.12,
        maxSpeedKmh: 256,
        redline: 8200,
        maxBoost: 1.45,
        softSuspension: false
      },
      defaultTuning: {
        steerAngleDeg: 54,
        camberFront: -4.0,
        camberRear: -2.0,
        wheelOffset: 0.05,
        rideHeight: -0.07,
        rearPressure: 2.2,
        stage: 2,
        finalDrive: 4.0
      }
    },

    // ================= КАТЕГОРИЯ Б: ВЗОРВАННЫЕ МАРКИ =================
    {
      id: 'mark2_wide',
      category: 'ВЗОРВАННЫЕ МАРКИ',
      name: 'Mark II JZX100 — Взорванный',
      subtitle: 'Widebody 860 л.с. • GT-Крыло • Неон',
      powerHp: 860,
      isRotary: false,
      style: 'widebody_sedan',
      bodyColor: [0.95, 0.97, 1.0, 1],
      rimColor: [0.95, 0.25, 0.62, 1],
      caliperColor: [0.0, 0.95, 1.0, 1],
      headlightColor: [0.85, 0.95, 1.0],
      underglow: [1.0, 0.16, 0.55],
      flameColor: [1.0, 0.58, 0.16],
      liveryTex: 'livery_street',
      widebody: true,
      popups: false,
      missingFrontBumper: false,
      crookedRearBumper: false,
      singleCrookedExhaust: false,
      rollCage: true,
      spoiler: 'gt_wing',
      dims: { w: 2.02, l: 4.82, wheelbase: 2.76, track: 1.84 },
      phys: {
        mass: 1360,
        wheelbase: 2.76,
        weightBiasFront: 0.52,
        cgHeight: 0.45,
        engineForce: 16800,
        brakeForce: 17500,
        gripFront: 1.42,
        gripRear: 1.18,
        maxSpeedKmh: 282,
        redline: 8600,
        maxBoost: 1.75,
        softSuspension: false
      },
      defaultTuning: {
        steerAngleDeg: 62,
        camberFront: -7.5,
        camberRear: -4.0,
        wheelOffset: 0.10,
        rideHeight: -0.10,
        rearPressure: 2.1,
        stage: 3,
        finalDrive: 3.9
      }
    },
    {
      id: 'silvia_s15',
      category: 'ВЗОРВАННЫЕ МАРКИ',
      name: 'Silvia S15 — Сакура Вайдбоди',
      subtitle: 'Pandem Widebody • 780 л.с. • Ливрея Сакура',
      powerHp: 780,
      isRotary: false,
      style: 'widebody_coupe',
      bodyColor: [1.0, 0.95, 0.98, 1],
      rimColor: [0.95, 0.78, 0.42, 1],
      caliperColor: [1.0, 0.2, 0.58, 1],
      headlightColor: [0.90, 0.94, 1.0],
      underglow: [0.0, 0.90, 1.0],
      flameColor: [1.0, 0.45, 0.25],
      liveryTex: 'livery_sakura',
      widebody: true,
      popups: false,
      missingFrontBumper: false,
      crookedRearBumper: false,
      singleCrookedExhaust: false,
      rollCage: true,
      spoiler: 'gt_wing',
      dims: { w: 1.98, l: 4.54, wheelbase: 2.54, track: 1.80 },
      phys: {
        mass: 1240,
        wheelbase: 2.54,
        weightBiasFront: 0.51,
        cgHeight: 0.44,
        engineForce: 15800,
        brakeForce: 17200,
        gripFront: 1.46,
        gripRear: 1.20,
        maxSpeedKmh: 278,
        redline: 8700,
        maxBoost: 1.65,
        softSuspension: false
      },
      defaultTuning: {
        steerAngleDeg: 64,
        camberFront: -8.0,
        camberRear: -4.5,
        wheelOffset: 0.10,
        rideHeight: -0.10,
        rearPressure: 2.0,
        stage: 3,
        finalDrive: 4.1
      }
    },
    {
      id: 'rx7_fd',
      category: 'ВЗОРВАННЫЕ МАРКИ',
      name: 'RX-7 FD — Роторный Демон',
      subtitle: 'FD3S 13B-REW • 9500 об/мин • Синее пламя',
      powerHp: 820,
      isRotary: true,
      style: 'rotary_wide',
      bodyColor: [1.0, 0.95, 0.95, 1],
      hoodColor: [0.16, 0.17, 0.20, 1],
      rimColor: [0.92, 0.76, 0.34, 1],
      caliperColor: [1.0, 0.8, 0.1, 1],
      headlightColor: [0.82, 0.94, 1.0],
      underglow: [0.22, 0.55, 1.0],
      flameColor: [0.25, 0.68, 1.0], // синее роторное пламя!
      liveryTex: 'livery_rotary',
      widebody: true,
      popups: false,
      missingFrontBumper: false,
      crookedRearBumper: false,
      singleCrookedExhaust: false,
      rollCage: true,
      spoiler: 'dual_wing',
      dims: { w: 1.98, l: 4.42, wheelbase: 2.46, track: 1.80 },
      phys: {
        mass: 1190,
        wheelbase: 2.46,
        weightBiasFront: 0.50,
        cgHeight: 0.42,
        engineForce: 16200,
        brakeForce: 17800,
        gripFront: 1.48,
        gripRear: 1.22,
        maxSpeedKmh: 288,
        redline: 9500,
        maxBoost: 1.80,
        softSuspension: false
      },
      defaultTuning: {
        steerAngleDeg: 65,
        camberFront: -7.0,
        camberRear: -3.5,
        wheelOffset: 0.11,
        rideHeight: -0.11,
        rearPressure: 2.0,
        stage: 3,
        finalDrive: 4.2
      }
    }
  ];

  // Построитель детальной иерархической 3D-модели автомобиля
  class CarModel3D {
    constructor(renderer, textures, spec) {
      this.renderer = renderer;
      this.textures = textures;
      this.spec = spec;
      this.parts = [];
      this.dynamicLights = {};
      this.wheelMeshFront = null;
      this.wheelMeshRear = null;
      this.brakeMesh = null;
      this.exhaustOffsets = [];
      this.headlightOffsets = [];

      this._buildModel();
    }

    _addPart(geo, mat) {
      this.parts.push({
        mesh: this.renderer.createMesh(geo),
        mat
      });
    }

    _buildModel() {
      const s = this.spec;
      const d = s.dims;
      const w = d.w;
      const l = d.l;
      const isSedan = s.style.includes('sedan');
      const isRotary = s.style === 'rotary_wide';
      const bodyTex = s.liveryTex ? this.textures[s.liveryTex] : null;
      const carbonTex = this.textures.carbon;

      const paintMat = {
        color: s.bodyColor,
        texture: bodyTex,
        specPower: s.category === 'НЕКРУХИ' ? 18 : 68,
        specIntensity: s.category === 'НЕКРУХИ' ? 0.32 : 0.92
      };

      const darkTrimMat = {
        color: [0.11, 0.12, 0.15, 1],
        specPower: 22,
        specIntensity: 0.35
      };

      const carbonMat = {
        color: [0.85, 0.88, 0.94, 1],
        texture: carbonTex,
        uvScale: [3, 3],
        specPower: 52,
        specIntensity: 0.72
      };

      const metalMat = {
        color: [0.76, 0.80, 0.86, 1],
        specPower: 80,
        specIntensity: 0.95
      };

      // 1. Днище и пороги (side skirts)
      const chassisParts = [
        G.createBox(w * 0.90, 0.16, l * 0.88, 0, 0.28, 0),
        G.createBox(0.14, 0.16, l * 0.56, -w * 0.48, 0.26, 0),
        G.createBox(0.14, 0.16, l * 0.56, w * 0.48, 0.26, 0)
      ];
      this._addPart(G.merge(chassisParts), darkTrimMat);

      // 2. Основной кузов: нижняя линия бортов, крылья, капот, багажник
      const bodyHeight = isRotary ? 0.44 : 0.50;
      const bodyY = 0.56;
      const mainBodyGeos = [
        // Центральная ванна кузова
        G.createTaperedBox(w * 0.96, w * 0.92, bodyHeight, l * 0.92, l * 0.88, -0.05, 0, bodyY, 0),
        // Правое переднее крыло
        G.createBox(0.20, bodyHeight * 0.92, l * 0.28, w * 0.44, bodyY + 0.02, l * 0.28),
        // Задние крылья
        G.createBox(0.22, bodyHeight * 0.95, l * 0.30, -w * 0.44, bodyY + 0.03, -l * 0.27),
        G.createBox(0.22, bodyHeight * 0.95, l * 0.30, w * 0.44, bodyY + 0.03, -l * 0.27)
      ];
      if (!s.mismatchedFender) {
        mainBodyGeos.push(G.createBox(0.20, bodyHeight * 0.92, l * 0.28, -w * 0.44, bodyY + 0.02, l * 0.28));
      } else {
        // Левое переднее крыло другого цвета (грунт/ржавчина для «некрух»)
        this._addPart(
          G.createBox(0.21, bodyHeight * 0.93, l * 0.28, -w * 0.44, bodyY + 0.02, l * 0.28),
          { color: s.mismatchedFender, texture: this.textures.rust_missile, specPower: 10, specIntensity: 0.18 }
        );
      }
      this._addPart(G.merge(mainBodyGeos), paintMat);

      // 3. Капот (у Чайзера матовый, у RX-7 карбоновый, у Взорванных с жабрами)
      const hoodY = bodyY + bodyHeight * 0.5 + 0.02;
      const hoodGeo = G.createTaperedBox(w * 0.78, w * 0.72, 0.08, l * 0.33, l * 0.30, -0.02, 0, hoodY, l * 0.26);
      if (isRotary) {
        this._addPart(hoodGeo, carbonMat);
      } else if (s.hoodColor) {
        this._addPart(hoodGeo, { color: s.hoodColor, specPower: 14, specIntensity: 0.22 });
      } else {
        this._addPart(hoodGeo, paintMat);
      }

      // Жабры / воздухозаборник на капоте
      if (s.widebody || isRotary) {
        const vents = [
          G.createBox(0.24, 0.05, 0.36, -0.28, hoodY + 0.05, l * 0.24),
          G.createBox(0.24, 0.05, 0.36, 0.28, hoodY + 0.05, l * 0.24)
        ];
        this._addPart(G.merge(vents), darkTrimMat);
      }

      // 4. Кабина, крыша и стойки (A, B, C pillars)
      const cabL = isSedan ? l * 0.44 : l * 0.36;
      const cabH = isRotary ? 0.40 : 0.46;
      const cabZ = isSedan ? -0.12 : -0.22;
      const cabY = bodyY + bodyHeight * 0.5 + cabH * 0.5 - 0.02;

      // Крыша
      this._addPart(
        G.createTaperedBox(w * 0.74, w * 0.70, 0.07, cabL * 0.74, cabL * 0.68, 0, 0, cabY + cabH * 0.46, cabZ - 0.04),
        isRotary ? carbonMat : paintMat
      );

      // Воздухозаборник на крыше (S15)
      if (s.id === 'silvia_s15') {
        this._addPart(G.createBox(0.32, 0.09, 0.34, 0, cabY + cabH * 0.53, cabZ + 0.14), carbonMat);
      }

      // Полупрозрачные тонированные стёкла с бликами неона
      this._addPart(
        G.createTaperedBox(w * 0.84, w * 0.71, cabH * 0.92, cabL, cabL * 0.68, -0.06, 0, cabY, cabZ),
        { color: [0.06, 0.09, 0.16, 0.78], specPower: 96, specIntensity: 1.0, transparent: true }
      );

      // Каркас безопасности (Roll Cage) внутри салона
      if (s.rollCage) {
        const cageColor = s.underglow ? [s.underglow[0], s.underglow[1], s.underglow[2], 1] : [0.95, 0.85, 0.15, 1];
        const cageParts = [
          G.createCylinder(0.032, 0.032, cabH * 0.9, 6, 'y', -w * 0.32, cabY, cabZ - 0.25),
          G.createCylinder(0.032, 0.032, cabH * 0.9, 6, 'y', w * 0.32, cabY, cabZ - 0.25),
          G.createCylinder(0.032, 0.032, w * 0.64, 6, 'x', 0, cabY + cabH * 0.36, cabZ - 0.25)
        ];
        this._addPart(G.merge(cageParts), { color: cageColor, emissive: [cageColor[0] * 0.2, cageColor[1] * 0.2, cageColor[2] * 0.2], specPower: 40, specIntensity: 0.6 });
      }

      // 5. Передний и задний бамперы, интеркулер, Widebody-арки и сплиттер
      if (s.missingFrontBumper) {
        // Слива S13 без бампера: виден помятый радиатор/интеркулер и силовой усилитель
        this._addPart(G.createBox(w * 0.68, 0.28, 0.12, 0, 0.42, l * 0.45), metalMat);
        this._addPart(G.createBox(w * 0.84, 0.07, 0.08, 0, 0.56, l * 0.48), darkTrimMat);
      } else {
        // Передний бампер
        this._addPart(G.createTaperedBox(w * 0.96, w * 0.94, 0.34, 0.28, 0.22, -0.03, 0, 0.38, l * 0.44), paintMat);
        // Интеркулер за решёткой
        this._addPart(G.createBox(w * 0.52, 0.20, 0.08, 0, 0.34, l * 0.51), metalMat);
        // Передний сплиттер с тягами (для Взорванных)
        if (s.widebody) {
          const splitParts = [
            G.createBox(w * 1.04, 0.05, 0.36, 0, 0.21, l * 0.47),
            G.createCylinder(0.015, 0.015, 0.22, 6, 'y', -0.45, 0.32, l * 0.53),
            G.createCylinder(0.015, 0.015, 0.22, 6, 'y', 0.45, 0.32, l * 0.53)
          ];
          this._addPart(G.merge(splitParts), carbonMat);
        }
      }

      // Задний бампер (у Марка 90 слегка перекошен)
      const rbY = s.crookedRearBumper ? 0.36 : 0.39;
      this._addPart(G.createBox(w * 0.96, 0.32, 0.26, s.crookedRearBumper ? 0.04 : 0, rbY, -l * 0.45), paintMat);

      // Задний диффузор (для Widebody)
      if (s.widebody) {
        const diffParts = [
          G.createBox(w * 0.82, 0.14, 0.24, 0, 0.24, -l * 0.49),
          G.createBox(0.04, 0.16, 0.26, -0.35, 0.24, -l * 0.50),
          G.createBox(0.04, 0.16, 0.26, 0.0, 0.24, -l * 0.50),
          G.createBox(0.04, 0.16, 0.26, 0.35, 0.24, -l * 0.50)
        ];
        this._addPart(G.merge(diffParts), carbonMat);

        // Расширенные колёсные арки (Widebody Overfenders)
        const wf = d.wheelbase * 0.5;
        const fenders = [
          G.createBox(0.18, 0.36, 0.88, -w * 0.51, 0.50, wf),
          G.createBox(0.18, 0.36, 0.88, w * 0.51, 0.50, wf),
          G.createBox(0.22, 0.40, 0.96, -w * 0.52, 0.52, -wf),
          G.createBox(0.22, 0.40, 0.96, w * 0.52, 0.52, -wf)
        ];
        this._addPart(G.merge(fenders), paintMat);
      }

      // 6. Спойлеры / GT-антикрылья
      const trunkY = bodyY + bodyHeight * 0.5 + 0.02;
      if (s.spoiler === 'gt_wing' || s.spoiler === 'dual_wing') {
        const wingH = 0.46;
        const wingParts = [
          G.createBox(w * 0.96, 0.05, 0.30, 0, trunkY + wingH, -l * 0.44),
          G.createBox(0.04, 0.22, 0.34, -w * 0.48, trunkY + wingH - 0.02, -l * 0.44),
          G.createBox(0.04, 0.22, 0.34, w * 0.48, trunkY + wingH - 0.02, -l * 0.44),
          G.createBox(0.05, wingH, 0.14, -w * 0.26, trunkY + wingH * 0.5, -l * 0.43),
          G.createBox(0.05, wingH, 0.14, w * 0.26, trunkY + wingH * 0.5, -l * 0.43)
        ];
        if (s.spoiler === 'dual_wing') {
          wingParts.push(G.createBox(w * 0.88, 0.04, 0.22, 0, trunkY + wingH - 0.16, -l * 0.42));
        }
        this._addPart(G.merge(wingParts), carbonMat);
      } else if (s.spoiler === 'ducktail' || s.spoiler === 'lip') {
        this._addPart(G.createBox(w * 0.82, 0.11, 0.18, 0, trunkY + 0.05, -l * 0.44), darkTrimMat);
      }

      // 7. Передние фары (включая слепые pop-up у S13 и разноцветные у Марк II 90)
      const hlZ = l * 0.47;
      const hlY = 0.64;
      const hlX = w * 0.33;
      this.headlightOffsets = [
        [-hlX, hlY, hlZ],
        [hlX, hlY, hlZ]
      ];
      if (s.popups) {
        // Левая фара открыта, правая приоткрыта ("подмигивает")
        this._addPart(G.createBox(0.32, 0.16, 0.24, -hlX, hlY + 0.14, hlZ - 0.08), darkTrimMat);
        this._addPart(G.createBox(0.28, 0.12, 0.05, -hlX, hlY + 0.14, hlZ + 0.04), {
          color: [1, 1, 0.92, 1], emissive: [1.0, 0.95, 0.8]
        });
        this._addPart(G.createBox(0.32, 0.08, 0.24, hlX, hlY + 0.08, hlZ - 0.08), darkTrimMat);
        this._addPart(G.createBox(0.28, 0.05, 0.05, hlX, hlY + 0.08, hlZ + 0.04), {
          color: [1, 0.92, 0.72, 1], emissive: [0.8, 0.72, 0.5]
        });
      } else {
        const leftTint = s.id === 'mark2_90' ? [1.0, 0.85, 0.55] : s.headlightColor;
        this._addPart(G.createBox(0.34, 0.13, 0.07, -hlX, hlY, hlZ), {
          color: [1, 1, 1, 1], emissive: leftTint
        });
        this._addPart(G.createBox(0.34, 0.13, 0.07, hlX, hlY, hlZ), {
          color: [1, 1, 1, 1], emissive: s.headlightColor
        });
      }

      // Полупрозрачные конусы света фар в ночном тумане
      const coneParts = [
        G.createTaperedBox(0.35, 2.2, 0.06, 0.2, 11.5, 5.8, -hlX, 0.36, hlZ + 0.3),
        G.createTaperedBox(0.35, 2.2, 0.06, 0.2, 11.5, 5.8, hlX, 0.36, hlZ + 0.3)
      ];
      this._addPart(G.merge(coneParts), {
        color: [s.headlightColor[0], s.headlightColor[1], s.headlightColor[2], 0.10],
        emissive: [s.headlightColor[0] * 0.25, s.headlightColor[1] * 0.25, s.headlightColor[2] * 0.25],
        transparent: true,
        additive: true,
        doubleSided: true
      });

      // 8. Задние фонари (отдельный динамический материал для усиления стоп-сигнала)
      const tlGeo = G.merge([
        G.createBox(0.42, 0.13, 0.06, -w * 0.30, 0.64, -l * 0.47),
        G.createBox(0.42, 0.13, 0.06, w * 0.30, 0.64, -l * 0.47)
      ]);
      this.taillightMat = { color: [0.9, 0.08, 0.1, 1], emissive: [0.65, 0.05, 0.06] };
      this._addPart(tlGeo, this.taillightMat);

      // Белые огни заднего хода
      const revGeo = G.merge([
        G.createBox(0.14, 0.08, 0.06, -w * 0.12, 0.64, -l * 0.475),
        G.createBox(0.14, 0.08, 0.06, w * 0.12, 0.64, -l * 0.475)
      ]);
      this.reverseMat = { color: [0.5, 0.5, 0.55, 1], emissive: [0, 0, 0] };
      this._addPart(revGeo, this.reverseMat);

      // 9. Неоновая подсветка днища (для «Взорванных» марок)
      if (s.underglow) {
        const ug = s.underglow;
        this._addPart(G.createBox(w * 0.92, 0.03, l * 0.84, 0, 0.14, 0), {
          color: [ug[0], ug[1], ug[2], 0.45],
          emissive: [ug[0] * 1.1, ug[1] * 1.1, ug[2] * 1.1],
          transparent: true,
          additive: true,
          doubleSided: true
        });
      }

      // 10. Выхлопная система (одиночный кривой "канон" или двойной титановый выхлоп)
      if (s.singleCrookedExhaust) {
        this._addPart(G.createCylinder(0.065, 0.065, 0.42, 10, 'z', -w * 0.28, 0.25, -l * 0.51), metalMat);
        this.exhaustOffsets = [[-w * 0.28, 0.25, -l * 0.56]];
      } else {
        const exParts = [
          G.createCylinder(0.062, 0.062, 0.46, 10, 'z', -w * 0.27, 0.24, -l * 0.52),
          G.createCylinder(0.062, 0.062, 0.46, 10, 'z', w * 0.27, 0.24, -l * 0.52)
        ];
        this._addPart(G.merge(exParts), metalMat);
        this.exhaustOffsets = [
          [-w * 0.27, 0.24, -l * 0.58],
          [w * 0.27, 0.24, -l * 0.58]
        ];
      }

      // 11. Детальные 3D-колёса (покрышка + глубокая полка + многоспицевый диск + тормозной суппорт)
      const tireMesh = this.renderer.createMesh(G.createCylinder(0.34, 0.34, 0.26, 18, 'x', 0, 0, 0));
      const dishMesh = this.renderer.createMesh(G.createCylinder(0.23, 0.23, 0.275, 16, 'x', 0, 0, 0));
      const spokesGeos = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const y = Math.cos(a) * 0.11;
        const z = Math.sin(a) * 0.11;
        spokesGeos.push(G.createBox(0.285, 0.045, 0.19, 0, y * 0.3, z * 0.3));
      }
      const spokeMesh = this.renderer.createMesh(G.merge(spokesGeos));
      const caliperMesh = this.renderer.createMesh(G.createBox(0.14, 0.16, 0.12, 0, 0.06, -0.11));

      this.wheelMeshes = {
        tire: { mesh: tireMesh, mat: { color: [0.10, 0.10, 0.12, 1], specPower: 14, specIntensity: 0.22 } },
        dishFront: { mesh: dishMesh, mat: { color: s.rimColor, specPower: 85, specIntensity: 0.95 } },
        dishRear: { mesh: dishMesh, mat: { color: s.rearRimColor || s.rimColor, specPower: 85, specIntensity: 0.95 } },
        spokes: { mesh: spokeMesh, mat: { color: [0.85, 0.87, 0.92, 1], specPower: 75, specIntensity: 0.9 } },
        caliper: { mesh: caliperMesh, mat: { color: s.caliperColor, specPower: 55, specIntensity: 0.7 } }
      };

      this._carMat = Mat4.create();
      this._bodyMat = Mat4.create();
      this._wheelMat = Mat4.create();
      this._tmpMat = Mat4.create();
    }

    // Возвращает мировые координаты фар и выхлопных труб для освещения и частиц
    getWorldAnchors(state, tuning) {
      const rideOff = tuning ? (tuning.rideHeight || 0) : 0;
      Mat4.fromTRS(this._carMat, state.x, state.y, state.z, state.yaw, state.pitch, state.roll);
      Mat4.copy(this._bodyMat, this._carMat);
      Mat4.translate(this._bodyMat, this._bodyMat, 0, rideOff, 0);

      const hlL = new Float32Array(3);
      const hlR = new Float32Array(3);
      Mat4.transformPoint(hlL, this._bodyMat, this.headlightOffsets[0][0], this.headlightOffsets[0][1], this.headlightOffsets[0][2]);
      Mat4.transformPoint(hlR, this._bodyMat, this.headlightOffsets[1][0], this.headlightOffsets[1][1], this.headlightOffsets[1][2]);

      const dir = [
        Math.sin(state.yaw) * Math.cos(state.pitch - 0.12),
        Math.sin(state.pitch - 0.12),
        Math.cos(state.yaw) * Math.cos(state.pitch - 0.12)
      ];

      const exhausts = this.exhaustOffsets.map((e) => {
        const p = new Float32Array(3);
        Mat4.transformPoint(p, this._bodyMat, e[0], e[1], e[2]);
        return p;
      });

      const d = this.spec.dims;
      const halfTrack = d.track * 0.5 + (tuning ? (tuning.wheelOffset || 0) : 0);
      const rearZ = -d.wheelbase * 0.5;
      const rearLeft = new Float32Array(3);
      const rearRight = new Float32Array(3);
      Mat4.transformPoint(rearLeft, this._carMat, -halfTrack, 0.08, rearZ);
      Mat4.transformPoint(rearRight, this._carMat, halfTrack, 0.08, rearZ);

      return { hlL, hlR, dir, exhausts, rearLeft, rearRight };
    }

    render(state, tuning, hideHoodForHoodCam = false) {
      const r = this.renderer;
      const rideOff = tuning ? (tuning.rideHeight || 0) : 0;

      // Обновляем свечение стоп-сигналов и заднего хода
      if (state.braking) {
        this.taillightMat.emissive = [1.8, 0.08, 0.08];
      } else {
        this.taillightMat.emissive = [0.65, 0.04, 0.05];
      }
      this.reverseMat.emissive = state.reversing ? [1.2, 1.2, 1.3] : [0, 0, 0];

      Mat4.fromTRS(this._carMat, state.x, state.y, state.z, state.yaw, state.pitch, state.roll);
      Mat4.copy(this._bodyMat, this._carMat);
      Mat4.translate(this._bodyMat, this._bodyMat, 0, rideOff, 0);

      // Отрисовка кузова и обвеса
      for (const p of this.parts) {
        r.drawMesh(p.mesh, this._bodyMat, p.mat);
      }

      if (hideHoodForHoodCam) return;

      // Отрисовка 4 независимых колёс с выворотом, вращением, развалом (camber) и вылетом (offset)
      const d = this.spec.dims;
      const halfTrack = d.track * 0.5 + (tuning ? (tuning.wheelOffset || 0) : 0);
      const frontZ = d.wheelbase * 0.5;
      const rearZ = -d.wheelbase * 0.5;
      const camF = ((tuning && tuning.camberFront) || 0) * DEG2RAD;
      const camR = ((tuning && tuning.camberRear) || 0) * DEG2RAD;

      const wheels = [
        { x: -halfTrack, z: frontZ, steer: state.steerAngle, spin: state.wheelRot, camber: -camF, front: true },
        { x: halfTrack, z: frontZ, steer: state.steerAngle, spin: state.wheelRot, camber: camF, front: true },
        { x: -halfTrack, z: rearZ, steer: 0, spin: state.rearWheelRot, camber: -camR, front: false },
        { x: halfTrack, z: rearZ, steer: 0, spin: state.rearWheelRot, camber: camR, front: false }
      ];

      for (const w of wheels) {
        Mat4.copy(this._wheelMat, this._carMat);
        Mat4.translate(this._wheelMat, this._wheelMat, w.x, 0.34, w.z);
        if (w.steer) Mat4.rotateY(this._wheelMat, this._wheelMat, w.steer);
        if (w.camber) Mat4.rotateZ(this._wheelMat, this._wheelMat, w.camber);

        // Тормозной суппорт не крутится вместе с колесом
        r.drawMesh(this.wheelMeshes.caliper.mesh, this._wheelMat, this.wheelMeshes.caliper.mat);

        // Покрышка и диск вращаются
        Mat4.rotateX(this._wheelMat, this._wheelMat, w.spin);
        r.drawMesh(this.wheelMeshes.tire.mesh, this._wheelMat, this.wheelMeshes.tire.mat);
        const dish = w.front ? this.wheelMeshes.dishFront : this.wheelMeshes.dishRear;
        r.drawMesh(dish.mesh, this._wheelMat, dish.mat);
        r.drawMesh(this.wheelMeshes.spokes.mesh, this._wheelMat, this.wheelMeshes.spokes.mat);
      }
    }
  }

  global.CAR_CATALOG = CAR_CATALOG;
  global.CarModel3D = CarModel3D;
})(window);
