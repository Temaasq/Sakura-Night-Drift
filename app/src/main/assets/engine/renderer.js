// engine/renderer.js — Полноценный 3D WebGL-рендерер (фары, неон, туман, отражения, частицы)
(function (global) {
  'use strict';

  const { Mat4, Vec3 } = global.Math3D;
  const MAX_POINT_LIGHTS = 6;

  // --- Основной 3D шейдер с направленным светом, 2 прожекторами фар, 6 точечными огнями неона и туманом ---
  const MAIN_VS = `
    attribute vec3 aPos;
    attribute vec3 aNorm;
    attribute vec2 aUV;

    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    uniform mat3 uNormalMat;
    uniform vec2 uUVScale;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;

    void main() {
      vec4 worldPos = uModel * vec4(aPos, 1.0);
      vWorldPos = worldPos.xyz;
      vNormal = normalize(uNormalMat * aNorm);
      vUV = aUV * uUVScale;
      gl_Position = uProj * uView * worldPos;
    }
  `;

  const MAIN_FS = `
    precision mediump float;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUV;

    uniform vec3 uCamPos;
    uniform vec4 uColor;
    uniform vec3 uEmissive;
    uniform float uSpecPower;
    uniform float uSpecIntensity;
    uniform float uUseTex;
    uniform sampler2D uTex;

    // Лунный свет и ночное небо
    uniform vec3 uDirLightDir;
    uniform vec3 uDirLightColor;
    uniform vec3 uSkyAmbient;
    uniform vec3 uGroundAmbient;

    // Фары машины (2 прожектора SpotLight)
    uniform vec3 uHeadPos[2];
    uniform vec3 uHeadDir;
    uniform vec3 uHeadColor;
    uniform float uHeadEnabled;

    // Точечные источники света (фонари, неон, подсветка днища, стоп-сигналы)
    uniform vec3 uPointPos[${MAX_POINT_LIGHTS}];
    uniform vec3 uPointColor[${MAX_POINT_LIGHTS}];
    uniform float uPointRange[${MAX_POINT_LIGHTS}];

    // Ночной туман
    uniform vec3 uFogColor;
    uniform float uFogDensity;

    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uCamPos - vWorldPos);

      vec4 baseCol = uColor;
      if (uUseTex > 0.5) {
        baseCol *= texture2D(uTex, vUV);
      }

      // Полусферическое ночное освещение
      float hemi = N.y * 0.5 + 0.5;
      vec3 lighting = mix(uGroundAmbient, uSkyAmbient, hemi);

      // Направленный лунный свет
      vec3 L = normalize(-uDirLightDir);
      float ndl = max(dot(N, L), 0.0);
      lighting += uDirLightColor * ndl;

      vec3 specAccum = vec3(0.0);
      if (ndl > 0.0 && uSpecIntensity > 0.01) {
        vec3 H = normalize(L + V);
        float sp = pow(max(dot(N, H), 0.0), uSpecPower);
        specAccum += uDirLightColor * sp * uSpecIntensity * 0.5;
      }

      // Прожекторы фар автомобиля
      if (uHeadEnabled > 0.5) {
        for (int i = 0; i < 2; i++) {
          vec3 toFrag = vWorldPos - uHeadPos[i];
          float dist = length(toFrag);
          if (dist < 68.0) {
            vec3 lightToFrag = toFrag / max(dist, 0.001);
            float cosAng = dot(lightToFrag, normalize(uHeadDir));
            float spot = smoothstep(0.74, 0.94, cosAng);
            if (spot > 0.001) {
              float atten = 1.0 / (1.0 + 0.022 * dist + 0.0022 * dist * dist);
              vec3 Lp = -lightToFrag;
              float diff = max(dot(N, Lp), 0.15);
              vec3 contrib = uHeadColor * spot * atten * 3.2;
              lighting += contrib * diff;
              if (uSpecIntensity > 0.01) {
                vec3 H = normalize(Lp + V);
                float sp = pow(max(dot(N, H), 0.0), uSpecPower);
                specAccum += contrib * sp * uSpecIntensity * 0.85;
              }
            }
          }
        }
      }

      // Точечные огни (фонари, неон, подсветка днища, стопы)
      for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
        float range = uPointRange[i];
        if (range > 0.1) {
          vec3 toL = uPointPos[i] - vWorldPos;
          float dist = length(toL);
          if (dist < range) {
            float atten = clamp(1.0 - dist / range, 0.0, 1.0);
            atten = atten * atten;
            vec3 Lp = toL / max(dist, 0.001);
            float diff = max(dot(N, Lp), 0.2);
            vec3 contrib = uPointColor[i] * atten;
            lighting += contrib * diff;
            if (uSpecIntensity > 0.01) {
              vec3 H = normalize(Lp + V);
              float sp = pow(max(dot(N, H), 0.0), uSpecPower);
              specAccum += contrib * sp * uSpecIntensity * 0.65;
            }
          }
        }
      }

      // Лёгкий неоновый френель на глянцевых кузовах и мокром асфальте
      float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uSpecIntensity * 0.18;
      vec3 finalColor = baseCol.rgb * lighting + specAccum + uEmissive + vec3(0.45, 0.25, 0.65) * fresnel;

      // Экспоненциальный ночной туман
      float camDist = length(uCamPos - vWorldPos);
      float fogFactor = clamp(exp(-pow(camDist * uFogDensity, 1.45)), 0.0, 1.0);
      finalColor = mix(uFogColor, finalColor, fogFactor);

      gl_FragColor = vec4(finalColor, baseCol.a);
    }
  `;

  // --- Шейдер биллборд-частиц (дым, лепестки сакуры, искры, огонь выхлопа) ---
  const PARTICLE_VS = `
    attribute vec3 aPos;
    attribute vec2 aCorner;
    attribute float aSize;
    attribute float aAngle;
    attribute vec4 aColor;

    uniform mat4 uProj;
    uniform mat4 uView;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;

    varying vec2 vUV;
    varying vec4 vColor;

    void main() {
      float c = cos(aAngle);
      float s = sin(aAngle);
      vec2 rot = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
      vec3 worldPos = aPos + (uCamRight * rot.x + uCamUp * rot.y) * aSize;
      vUV = aCorner + 0.5;
      vColor = aColor;
      gl_Position = uProj * uView * vec4(worldPos, 1.0);
    }
  `;

  const PARTICLE_FS = `
    precision mediump float;
    varying vec2 vUV;
    varying vec4 vColor;
    uniform sampler2D uTex;
    void main() {
      vec4 tex = texture2D(uTex, vUV);
      vec4 col = tex * vColor;
      if (col.a < 0.01) discard;
      gl_FragColor = col;
    }
  `;

  // --- Шейдер ночного неба со звёздами и неоновым горизонтом ---
  const SKY_VS = `
    attribute vec2 aPos;
    varying vec2 vPos;
    void main() {
      vPos = aPos;
      gl_Position = vec4(aPos, 0.9999, 1.0);
    }
  `;

  const SKY_FS = `
    precision mediump float;
    varying vec2 vPos;
    uniform float uYaw;
    uniform float uPitch;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      float h = clamp(vPos.y * 0.5 + 0.5 + uPitch * 0.45, 0.0, 1.0);
      vec3 zenith = vec3(0.02, 0.03, 0.09);
      vec3 midSky = vec3(0.07, 0.06, 0.18);
      vec3 horizon = vec3(0.22, 0.09, 0.24);
      vec3 col = mix(horizon, midSky, smoothstep(0.42, 0.68, h));
      col = mix(col, zenith, smoothstep(0.65, 1.0, h));

      // Силуэт дальних японских гор
      float ang = vPos.x * 1.15 - uYaw;
      float mtn = 0.48 + 0.055 * sin(ang * 3.0) + 0.03 * sin(ang * 7.3 + 1.2) + 0.015 * cos(ang * 15.0);
      if (h < mtn) {
        col = mix(vec3(0.04, 0.03, 0.09), vec3(0.11, 0.05, 0.15), smoothstep(0.35, mtn, h));
      } else {
        // Звёзды
        vec2 starGrid = floor(vec2(ang * 90.0, h * 90.0));
        float r = hash(starGrid);
        if (r > 0.992 && h > 0.56) {
          float b = (r - 0.992) * 125.0;
          col += vec3(0.85, 0.9, 1.0) * b * smoothstep(0.56, 0.72, h);
        }
        // Луна
        float moonDist = length(vec2(fract((ang + 1.8) / 6.28318) - 0.5, (h - 0.78) * 0.6));
        col += vec3(0.95, 0.88, 1.0) * smoothstep(0.042, 0.022, moonDist) * 0.85;
        col += vec3(0.38, 0.25, 0.55) * smoothstep(0.16, 0.02, moonDist) * 0.28;
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  // --- Утилиты генерации 3D геометрии ---
  const Geometry = {
    createBox(w, h, d, ox = 0, oy = 0, oz = 0) {
      const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;
      const faces = [
        // +Z (front)
        { n: [0, 0, 1], v: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
        // -Z (back)
        { n: [0, 0, -1], v: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
        // +Y (top)
        { n: [0, 1, 0], v: [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]] },
        // -Y (bottom)
        { n: [0, -1, 0], v: [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]] },
        // +X (right)
        { n: [1, 0, 0], v: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
        // -X (left)
        { n: [-1, 0, 0], v: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] }
      ];
      const pos = [], norm = [], uv = [], idx = [];
      let base = 0;
      for (const f of faces) {
        for (let i = 0; i < 4; i++) {
          pos.push(f.v[i][0] + ox, f.v[i][1] + oy, f.v[i][2] + oz);
          norm.push(f.n[0], f.n[1], f.n[2]);
        }
        uv.push(0, 1, 1, 1, 1, 0, 0, 0);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
      return { positions: pos, normals: norm, uvs: uv, indices: idx };
    },

    // Трапециевидный/скошенный кузовной блок (для капота, кабины, стёкол, обвесов)
    createTaperedBox(wBot, wTop, h, dBot, dTop, zShiftTop = 0, ox = 0, oy = 0, oz = 0) {
      const hwb = wBot * 0.5, hwt = wTop * 0.5;
      const hdb = dBot * 0.5, hdt = dTop * 0.5;
      const hh = h * 0.5;
      const b0 = [-hwb, -hh, hdb], b1 = [hwb, -hh, hdb], b2 = [hwb, -hh, -hdb], b3 = [-hwb, -hh, -hdb];
      const t0 = [-hwt, hh, hdt + zShiftTop], t1 = [hwt, hh, hdt + zShiftTop], t2 = [hwt, hh, -hdt + zShiftTop], t3 = [-hwt, hh, -hdt + zShiftTop];

      const quads = [
        [b0, b1, t1, t0], // front
        [b2, b3, t3, t2], // back
        [t0, t1, t2, t3], // top
        [b3, b2, b1, b0], // bottom
        [b1, b2, t2, t1], // right
        [b3, b0, t0, t3]  // left
      ];

      const pos = [], norm = [], uv = [], idx = [];
      let base = 0;
      for (const q of quads) {
        const ax = q[1][0] - q[0][0], ay = q[1][1] - q[0][1], az = q[1][2] - q[0][2];
        const bx = q[3][0] - q[0][0], by = q[3][1] - q[0][1], bz = q[3][2] - q[0][2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        for (let i = 0; i < 4; i++) {
          pos.push(q[i][0] + ox, q[i][1] + oy, q[i][2] + oz);
          norm.push(nx, ny, nz);
        }
        uv.push(0, 1, 1, 1, 1, 0, 0, 0);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
      return { positions: pos, normals: norm, uvs: uv, indices: idx };
    },

    // Цилиндр вдоль оси X (для колёс) или оси Y (для столбов, стволов сакуры, глушителей)
    createCylinder(rTop, rBot, length, segs = 16, axis = 'y', ox = 0, oy = 0, oz = 0) {
      const pos = [], norm = [], uv = [], idx = [];
      const half = length * 0.5;
      let base = 0;

      // Боковая поверхность
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const u = i / segs;
        if (axis === 'x') {
          pos.push(ox - half, oy + ca * rBot, oz + sa * rBot);
          norm.push(0, ca, sa); uv.push(u, 0);
          pos.push(ox + half, oy + ca * rTop, oz + sa * rTop);
          norm.push(0, ca, sa); uv.push(u, 1);
        } else if (axis === 'z') {
          pos.push(ox + ca * rBot, oy + sa * rBot, oz - half);
          norm.push(ca, sa, 0); uv.push(u, 0);
          pos.push(ox + ca * rTop, oy + sa * rTop, oz + half);
          norm.push(ca, sa, 0); uv.push(u, 1);
        } else {
          pos.push(ox + ca * rBot, oy - half, oz + sa * rBot);
          norm.push(ca, 0, sa); uv.push(u, 0);
          pos.push(ox + ca * rTop, oy + half, oz + sa * rTop);
          norm.push(ca, 0, sa); uv.push(u, 1);
        }
      }
      for (let i = 0; i < segs; i++) {
        const i0 = base + i * 2;
        idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
      }
      base += (segs + 1) * 2;

      // Крышки
      const caps = [
        { sign: -1, r: rBot },
        { sign: 1, r: rTop }
      ];
      for (const cap of caps) {
        const centerIdx = base;
        if (axis === 'x') {
          pos.push(ox + cap.sign * half, oy, oz);
          norm.push(cap.sign, 0, 0);
        } else if (axis === 'z') {
          pos.push(ox, oy, oz + cap.sign * half);
          norm.push(0, 0, cap.sign);
        } else {
          pos.push(ox, oy + cap.sign * half, oz);
          norm.push(0, cap.sign, 0);
        }
        uv.push(0.5, 0.5);
        base++;

        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          if (axis === 'x') {
            pos.push(ox + cap.sign * half, oy + ca * cap.r, oz + sa * cap.r);
            norm.push(cap.sign, 0, 0);
          } else if (axis === 'z') {
            pos.push(ox + ca * cap.r, oy + sa * cap.r, oz + cap.sign * half);
            norm.push(0, 0, cap.sign);
          } else {
            pos.push(ox + ca * cap.r, oy + cap.sign * half, oz + sa * cap.r);
            norm.push(0, cap.sign, 0);
          }
          uv.push(0.5 + ca * 0.5, 0.5 + sa * 0.5);
        }
        for (let i = 0; i < segs; i++) {
          if (cap.sign > 0) {
            idx.push(centerIdx, base + i, base + i + 1);
          } else {
            idx.push(centerIdx, base + i + 1, base + i);
          }
        }
        base += segs + 1;
      }

      return { positions: pos, normals: norm, uvs: uv, indices: idx };
    },

    // Сфера (для крон деревьев сакуры и плафонов фонарей)
    createSphere(radius, latSegs = 7, lonSegs = 10, ox = 0, oy = 0, oz = 0, sy = 1) {
      const pos = [], norm = [], uv = [], idx = [];
      for (let y = 0; y <= latSegs; y++) {
        const v = y / latSegs;
        const theta = v * Math.PI;
        const st = Math.sin(theta), ct = Math.cos(theta);
        for (let x = 0; x <= lonSegs; x++) {
          const u = x / lonSegs;
          const phi = u * Math.PI * 2;
          const sp = Math.sin(phi), cp = Math.cos(phi);
          const nx = cp * st, ny = ct, nz = sp * st;
          pos.push(ox + nx * radius, oy + ny * radius * sy, oz + nz * radius);
          norm.push(nx, ny, nz);
          uv.push(u, v);
        }
      }
      for (let y = 0; y < latSegs; y++) {
        for (let x = 0; x < lonSegs; x++) {
          const a = y * (lonSegs + 1) + x;
          const b = a + lonSegs + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions: pos, normals: norm, uvs: uv, indices: idx };
    },

    // Объединение нескольких геометрических примитивов в один меш (экономия draw calls)
    merge(list) {
      const pos = [], norm = [], uv = [], idx = [];
      let offset = 0;
      for (const g of list) {
        for (let i = 0; i < g.positions.length; i++) pos.push(g.positions[i]);
        for (let i = 0; i < g.normals.length; i++) norm.push(g.normals[i]);
        for (let i = 0; i < g.uvs.length; i++) uv.push(g.uvs[i]);
        for (let i = 0; i < g.indices.length; i++) idx.push(g.indices[i] + offset);
        offset += g.positions.length / 3;
      }
      return { positions: pos, normals: norm, uvs: uv, indices: idx };
    }
  };

  class Renderer3D {
    constructor(canvas) {
      this.canvas = canvas;
      const opts = { antialias: true, alpha: false, powerPreference: 'high-performance' };
      this.gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!this.gl) {
        throw new Error('WebGL не поддерживается на этом устройстве.');
      }
      const gl = this.gl;
      this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      this.extUint = this.isWebGL2 ? true : !!gl.getExtension('OES_element_index_uint');

      this.mainProg = createProgram(gl, MAIN_VS, MAIN_FS);
      this.particleProg = createProgram(gl, PARTICLE_VS, PARTICLE_FS);
      this.skyProg = createProgram(gl, SKY_VS, SKY_FS);

      this._cacheLocations();
      this._initSkyBuffer();
      this._initParticleBuffers();

      this.projMat = Mat4.create();
      this.viewMat = Mat4.create();
      this.normMat = new Float32Array(9);
      this.camPos = Vec3.create(0, 3, -8);
      this.camRight = Vec3.create(1, 0, 0);
      this.camUp = Vec3.create(0, 1, 0);
      this.camYaw = 0;
      this.camPitch = 0;
      this.fovDeg = 62;

      // Освещение сцены
      this.fogColor = [0.06, 0.04, 0.12];
      this.fogDensity = 0.0046;
      this.dirLightDir = [-0.35, -0.75, 0.45];
      this.dirLightColor = [0.56, 0.62, 0.90];
      this.skyAmbient = [0.34, 0.30, 0.50];
      this.groundAmbient = [0.09, 0.07, 0.12];

      this.headPos = new Float32Array(6);
      this.headDir = new Float32Array([0, -0.18, 1]);
      this.headColor = new Float32Array([0.92, 0.96, 1.0]);
      this.headEnabled = 1.0;

      this.pointPos = new Float32Array(MAX_POINT_LIGHTS * 3);
      this.pointColor = new Float32Array(MAX_POINT_LIGHTS * 3);
      this.pointRange = new Float32Array(MAX_POINT_LIGHTS);

      this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      this.resize();

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }

    _cacheLocations() {
      const gl = this.gl;
      const m = this.mainProg;
      this.loc = {
        aPos: gl.getAttribLocation(m, 'aPos'),
        aNorm: gl.getAttribLocation(m, 'aNorm'),
        aUV: gl.getAttribLocation(m, 'aUV'),
        uProj: gl.getUniformLocation(m, 'uProj'),
        uView: gl.getUniformLocation(m, 'uView'),
        uModel: gl.getUniformLocation(m, 'uModel'),
        uNormalMat: gl.getUniformLocation(m, 'uNormalMat'),
        uUVScale: gl.getUniformLocation(m, 'uUVScale'),
        uCamPos: gl.getUniformLocation(m, 'uCamPos'),
        uColor: gl.getUniformLocation(m, 'uColor'),
        uEmissive: gl.getUniformLocation(m, 'uEmissive'),
        uSpecPower: gl.getUniformLocation(m, 'uSpecPower'),
        uSpecIntensity: gl.getUniformLocation(m, 'uSpecIntensity'),
        uUseTex: gl.getUniformLocation(m, 'uUseTex'),
        uTex: gl.getUniformLocation(m, 'uTex'),
        uDirLightDir: gl.getUniformLocation(m, 'uDirLightDir'),
        uDirLightColor: gl.getUniformLocation(m, 'uDirLightColor'),
        uSkyAmbient: gl.getUniformLocation(m, 'uSkyAmbient'),
        uGroundAmbient: gl.getUniformLocation(m, 'uGroundAmbient'),
        uHeadPos: gl.getUniformLocation(m, 'uHeadPos'),
        uHeadDir: gl.getUniformLocation(m, 'uHeadDir'),
        uHeadColor: gl.getUniformLocation(m, 'uHeadColor'),
        uHeadEnabled: gl.getUniformLocation(m, 'uHeadEnabled'),
        uPointPos: gl.getUniformLocation(m, 'uPointPos'),
        uPointColor: gl.getUniformLocation(m, 'uPointColor'),
        uPointRange: gl.getUniformLocation(m, 'uPointRange'),
        uFogColor: gl.getUniformLocation(m, 'uFogColor'),
        uFogDensity: gl.getUniformLocation(m, 'uFogDensity')
      };

      const p = this.particleProg;
      this.ploc = {
        aPos: gl.getAttribLocation(p, 'aPos'),
        aCorner: gl.getAttribLocation(p, 'aCorner'),
        aSize: gl.getAttribLocation(p, 'aSize'),
        aAngle: gl.getAttribLocation(p, 'aAngle'),
        aColor: gl.getAttribLocation(p, 'aColor'),
        uProj: gl.getUniformLocation(p, 'uProj'),
        uView: gl.getUniformLocation(p, 'uView'),
        uCamRight: gl.getUniformLocation(p, 'uCamRight'),
        uCamUp: gl.getUniformLocation(p, 'uCamUp'),
        uTex: gl.getUniformLocation(p, 'uTex')
      };

      const s = this.skyProg;
      this.sloc = {
        aPos: gl.getAttribLocation(s, 'aPos'),
        uYaw: gl.getUniformLocation(s, 'uYaw'),
        uPitch: gl.getUniformLocation(s, 'uPitch')
      };
    }

    _initSkyBuffer() {
      const gl = this.gl;
      this.skyVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
      ]), gl.STATIC_DRAW);
    }

    _initParticleBuffers() {
      const gl = this.gl;
      this.maxBatchParticles = 600;
      // 4 вершины на частицу, 11 float на вершину: pos(3), corner(2), size(1), angle(1), color(4)
      this.pVertData = new Float32Array(this.maxBatchParticles * 4 * 11);
      const pIdx = new Uint16Array(this.maxBatchParticles * 6);
      for (let i = 0; i < this.maxBatchParticles; i++) {
        const v = i * 4;
        const o = i * 6;
        pIdx[o] = v; pIdx[o + 1] = v + 1; pIdx[o + 2] = v + 2;
        pIdx[o + 3] = v; pIdx[o + 4] = v + 2; pIdx[o + 5] = v + 3;
      }
      this.pVBO = gl.createBuffer();
      this.pIBO = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.pIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pIdx, gl.STATIC_DRAW);
    }

    setQuality(quality) {
      const dpr = window.devicePixelRatio || 1;
      if (quality === 'low') this.pixelRatio = Math.min(dpr, 1.0);
      else if (quality === 'high') this.pixelRatio = Math.min(dpr, 2.0);
      else this.pixelRatio = Math.min(dpr, 1.45);
      this.resize();
    }

    resize() {
      const w = Math.max(320, Math.floor(window.innerWidth * this.pixelRatio));
      const h = Math.max(200, Math.floor(window.innerHeight * this.pixelRatio));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
      this.aspect = w / h;
    }

    createTextureFromCanvas(canvas, repeat = true, mipmap = true) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (mipmap) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    }

    createMesh(geo) {
      const gl = this.gl;
      const vCount = geo.positions.length / 3;
      const interleaved = new Float32Array(vCount * 8);
      for (let i = 0; i < vCount; i++) {
        const o = i * 8;
        interleaved[o] = geo.positions[i * 3];
        interleaved[o + 1] = geo.positions[i * 3 + 1];
        interleaved[o + 2] = geo.positions[i * 3 + 2];
        interleaved[o + 3] = geo.normals[i * 3];
        interleaved[o + 4] = geo.normals[i * 3 + 1];
        interleaved[o + 5] = geo.normals[i * 3 + 2];
        interleaved[o + 6] = geo.uvs[i * 2];
        interleaved[o + 7] = geo.uvs[i * 2 + 1];
      }
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);

      const useUint32 = this.extUint && vCount > 65535;
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        useUint32 ? new Uint32Array(geo.indices) : new Uint16Array(geo.indices),
        gl.STATIC_DRAW
      );

      return {
        vbo,
        ibo,
        indexCount: geo.indices.length,
        indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
      };
    }

    setCamera(eye, target, fovDeg = 62) {
      Vec3.copy(this.camPos, eye);
      this.fovDeg = fovDeg;
      Mat4.perspective(this.projMat, fovDeg * Math.PI / 180, this.aspect, 0.18, 420.0);
      Mat4.lookAt(this.viewMat, eye, target, [0, 1, 0]);

      // Вычисляем векторы камеры для биллбордов и неба
      this.camRight[0] = this.viewMat[0];
      this.camRight[1] = this.viewMat[4];
      this.camRight[2] = this.viewMat[8];
      this.camUp[0] = this.viewMat[1];
      this.camUp[1] = this.viewMat[5];
      this.camUp[2] = this.viewMat[9];

      const dx = target[0] - eye[0];
      const dy = target[1] - eye[1];
      const dz = target[2] - eye[2];
      this.camYaw = Math.atan2(dx, dz);
      this.camPitch = Math.atan2(dy, Math.hypot(dx, dz));
    }

    setHeadlights(leftPos, rightPos, dir, color, enabled = true) {
      this.headPos[0] = leftPos[0]; this.headPos[1] = leftPos[1]; this.headPos[2] = leftPos[2];
      this.headPos[3] = rightPos[0]; this.headPos[4] = rightPos[1]; this.headPos[5] = rightPos[2];
      this.headDir[0] = dir[0]; this.headDir[1] = dir[1]; this.headDir[2] = dir[2];
      if (color) {
        this.headColor[0] = color[0]; this.headColor[1] = color[1]; this.headColor[2] = color[2];
      }
      this.headEnabled = enabled ? 1.0 : 0.0;
    }

    setPointLights(lights) {
      this.pointRange.fill(0);
      const count = Math.min(lights.length, MAX_POINT_LIGHTS);
      for (let i = 0; i < count; i++) {
        const l = lights[i];
        this.pointPos[i * 3] = l.x;
        this.pointPos[i * 3 + 1] = l.y;
        this.pointPos[i * 3 + 2] = l.z;
        this.pointColor[i * 3] = l.r;
        this.pointColor[i * 3 + 1] = l.g;
        this.pointColor[i * 3 + 2] = l.b;
        this.pointRange[i] = l.range;
      }
    }

    beginFrame() {
      const gl = this.gl;
      gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // 1. Отрисовка ночного неба
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.skyProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
      gl.enableVertexAttribArray(this.sloc.aPos);
      gl.vertexAttribPointer(this.sloc.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(this.sloc.uYaw, this.camYaw);
      gl.uniform1f(this.sloc.uPitch, this.camPitch);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(this.sloc.aPos);

      // 2. Подготовка основного 3D шейдера
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.useProgram(this.mainProg);

      const L = this.loc;
      gl.uniformMatrix4fv(L.uProj, false, this.projMat);
      gl.uniformMatrix4fv(L.uView, false, this.viewMat);
      gl.uniform3fv(L.uCamPos, this.camPos);
      gl.uniform3fv(L.uDirLightDir, this.dirLightDir);
      gl.uniform3fv(L.uDirLightColor, this.dirLightColor);
      gl.uniform3fv(L.uSkyAmbient, this.skyAmbient);
      gl.uniform3fv(L.uGroundAmbient, this.groundAmbient);
      gl.uniform3fv(L.uHeadPos, this.headPos);
      gl.uniform3fv(L.uHeadDir, this.headDir);
      gl.uniform3fv(L.uHeadColor, this.headColor);
      gl.uniform1f(L.uHeadEnabled, this.headEnabled);
      gl.uniform3fv(L.uPointPos, this.pointPos);
      gl.uniform3fv(L.uPointColor, this.pointColor);
      gl.uniform1fv(L.uPointRange, this.pointRange);
      gl.uniform3fv(L.uFogColor, this.fogColor);
      gl.uniform1f(L.uFogDensity, this.fogDensity);
      gl.uniform1i(L.uTex, 0);
    }

    drawMesh(mesh, modelMat, mat) {
      const gl = this.gl;
      const L = this.loc;

      if (mat.doubleSided) gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);

      if (mat.transparent || mat.additive) {
        gl.enable(gl.BLEND);
        gl.depthMask(false);
        if (mat.additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }

      Mat4.normalMatrix3(this.normMat, modelMat);
      gl.uniformMatrix4fv(L.uModel, false, modelMat);
      gl.uniformMatrix3fv(L.uNormalMat, false, this.normMat);

      const c = mat.color || [1, 1, 1, 1];
      gl.uniform4f(L.uColor, c[0], c[1], c[2], c.length > 3 ? c[3] : 1.0);
      const em = mat.emissive || [0, 0, 0];
      gl.uniform3f(L.uEmissive, em[0], em[1], em[2]);
      gl.uniform1f(L.uSpecPower, mat.specPower || 32.0);
      gl.uniform1f(L.uSpecIntensity, mat.specIntensity !== undefined ? mat.specIntensity : 0.45);
      const uvs = mat.uvScale || [1, 1];
      gl.uniform2f(L.uUVScale, uvs[0], uvs[1]);

      if (mat.texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, mat.texture);
        gl.uniform1f(L.uUseTex, 1.0);
      } else {
        gl.uniform1f(L.uUseTex, 0.0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(L.aPos);
      gl.enableVertexAttribArray(L.aNorm);
      gl.enableVertexAttribArray(L.aUV);
      gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(L.aNorm, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 32, 24);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
    }

    drawParticles(list, texture, additive = false) {
      if (!list || list.length === 0) return;
      const gl = this.gl;
      const P = this.ploc;

      gl.useProgram(this.particleProg);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.uniformMatrix4fv(P.uProj, false, this.projMat);
      gl.uniformMatrix4fv(P.uView, false, this.viewMat);
      gl.uniform3fv(P.uCamRight, this.camRight);
      gl.uniform3fv(P.uCamUp, this.camUp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(P.uTex, 0);

      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      const count = Math.min(list.length, this.maxBatchParticles);
      const data = this.pVertData;

      for (let i = 0; i < count; i++) {
        const pt = list[i];
        const base = i * 44;
        for (let k = 0; k < 4; k++) {
          const o = base + k * 11;
          data[o] = pt.x;
          data[o + 1] = pt.y;
          data[o + 2] = pt.z;
          data[o + 3] = corners[k][0];
          data[o + 4] = corners[k][1];
          data[o + 5] = pt.size;
          data[o + 6] = pt.angle;
          data[o + 7] = pt.r;
          data[o + 8] = pt.g;
          data[o + 9] = pt.b;
          data[o + 10] = pt.a;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pVBO);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 44), gl.DYNAMIC_DRAW);

      gl.enableVertexAttribArray(P.aPos);
      gl.enableVertexAttribArray(P.aCorner);
      gl.enableVertexAttribArray(P.aSize);
      gl.enableVertexAttribArray(P.aAngle);
      gl.enableVertexAttribArray(P.aColor);

      const stride = 44;
      gl.vertexAttribPointer(P.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(P.aCorner, 2, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(P.aSize, 1, gl.FLOAT, false, stride, 20);
      gl.vertexAttribPointer(P.aAngle, 1, gl.FLOAT, false, stride, 24);
      gl.vertexAttribPointer(P.aColor, 4, gl.FLOAT, false, stride, 28);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.pIBO);
      gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_SHORT, 0);

      gl.disableVertexAttribArray(P.aPos);
      gl.disableVertexAttribArray(P.aCorner);
      gl.disableVertexAttribArray(P.aSize);
      gl.disableVertexAttribArray(P.aAngle);
      gl.disableVertexAttribArray(P.aColor);

      // Возвращаем основной шейдер и состояние глубины
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.useProgram(this.mainProg);
    }
  }

  global.Geometry = Geometry;
  global.Renderer3D = Renderer3D;
})(window);
