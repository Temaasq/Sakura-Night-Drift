// game/particles.js — Системы частиц: объёмный дым шин, следы протектора (skidmarks), искры, пламя выхлопа и лепестки сакуры
(function (global) {
  'use strict';

  const { Mat4 } = global.Math3D;

  class ParticleManager {
    constructor(renderer, textures) {
      this.renderer = renderer;
      this.textures = textures;

      this.smoke = [];
      this.sparks = [];
      this.flames = [];
      this.petals = [];

      // Кольцевой буфер следов шин (skidmarks) на асфальте
      this.maxSkids = 260;
      this.skids = [];
      this.skidHead = 0;
      this.prevRearL = null;
      this.prevRearR = null;
      this.skidTimer = 0;
      this.identityMat = Mat4.create();

      this._initSkidBuffers();
      this._initPetals();
    }

    _initSkidBuffers() {
      const gl = this.renderer.gl;
      // 4 вершины на квадрат следа, 8 float на вершину (pos3, norm3, uv2)
      this.skidVerts = new Float32Array(this.maxSkids * 4 * 8);
      const idx = new Uint16Array(this.maxSkids * 6);
      for (let i = 0; i < this.maxSkids; i++) {
        const v = i * 4, o = i * 6;
        idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
        idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
      }
      this.skidVBO = gl.createBuffer();
      this.skidIBO = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skidIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.skidMesh = {
        vbo: this.skidVBO,
        ibo: this.skidIBO,
        indexCount: 0,
        indexType: gl.UNSIGNED_SHORT
      };
      this.skidMat = {
        color: [0.06, 0.06, 0.08, 0.65],
        texture: this.textures.skid,
        transparent: true,
        doubleSided: true,
        specIntensity: 0.05
      };
      this.skidCount = 0;
    }

    _initPetals() {
      // 180 лепестков сакуры, кружащихся в ночном воздухе вокруг машины
      for (let i = 0; i < 180; i++) {
        this.petals.push({
          x: (Math.random() - 0.5) * 65,
          y: 0.5 + Math.random() * 14,
          z: (Math.random() - 0.5) * 65,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -0.55 - Math.random() * 0.85,
          vz: (Math.random() - 0.5) * 1.4,
          size: 0.22 + Math.random() * 0.20,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 3.5,
          r: 1.0,
          g: 0.68 + Math.random() * 0.22,
          b: 0.84 + Math.random() * 0.14,
          a: 0.85
        });
      }
    }

    clearTrackMarks() {
      this.smoke.length = 0;
      this.sparks.length = 0;
      this.flames.length = 0;
      this.skidCount = 0;
      this.skidHead = 0;
      this.prevRearL = null;
      this.prevRearR = null;
    }

    emitTireSmoke(pos, carVel, intensity, isGravel) {
      if (this.smoke.length > 260) return;
      const count = intensity > 0.65 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        this.smoke.push({
          x: pos[0] + (Math.random() - 0.5) * 0.25,
          y: pos[1] + 0.18,
          z: pos[2] + (Math.random() - 0.5) * 0.25,
          vx: carVel[0] * 0.16 + (Math.random() - 0.5) * 1.2,
          vy: 0.75 + Math.random() * 0.9,
          vz: carVel[2] * 0.16 + (Math.random() - 0.5) * 1.2,
          size: 0.65 + intensity * 0.55,
          grow: 2.1 + intensity * 1.6,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 1.8,
          life: 0,
          maxLife: 0.75 + intensity * 0.65,
          r: isGravel ? 0.58 : 0.90,
          g: isGravel ? 0.50 : 0.92,
          b: isGravel ? 0.42 : 0.97,
          a: 0.42 + intensity * 0.34
        });
      }
    }

    emitSparks(pos, count = 12) {
      for (let i = 0; i < count; i++) {
        if (this.sparks.length > 180) break;
        this.sparks.push({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: (Math.random() - 0.5) * 12,
          vy: 2.0 + Math.random() * 6.5,
          vz: (Math.random() - 0.5) * 12,
          size: 0.18 + Math.random() * 0.20,
          angle: Math.random() * Math.PI * 2,
          life: 0,
          maxLife: 0.28 + Math.random() * 0.35,
          r: 1.0,
          g: 0.72 + Math.random() * 0.25,
          b: 0.22,
          a: 1.0
        });
      }
    }

    emitExhaustFlame(exhaustList, yaw, flameColor) {
      const bx = -Math.sin(yaw);
      const bz = -Math.cos(yaw);
      for (const e of exhaustList) {
        for (let i = 0; i < 3; i++) {
          this.flames.push({
            x: e[0] + bx * (i * 0.14),
            y: e[1],
            z: e[2] + bz * (i * 0.14),
            vx: bx * (3.5 + i * 2.2) + (Math.random() - 0.5) * 0.5,
            vy: 0.3 + Math.random() * 0.4,
            vz: bz * (3.5 + i * 2.2) + (Math.random() - 0.5) * 0.5,
            size: 0.42 - i * 0.08,
            angle: Math.random() * Math.PI * 2,
            life: 0,
            maxLife: 0.13 + Math.random() * 0.06,
            r: flameColor[0],
            g: flameColor[1],
            b: flameColor[2],
            a: 0.95
          });
        }
      }
    }

    _pushSkidQuad(p0, p1, rightX, rightZ) {
      const halfW = 0.15;
      const idx = this.skidHead;
      const base = idx * 32;
      const y0 = p0[1] - 0.04;
      const y1 = p1[1] - 0.04;

      const verts = [
        [p0[0] - rightX * halfW, y0, p0[2] - rightZ * halfW, 0, 0],
        [p0[0] + rightX * halfW, y0, p0[2] + rightZ * halfW, 1, 0],
        [p1[0] + rightX * halfW, y1, p1[2] + rightZ * halfW, 1, 1],
        [p1[0] - rightX * halfW, y1, p1[2] - rightZ * halfW, 0, 1]
      ];
      for (let k = 0; k < 4; k++) {
        const o = base + k * 8;
        this.skidVerts[o] = verts[k][0];
        this.skidVerts[o + 1] = verts[k][1];
        this.skidVerts[o + 2] = verts[k][2];
        this.skidVerts[o + 3] = 0;
        this.skidVerts[o + 4] = 1;
        this.skidVerts[o + 5] = 0;
        this.skidVerts[o + 6] = verts[k][3];
        this.skidVerts[o + 7] = verts[k][4];
      }

      this.skidHead = (this.skidHead + 1) % this.maxSkids;
      this.skidCount = Math.min(this.maxSkids, this.skidCount + 1);
      this.skidDirty = true;
    }

    update(dt, carState, anchors, isGarage) {
      // 1. Следы шин и дым из-под задних колёс
      if (!isGarage && carState && anchors) {
        const slipPower = Math.min(1, (Math.abs(carState.driftAngleDeg) / 38) * (carState.speedKmh > 18 ? 1 : 0) + carState.wheelSpin * 0.85);
        this.skidTimer += dt;

        if (slipPower > 0.22 && carState.speedKmh > 10) {
          const smokeInt = Math.min(1, slipPower * (0.65 + carState.tireTemp * 0.55));
          if (Math.random() < 0.72) {
            this.emitTireSmoke(anchors.rearLeft, [carState.vx, 0, carState.vz], smokeInt, carState.onGravel);
            this.emitTireSmoke(anchors.rearRight, [carState.vx, 0, carState.vz], smokeInt, carState.onGravel);
          }

          if (!carState.onGravel && this.skidTimer > 0.032) {
            this.skidTimer = 0;
            const rx = Math.cos(carState.yaw);
            const rz = -Math.sin(carState.yaw);
            if (this.prevRearL) {
              const distL = Math.hypot(anchors.rearLeft[0] - this.prevRearL[0], anchors.rearLeft[2] - this.prevRearL[2]);
              if (distL > 0.15 && distL < 4.5) {
                this._pushSkidQuad(this.prevRearL, anchors.rearLeft, rx, rz);
                this._pushSkidQuad(this.prevRearR, anchors.rearRight, rx, rz);
              }
            }
            this.prevRearL = new Float32Array(anchors.rearLeft);
            this.prevRearR = new Float32Array(anchors.rearRight);
          }
        } else {
          this.prevRearL = null;
          this.prevRearR = null;
        }
      }

      // 2. Обновление дыма
      for (let i = this.smoke.length - 1; i >= 0; i--) {
        const p = this.smoke[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.smoke.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.size += p.grow * dt;
        p.angle += p.spin * dt;
        const k = 1 - p.life / p.maxLife;
        p.a = k * k * 0.52;
      }

      // 3. Обновление искр
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const p = this.sparks[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.sparks.splice(i, 1);
          continue;
        }
        p.vy -= 18 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.a = 1 - p.life / p.maxLife;
      }

      // 4. Обновление пламени выхлопа
      for (let i = this.flames.length - 1; i >= 0; i--) {
        const p = this.flames[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.flames.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.size += 1.1 * dt;
        p.a = 1 - p.life / p.maxLife;
      }

      // 5. Лепестки сакуры (кружатся в воздухе и завихряются позади дрифтующей машины)
      const cx = carState ? carState.x : 0;
      const cy = carState ? carState.y : 0;
      const cz = carState ? carState.z : 0;
      const carSpd = carState ? Math.hypot(carState.vx, carState.vz) : 0;

      for (const p of this.petals) {
        p.angle += p.spin * dt;
        p.x += (p.vx + Math.sin(p.angle * 1.5) * 0.65) * dt;
        p.y += p.vy * dt;
        p.z += (p.vz + Math.cos(p.angle * 1.3) * 0.65) * dt;

        // Аэродинамическое завихрение за машиной
        if (!isGarage && carSpd > 6) {
          const dx = p.x - cx;
          const dy = p.y - (cy + 0.8);
          const dz = p.z - cz;
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq < 32 && dSq > 0.4) {
            const boost = (1 - dSq / 32) * carSpd * 0.35 * dt;
            p.vx += (dx * 0.4 - carState.vx * 0.08) * boost;
            p.vy += (1.8 + Math.random()) * boost;
            p.vz += (dz * 0.4 - carState.vz * 0.08) * boost;
          }
        }
        // Плавное затухание вихря
        p.vx *= 0.985;
        p.vz *= 0.985;
        p.vy = Math.max(-1.6, p.vy - 0.5 * dt);

        // Респаун лепестков в объёме вокруг машины
        if (p.y < cy - 1.5 || Math.abs(p.x - cx) > 36 || Math.abs(p.z - cz) > 36) {
          p.x = cx + (Math.random() - 0.5) * 64;
          p.z = cz + (Math.random() - 0.5) * 64;
          p.y = cy + 6 + Math.random() * 12;
          p.vx = (Math.random() - 0.5) * 1.4;
          p.vy = -0.55 - Math.random() * 0.8;
          p.vz = (Math.random() - 0.5) * 1.4;
        }
      }
    }

    render() {
      const r = this.renderer;
      const gl = r.gl;

      // Следы протектора на асфальте
      if (this.skidCount > 0) {
        if (this.skidDirty) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.skidVBO);
          gl.bufferData(gl.ARRAY_BUFFER, this.skidVerts.subarray(0, this.skidCount * 32), gl.DYNAMIC_DRAW);
          this.skidMesh.indexCount = this.skidCount * 6;
          this.skidDirty = false;
        }
        r.drawMesh(this.skidMesh, this.identityMat, this.skidMat);
      }

      // Биллборд-частицы
      r.drawParticles(this.smoke, this.textures.smoke, false);
      r.drawParticles(this.petals, this.textures.petal, false);
      r.drawParticles(this.sparks, this.textures.spark, true);
      r.drawParticles(this.flames, this.textures.spark, true);
    }
  }

  global.ParticleManager = ParticleManager;
})(window);
