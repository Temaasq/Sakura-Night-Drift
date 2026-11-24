// engine/math3d.js — 3D математика: векторы, матрицы 4x4, кватернионы, сплайны и коллизии
(function (global) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function lerpAngle(a, b, t) {
    return a + wrapAngle(b - a) * t;
  }

  function damp(a, b, lambda, dt) {
    return lerp(a, b, 1 - Math.exp(-lambda * dt));
  }

  function dampAngle(a, b, lambda, dt) {
    return lerpAngle(a, b, 1 - Math.exp(-lambda * dt));
  }

  // --- Вектор 3D ---
  const Vec3 = {
    create(x = 0, y = 0, z = 0) {
      return new Float32Array([x, y, z]);
    },
    set(out, x, y, z) {
      out[0] = x; out[1] = y; out[2] = z;
      return out;
    },
    copy(out, a) {
      out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
      return out;
    },
    add(out, a, b) {
      out[0] = a[0] + b[0];
      out[1] = a[1] + b[1];
      out[2] = a[2] + b[2];
      return out;
    },
    sub(out, a, b) {
      out[0] = a[0] - b[0];
      out[1] = a[1] - b[1];
      out[2] = a[2] - b[2];
      return out;
    },
    scale(out, a, s) {
      out[0] = a[0] * s;
      out[1] = a[1] * s;
      out[2] = a[2] * s;
      return out;
    },
    addScaled(out, a, b, s) {
      out[0] = a[0] + b[0] * s;
      out[1] = a[1] + b[1] * s;
      out[2] = a[2] + b[2] * s;
      return out;
    },
    dot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    },
    cross(out, a, b) {
      const ax = a[0], ay = a[1], az = a[2];
      const bx = b[0], by = b[1], bz = b[2];
      out[0] = ay * bz - az * by;
      out[1] = az * bx - ax * bz;
      out[2] = ax * by - ay * bx;
      return out;
    },
    lengthSq(a) {
      return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    },
    length(a) {
      return Math.hypot(a[0], a[1], a[2]);
    },
    normalize(out, a) {
      const len = Math.hypot(a[0], a[1], a[2]);
      if (len > 1e-6) {
        const inv = 1 / len;
        out[0] = a[0] * inv;
        out[1] = a[1] * inv;
        out[2] = a[2] * inv;
      } else {
        out[0] = 0; out[1] = 0; out[2] = 0;
      }
      return out;
    },
    distSq(a, b) {
      const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
      return dx * dx + dy * dy + dz * dz;
    },
    lerp(out, a, b, t) {
      out[0] = a[0] + (b[0] - a[0]) * t;
      out[1] = a[1] + (b[1] - a[1]) * t;
      out[2] = a[2] + (b[2] - a[2]) * t;
      return out;
    }
  };

  // --- Кватернион ---
  const Quat = {
    create() {
      return new Float32Array([0, 0, 0, 1]);
    },
    fromEulerYXZ(out, yaw, pitch, roll) {
      const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
      const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
      const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);
      out[0] = cy * sp * cr + sy * cp * sr;
      out[1] = sy * cp * cr - cy * sp * sr;
      out[2] = cy * cp * sr - sy * sp * cr;
      out[3] = cy * cp * cr + sy * sp * sr;
      return out;
    },
    slerp(out, a, b, t) {
      let ax = a[0], ay = a[1], az = a[2], aw = a[3];
      let bx = b[0], by = b[1], bz = b[2], bw = b[3];
      let cosom = ax * bx + ay * by + az * bz + aw * bw;
      if (cosom < 0) {
        cosom = -cosom;
        bx = -bx; by = -by; bz = -bz; bw = -bw;
      }
      let s0, s1;
      if (1 - cosom > 1e-4) {
        const omega = Math.acos(clamp(cosom, -1, 1));
        const sinom = Math.sin(omega);
        s0 = Math.sin((1 - t) * omega) / sinom;
        s1 = Math.sin(t * omega) / sinom;
      } else {
        s0 = 1 - t;
        s1 = t;
      }
      out[0] = s0 * ax + s1 * bx;
      out[1] = s0 * ay + s1 * by;
      out[2] = s0 * az + s1 * bz;
      out[3] = s0 * aw + s1 * bw;
      return out;
    }
  };

  // --- Матрица 4x4 (column-major для WebGL) ---
  const Mat4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
      return m;
    },
    identity(out) {
      out.fill(0);
      out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
      return out;
    },
    copy(out, a) {
      out.set(a);
      return out;
    },
    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return out;
    },
    perspective(out, fovyRad, aspect, near, far) {
      const f = 1.0 / Math.tan(fovyRad * 0.5);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = (2 * far * near) * nf;
      return out;
    },
    lookAt(out, eye, target, up) {
      let zx = eye[0] - target[0];
      let zy = eye[1] - target[1];
      let zz = eye[2] - target[2];
      let len = Math.hypot(zx, zy, zz);
      if (len < 1e-6) { zz = 1; } else { zx /= len; zy /= len; zz /= len; }

      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      len = Math.hypot(xx, xy, xz);
      if (len < 1e-6) { xx = 1; xy = 0; xz = 0; } else { xx /= len; xy /= len; xz /= len; }

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      out[15] = 1;
      return out;
    },
    translate(out, a, x, y, z) {
      if (out !== a) out.set(a);
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
      return out;
    },
    scale(out, a, x, y, z) {
      out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
      out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
      out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
      out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
      return out;
    },
    rotateY(out, a, rad) {
      const s = Math.sin(rad), c = Math.cos(rad);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      if (out !== a) out.set(a);
      out[0] = a00 * c - a20 * s;
      out[1] = a01 * c - a21 * s;
      out[2] = a02 * c - a22 * s;
      out[3] = a03 * c - a23 * s;
      out[8] = a00 * s + a20 * c;
      out[9] = a01 * s + a21 * c;
      out[10] = a02 * s + a22 * c;
      out[11] = a03 * s + a23 * c;
      return out;
    },
    rotateX(out, a, rad) {
      const s = Math.sin(rad), c = Math.cos(rad);
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      if (out !== a) out.set(a);
      out[4] = a10 * c + a20 * s;
      out[5] = a11 * c + a21 * s;
      out[6] = a12 * c + a22 * s;
      out[7] = a13 * c + a23 * s;
      out[8] = a20 * c - a10 * s;
      out[9] = a21 * c - a11 * s;
      out[10] = a22 * c - a12 * s;
      out[11] = a23 * c - a13 * s;
      return out;
    },
    rotateZ(out, a, rad) {
      const s = Math.sin(rad), c = Math.cos(rad);
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      if (out !== a) out.set(a);
      out[0] = a00 * c + a10 * s;
      out[1] = a01 * c + a11 * s;
      out[2] = a02 * c + a12 * s;
      out[3] = a03 * c + a13 * s;
      out[4] = a10 * c - a00 * s;
      out[5] = a11 * c - a01 * s;
      out[6] = a12 * c - a02 * s;
      out[7] = a13 * c - a03 * s;
      return out;
    },
    fromTRS(out, tx, ty, tz, yaw, pitch, roll, sx = 1, sy = 1, sz = 1) {
      Mat4.identity(out);
      Mat4.translate(out, out, tx, ty, tz);
      if (yaw) Mat4.rotateY(out, out, yaw);
      if (pitch) Mat4.rotateX(out, out, pitch);
      if (roll) Mat4.rotateZ(out, out, roll);
      if (sx !== 1 || sy !== 1 || sz !== 1) Mat4.scale(out, out, sx, sy, sz);
      return out;
    },
    transformPoint(out, m, x, y, z) {
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    },
    normalMatrix3(out, m) {
      const a00 = m[0], a01 = m[1], a02 = m[2];
      const a10 = m[4], a11 = m[5], a12 = m[6];
      const a20 = m[8], a21 = m[9], a22 = m[10];
      const b01 = a22 * a11 - a12 * a21;
      const b11 = -a22 * a10 + a12 * a20;
      const b21 = a21 * a10 - a11 * a20;
      let det = a00 * b01 + a01 * b11 + a02 * b21;
      if (Math.abs(det) < 1e-8) {
        out[0] = 1; out[1] = 0; out[2] = 0;
        out[3] = 0; out[4] = 1; out[5] = 0;
        out[6] = 0; out[7] = 0; out[8] = 1;
        return out;
      }
      det = 1.0 / det;
      out[0] = b01 * det;
      out[1] = (-a22 * a01 + a02 * a21) * det;
      out[2] = (a12 * a01 - a02 * a11) * det;
      out[3] = b11 * det;
      out[4] = (a22 * a00 - a02 * a20) * det;
      out[5] = (-a12 * a00 + a02 * a10) * det;
      out[6] = b21 * det;
      out[7] = (-a21 * a00 + a01 * a20) * det;
      out[8] = (a11 * a00 - a01 * a10) * det;
      return out;
    }
  };

  // --- Катмулл-Ром сплайн для плавных трасс ---
  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  // Ближайшая точка на 2D отрезке XZ (для коллизий с трассой и отбойниками)
  function closestPointOnSegment2D(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    let t = 0;
    if (lenSq > 1e-8) {
      t = clamp(((px - ax) * abx + (pz - az) * abz) / lenSq, 0, 1);
    }
    const cx = ax + abx * t;
    const cz = az + abz * t;
    const dx = px - cx;
    const dz = pz - cz;
    return { x: cx, z: cz, t, distSq: dx * dx + dz * dz };
  }

  // 2D OBB углы машины в мировых координатах XZ
  function getCarCornersXZ(cx, cz, yaw, halfW, halfL) {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    // forward = (sin(yaw), cos(yaw)), right = (cos(yaw), -sin(yaw))
    const fx = s * halfL, fz = c * halfL;
    const rx = c * halfW, rz = -s * halfW;
    return [
      { x: cx + fx + rx, z: cz + fz + rz, label: 'FR' },
      { x: cx + fx - rx, z: cz + fz - rz, label: 'FL' },
      { x: cx - fx + rx, z: cz - fz + rz, label: 'RR' },
      { x: cx - fx - rx, z: cz - fz - rz, label: 'RL' }
    ];
  }

  global.Math3D = {
    DEG2RAD,
    RAD2DEG,
    clamp,
    lerp,
    smoothstep,
    wrapAngle,
    lerpAngle,
    damp,
    dampAngle,
    Vec3,
    Quat,
    Mat4,
    catmullRom,
    closestPointOnSegment2D,
    getCarCornersXZ
  };
})(window);
