// game/track.js — Генератор 2 ночных японских трасс (Перевал Хаконэ и Портовый хайвей Сибуя) с сакурами, неоном и клиппинг-зонами
(function (global) {
  'use strict';

  const { catmullRom, Mat4 } = global.Math3D;
  const G = global.Geometry;

  const TRACK_DEFS = [
    {
      id: 'hakone',
      name: 'Перевал Хаконэ — Ночная Сакура',
      subtitle: 'Горный серпантин Тогэ • Шпильки и рощи сакуры',
      roadWidth: 13.8,
      asphaltTex: 'asphalt_touge',
      fogColor: [0.06, 0.04, 0.13],
      fogDensity: 0.0044,
      // Контрольные точки замкнутого горного перевала (x, y, z)
      points: [
        [0, 0, 0],
        [0, 1.5, 65],
        [38, 4.5, 130],
        [105, 8.0, 145],
        [145, 11.0, 95],
        [110, 13.5, 35],
        [160, 15.0, -25],
        [215, 12.0, -90],
        [170, 7.5, -165],
        [90, 4.0, -180],
        [45, 2.5, -120],
        [-15, 1.0, -95],
        [-35, 0.0, -45]
      ]
    },
    {
      id: 'shibuya',
      name: 'Портовый хайвей и квартал Сибуя',
      subtitle: 'Широкие ночные эстакады • Неон и скоростные дуги',
      roadWidth: 16.5,
      asphaltTex: 'asphalt_city',
      fogColor: [0.05, 0.04, 0.15],
      fogDensity: 0.0038,
      points: [
        [0, 0, 0],
        [0, 0.5, 85],
        [55, 3.0, 165],
        [155, 5.5, 185],
        [235, 4.0, 115],
        [245, 1.5, 10],
        [185, 0.5, -80],
        [220, 3.0, -165],
        [125, 5.0, -225],
        [25, 2.5, -190],
        [-45, 0.5, -115],
        [-35, 0.0, -45]
      ]
    }
  ];

  class NightJapanTrack {
    constructor(renderer, textures, trackId) {
      this.renderer = renderer;
      this.textures = textures;
      this.def = TRACK_DEFS.find((t) => t.id === trackId) || TRACK_DEFS[0];

      this.samples = [];
      this.clippingZones = [];
      this.lights = [];
      this.staticDraws = [];
      this.identityMat = Mat4.create();

      this._buildSpline();
      this._buildRoadAndWalls();
      this._buildScenery();
      this._buildClippingZones();
    }

    _buildSpline() {
      const pts = this.def.points;
      const n = pts.length;
      const subSteps = 22;
      const raw = [];

      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        const p3 = pts[(i + 2) % n];
        for (let s = 0; s < subSteps; s++) {
          const t = s / subSteps;
          raw.push({
            x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
            y: catmullRom(p0[1], p1[1], p2[1], p3[1], t),
            z: catmullRom(p0[2], p1[2], p2[2], p3[2], t)
          });
        }
      }

      // Вычисляем касательные, правые векторы, длину пути и кривизну
      const total = raw.length;
      let dist = 0;
      for (let i = 0; i < total; i++) {
        const prev = raw[(i - 1 + total) % total];
        const curr = raw[i];
        const next = raw[(i + 1) % total];

        if (i > 0) {
          dist += Math.hypot(curr.x - prev.x, curr.z - prev.z);
        }
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const tz = next.z - prev.z;
        const lenXZ = Math.hypot(tx, tz) || 1;
        const dirX = tx / lenXZ;
        const dirZ = tz / lenXZ;
        // Вектор вправо (перпендикулярно движению в XZ)
        const rightX = dirZ;
        const rightZ = -dirX;
        const slopePitch = Math.atan2(ty, lenXZ);

        this.samples.push({
          x: curr.x,
          y: curr.y,
          z: curr.z,
          dirX,
          dirZ,
          rightX,
          rightZ,
          slopePitch,
          yaw: Math.atan2(dirX, dirZ),
          dist
        });
      }
      this.totalLength = dist;
    }

    _buildRoadAndWalls() {
      const halfW = this.def.roadWidth * 0.5;
      const shoulderW = halfW + 1.8;
      const samples = this.samples;
      const N = samples.length;

      // 1. Полотно асфальта
      const roadPos = [], roadNorm = [], roadUV = [], roadIdx = [];
      // 2. Гравийные обочины и откосы
      const grvPos = [], grvNorm = [], grvUV = [], grvIdx = [];
      // 3. Металлические/бетонные отбойники по обоим краям
      const wallPos = [], wallNorm = [], wallUV = [], wallIdx = [];

      for (let i = 0; i <= N; i++) {
        const s = samples[i % N];
        const vCoord = (i === N ? this.totalLength : s.dist) * 0.11;

        // Асфальт
        roadPos.push(
          s.x - s.rightX * halfW, s.y, s.z - s.rightZ * halfW,
          s.x + s.rightX * halfW, s.y, s.z + s.rightZ * halfW
        );
        roadNorm.push(0, 1, 0, 0, 1, 0);
        roadUV.push(0, vCoord, 1, vCoord);

        // Обочины (левая и правая)
        grvPos.push(
          s.x - s.rightX * (shoulderW + 8), s.y - 1.4, s.z - s.rightZ * (shoulderW + 8),
          s.x - s.rightX * halfW, s.y - 0.03, s.z - s.rightZ * halfW,
          s.x + s.rightX * halfW, s.y - 0.03, s.z + s.rightZ * halfW,
          s.x + s.rightX * (shoulderW + 8), s.y - 1.4, s.z + s.rightZ * (shoulderW + 8)
        );
        grvNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        grvUV.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

        // Отбойники (высота 0.95 м)
        const wOff = halfW + 1.55;
        const hW = 0.95;
        // Левый отбойник (смотрит вправо)
        wallPos.push(
          s.x - s.rightX * wOff, s.y, s.z - s.rightZ * wOff,
          s.x - s.rightX * wOff, s.y + hW, s.z - s.rightZ * wOff
        );
        wallNorm.push(s.rightX, 0.15, s.rightZ, s.rightX, 0.15, s.rightZ);
        wallUV.push(vCoord * 1.4, 1, vCoord * 1.4, 0);

        // Правый отбойник (смотрит влево)
        wallPos.push(
          s.x + s.rightX * wOff, s.y, s.z + s.rightZ * wOff,
          s.x + s.rightX * wOff, s.y + hW, s.z + s.rightZ * wOff
        );
        wallNorm.push(-s.rightX, 0.15, -s.rightZ, -s.rightX, 0.15, -s.rightZ);
        wallUV.push(vCoord * 1.4, 1, vCoord * 1.4, 0);
      }

      for (let i = 0; i < N; i++) {
        const r0 = i * 2;
        roadIdx.push(r0, r0 + 2, r0 + 1, r0 + 1, r0 + 2, r0 + 3);

        const g0 = i * 4;
        // Левая обочина
        grvIdx.push(g0, g0 + 4, g0 + 1, g0 + 1, g0 + 4, g0 + 5);
        // Правая обочина
        grvIdx.push(g0 + 2, g0 + 6, g0 + 3, g0 + 3, g0 + 6, g0 + 7);

        const w0 = i * 4;
        // Левый отбойник
        wallIdx.push(w0, w0 + 1, w0 + 4, w0 + 1, w0 + 5, w0 + 4);
        // Правый отбойник
        wallIdx.push(w0 + 2, w0 + 6, w0 + 3, w0 + 3, w0 + 6, w0 + 7);
      }

      this.staticDraws.push({
        mesh: this.renderer.createMesh({ positions: roadPos, normals: roadNorm, uvs: roadUV, indices: roadIdx }),
        mat: {
          color: [1, 1, 1, 1],
          texture: this.textures[this.def.asphaltTex],
          specPower: 76,
          specIntensity: 0.96,
          doubleSided: true
        }
      });

      this.staticDraws.push({
        mesh: this.renderer.createMesh({ positions: grvPos, normals: grvNorm, uvs: grvUV, indices: grvIdx }),
        mat: {
          color: [0.10, 0.11, 0.15, 1],
          specPower: 8,
          specIntensity: 0.12,
          doubleSided: true
        }
      });

      this.staticDraws.push({
        mesh: this.renderer.createMesh({ positions: wallPos, normals: wallNorm, uvs: wallUV, indices: wallIdx }),
        mat: {
          color: [0.92, 0.94, 0.98, 1],
          texture: this.textures.guardrail,
          specPower: 34,
          specIntensity: 0.52,
          doubleSided: true
        }
      });
    }

    _buildScenery() {
      const halfW = this.def.roadWidth * 0.5;
      const samples = this.samples;
      const N = samples.length;

      const trunks = [];
      const crowns = [];
      const lampPosts = [];
      const lampBulbs = [];
      const cityBlocks = [];

      this.props = []; // Отдельные пропы с уникальными текстурами (неон, джихандоки)
      const signTextures = ['neon_drift', 'neon_touge', 'neon_ramen'];

      for (let i = 0; i < N; i++) {
        const s = samples[i];

        // 1. Рощи цветущей сакуры по обеим сторонам трассы
        if (i % 5 === 0) {
          const side = (i % 10 === 0) ? 1 : -1;
          const distOff = halfW + 4.8 + ((i * 17) % 5) * 0.7;
          const tx = s.x + s.rightX * side * distOff;
          const tz = s.z + s.rightZ * side * distOff;
          const ty = s.y - 0.3;
          const h = 4.2 + ((i * 7) % 3) * 0.8;

          trunks.push(G.createCylinder(0.20, 0.36, h, 7, 'y', tx, ty + h * 0.5, tz));
          crowns.push(G.createSphere(2.8, 6, 8, tx, ty + h + 0.9, tz, 0.72));
          crowns.push(G.createSphere(2.1, 5, 7, tx + side * 1.4, ty + h + 0.3, tz + 0.9, 0.68));
          crowns.push(G.createSphere(2.0, 5, 7, tx - side * 1.2, ty + h + 0.4, tz - 1.1, 0.68));
        }

        // 2. Уличные фонари с тёплым оранжевым/розовым светом
        if (i % 11 === 0) {
          const side = (i % 22 === 0) ? -1 : 1;
          const lx = s.x + s.rightX * side * (halfW + 2.3);
          const lz = s.z + s.rightZ * side * (halfW + 2.3);
          const ly = s.y;
          lampPosts.push(G.createCylinder(0.11, 0.14, 7.2, 6, 'y', lx, ly + 3.6, lz));
          const bulbX = lx - s.rightX * side * 1.6;
          const bulbZ = lz - s.rightZ * side * 1.6;
          lampPosts.push(G.createBox(1.8, 0.12, 0.14, (lx + bulbX) * 0.5, ly + 7.1, (lz + bulbZ) * 0.5));
          lampBulbs.push(G.createBox(0.55, 0.18, 0.32, bulbX, ly + 6.95, bulbZ));

          // Точечный свет фонаря
          const warm = (i % 33 === 0);
          this.lights.push({
            x: bulbX,
            y: ly + 6.2,
            z: bulbZ,
            r: warm ? 1.0 : 1.0,
            g: warm ? 0.36 : 0.68,
            b: warm ? 0.75 : 0.32,
            range: 34.0
          });
        }

        // 3. Неоновые вывески с японскими иероглифами
        if (i % 24 === 6) {
          const side = (i % 48 === 6) ? 1 : -1;
          const sx = s.x + s.rightX * side * (halfW + 3.6);
          const sz = s.z + s.rightZ * side * (halfW + 3.6);
          const sy = s.y + 4.4;
          const texName = signTextures[(i / 6 | 0) % signTextures.length];
          const signMat = Mat4.create();
          Mat4.fromTRS(signMat, sx, sy, sz, s.yaw + (side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5), 0, 0);

          this.props.push({
            mesh: this.renderer.createMesh(G.createBox(2.4, 5.0, 0.25, 0, 0, 0)),
            modelMat: signMat,
            mat: {
              color: [1, 1, 1, 1],
              emissive: [0.55, 0.45, 0.58],
              texture: this.textures[texName],
              specPower: 30,
              specIntensity: 0.4
            }
          });

          const cMap = {
            neon_drift: [1.0, 0.22, 0.62],
            neon_touge: [0.10, 0.88, 1.0],
            neon_ramen: [1.0, 0.76, 0.16]
          };
          const lc = cMap[texName];
          this.lights.push({ x: sx, y: sy, z: sz, r: lc[0], g: lc[1], b: lc[2], range: 28.0 });
        }

        // 4. Японские торговые автоматы (джихандоки) на карманах поворотов
        if (i % 38 === 14) {
          const side = -1;
          const vx = s.x + s.rightX * side * (halfW + 2.8);
          const vz = s.z + s.rightZ * side * (halfW + 2.8);
          const vy = s.y + 1.15;
          const vmMat = Mat4.create();
          Mat4.fromTRS(vmMat, vx, vy, vz, s.yaw + Math.PI * 0.5, 0, 0);
          this.props.push({
            mesh: this.renderer.createMesh(G.createBox(1.3, 2.3, 0.85, 0, 0, 0)),
            modelMat: vmMat,
            mat: {
              color: [1, 1, 1, 1],
              emissive: [0.42, 0.46, 0.52],
              texture: this.textures.vending,
              specPower: 40,
              specIntensity: 0.5
            }
          });
          this.lights.push({ x: vx, y: vy + 0.5, z: vz, r: 0.85, g: 0.94, b: 1.0, range: 18.0 });
        }

        // 5. Ночные небоскрёбы / огни далёкого города
        if (i % 14 === 0) {
          const side = (this.def.id === 'shibuya') ? ((i % 28 === 0) ? 1 : -1) : 1;
          const dCity = this.def.id === 'shibuya' ? (halfW + 18 + (i % 4) * 5) : (halfW + 38 + (i % 5) * 9);
          const bx = s.x + s.rightX * side * dCity;
          const bz = s.z + s.rightZ * side * dCity;
          const bh = 18 + ((i * 13) % 34);
          cityBlocks.push(G.createBox(12, bh, 12, bx, s.y - 6 + bh * 0.5, bz));
        }
      }

      if (trunks.length) {
        this.staticDraws.push({
          mesh: this.renderer.createMesh(G.merge(trunks)),
          mat: { color: [0.22, 0.14, 0.12, 1], specPower: 8, specIntensity: 0.1 }
        });
      }
      if (crowns.length) {
        this.staticDraws.push({
          mesh: this.renderer.createMesh(G.merge(crowns)),
          mat: {
            color: [1.0, 0.62, 0.80, 1],
            emissive: [0.58, 0.18, 0.38],
            specPower: 14,
            specIntensity: 0.2
          }
        });
      }
      if (lampPosts.length) {
        this.staticDraws.push({
          mesh: this.renderer.createMesh(G.merge(lampPosts)),
          mat: { color: [0.22, 0.25, 0.30, 1], specPower: 30, specIntensity: 0.45 }
        });
      }
      if (lampBulbs.length) {
        this.staticDraws.push({
          mesh: this.renderer.createMesh(G.merge(lampBulbs)),
          mat: { color: [1.0, 0.86, 0.62, 1], emissive: [1.2, 0.82, 0.40] }
        });
      }
      if (cityBlocks.length) {
        this.staticDraws.push({
          mesh: this.renderer.createMesh(G.merge(cityBlocks)),
          mat: { color: [0.09, 0.08, 0.16, 1], emissive: [0.05, 0.04, 0.10], specPower: 24, specIntensity: 0.3 }
        });
      }
    }

    // Клиппинг-зоны (неоновые дуги у поворотов)
    _buildClippingZones() {
      const halfW = this.def.roadWidth * 0.5;
      const N = this.samples.length;
      const step = Math.floor(N / 7);

      for (let k = 0; k < 7; k++) {
        const idx = (k * step + 18) % N;
        const s = this.samples[idx];
        const side = (k % 2 === 0) ? 1 : -1;
        const cx = s.x + s.rightX * side * (halfW - 1.3);
        const cz = s.z + s.rightZ * side * (halfW - 1.3);
        const cy = s.y + 0.18;

        const m = Mat4.create();
        Mat4.fromTRS(m, cx, cy, cz, s.yaw, 0, 0);
        const mesh = this.renderer.createMesh(G.createBox(2.2, 0.25, 8.0, 0, 0, 0));

        this.clippingZones.push({
          x: cx,
          y: cy,
          z: cz,
          radius: 4.5,
          cooldown: 0,
          mesh,
          modelMat: m,
          mat: {
            color: [0.0, 0.95, 1.0, 0.55],
            emissive: [0.0, 0.85, 1.0],
            transparent: true,
            additive: true,
            doubleSided: true
          }
        });
      }
    }

    getStartTransform() {
      const s = this.samples[0];
      return { x: s.x, y: s.y, z: s.z, yaw: s.yaw };
    }

    // Быстрый поиск ближайшего сегмента трассы
    queryPosition(x, z, hintIdx = 0) {
      const samples = this.samples;
      const N = samples.length;
      let bestIdx = hintIdx % N;
      let bestDistSq = Infinity;

      // Сначала локальный поиск вокруг hintIdx
      const searchWindow = 18;
      for (let d = -searchWindow; d <= searchWindow; d++) {
        const idx = (hintIdx + d + N) % N;
        const s = samples[idx];
        const dx = x - s.x;
        const dz = z - s.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }

      // Если машина далеко от локального окна — полный поиск
      if (bestDistSq > 900) {
        for (let i = 0; i < N; i++) {
          const s = samples[i];
          const dx = x - s.x;
          const dz = z - s.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
      }

      const s = samples[bestIdx];
      const dx = x - s.x;
      const dz = z - s.z;
      const offset = dx * s.rightX + dz * s.rightZ;

      return {
        segIdx: bestIdx,
        y: s.y,
        slopePitch: s.slopePitch,
        offset,
        halfWidth: this.def.roadWidth * 0.5,
        rightX: s.rightX,
        rightZ: s.rightZ,
        dirX: s.dirX,
        dirZ: s.dirZ,
        yaw: s.yaw
      };
    }

    // Возвращает ближайшие динамические источники света (фонари, неон)
    getNearestLights(x, z, maxCount = 4) {
      const scored = [];
      for (let i = 0; i < this.lights.length; i++) {
        const l = this.lights[i];
        const dx = l.x - x;
        const dz = l.z - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 3600) {
          scored.push({ light: l, dSq });
        }
      }
      scored.sort((a, b) => a.dSq - b.dSq);
      const out = [];
      for (let i = 0; i < Math.min(maxCount, scored.length); i++) {
        out.push(scored[i].light);
      }
      return out;
    }

    updateClippingZones(dt, carX, carZ, isDrifting) {
      let triggered = false;
      for (const cz of this.clippingZones) {
        if (cz.cooldown > 0) cz.cooldown -= dt;
        const distSq = (carX - cz.x) * (carX - cz.x) + (carZ - cz.z) * (carZ - cz.z);
        if (distSq < cz.radius * cz.radius && isDrifting && cz.cooldown <= 0) {
          cz.cooldown = 6.0;
          triggered = true;
        }
        if (cz.cooldown > 4.8) {
          cz.mat.emissive = [1.0, 0.22, 0.72];
          cz.mat.color = [1.0, 0.25, 0.75, 0.75];
        } else {
          cz.mat.emissive = [0.0, 0.85, 1.0];
          cz.mat.color = [0.0, 0.95, 1.0, 0.45];
        }
      }
      return triggered;
    }

    render() {
      const r = this.renderer;
      for (const item of this.staticDraws) {
        r.drawMesh(item.mesh, this.identityMat, item.mat);
      }
      for (const prop of this.props) {
        r.drawMesh(prop.mesh, prop.modelMat, prop.mat);
      }
      for (const cz of this.clippingZones) {
        r.drawMesh(cz.mesh, cz.modelMat, cz.mat);
      }
    }
  }

  global.TRACK_DEFS = TRACK_DEFS;
  global.NightJapanTrack = NightJapanTrack;
})(window);
