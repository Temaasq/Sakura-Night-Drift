// game/physics.js — Физическая модель заднеприводного дрифт-кара в стиле CarX Drift Racing 2
(function (global) {
  'use strict';

  const { clamp, lerp, DEG2RAD, RAD2DEG } = global.Math3D;

  // Упрощённая магическая формула Пасейки (Pacejka Magic Formula)
  function pacejka(slipAngle, peakGrip, stiffness, shape) {
    return peakGrip * Math.sin(shape * Math.atan(stiffness * slipAngle));
  }

  class DriftCarPhysics {
    constructor(carSpec, tuning) {
      this.spec = carSpec;
      this.tuning = Object.assign({}, tuning);
      this.reset(0, 0, 0, 0);
    }

    setCar(carSpec, tuning) {
      this.spec = carSpec;
      this.tuning = Object.assign({}, tuning);
    }

    updateTuning(tuning) {
      this.tuning = Object.assign({}, tuning);
    }

    reset(x, y, z, yaw) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.yaw = yaw;
      this.pitch = 0;
      this.roll = 0;
      this.omega = 0; // угловая скорость рыскания (рад/с)

      this.steerAngle = 0;
      this.wheelRot = 0;
      this.rearWheelRot = 0;

      this.rpm = 950;
      this.gear = 1; // -1: R, 0: N, 1..6
      this.boost = -0.6;
      this.wheelSpin = 0;
      this.tireTemp = 0.25;

      this.vLong = 0;
      this.vLat = 0;
      this.speedKmh = 0;
      this.driftAngleDeg = 0;
      this.onGravel = false;
      this.braking = false;
      this.reversing = false;
      this.throttle = 0;

      this.clutchKickTimer = 0;
      this.redlineTimer = 0;
      this.trackSegIdx = 0;
      this.prevAccelLong = 0;

      // События текущего кадра (считываются main.js / audio / particles)
      this.events = {
        backfire: false,
        wallTap: false,
        crash: false,
        impactStrength: 0,
        sparkPos: null
      };
    }

    triggerClutchKick() {
      if (this.clutchKickTimer <= 0.05) {
        this.clutchKickTimer = 0.22;
      }
    }

    step(dt, input, track, assistLevel = 0.45) {
      this.events.backfire = false;
      this.events.wallTap = false;
      this.events.crash = false;
      this.events.impactStrength = 0;
      this.events.sparkPos = null;

      const s = this.spec.phys;
      const t = this.tuning;

      // Параметры тюнинга
      const stageMult = t.stage === 3 ? 1.38 : (t.stage === 2 ? 1.18 : 1.0);
      const maxSteerRad = clamp(t.steerAngleDeg || 54, 40, 65) * DEG2RAD;
      const finalDrive = clamp(t.finalDrive || 4.0, 3.2, 4.8);
      const rearPressure = clamp(t.rearPressure || 2.2, 1.5, 3.2);
      // Больше давление = легче срыв и длиннее скольжение; меньше = больше зацепа
      const pressureGripFactor = lerp(1.16, 0.80, (rearPressure - 1.5) / 1.7);

      const mass = s.mass;
      const lf = s.wheelbase * s.weightBiasFront;
      const lr = s.wheelbase * (1 - s.weightBiasFront);
      const inertia = mass * (lf * lf + lr * lr) * 0.56;
      const redline = s.redline;

      // Локальные оси машины: forward = (sin(yaw), cos(yaw)), right = (cos(yaw), -sin(yaw))
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);

      let vLong = this.vx * sinY + this.vz * cosY;
      let vLat = this.vx * cosY - this.vz * sinY;
      const speed = Math.hypot(vLong, vLat);
      this.speedKmh = speed * 3.6;

      // Угол заноса (Slip / Drift Angle)
      const driftAngleRad = speed > 1.8 ? Math.atan2(vLat, Math.abs(vLong) + 0.5) : 0;
      this.driftAngleDeg = driftAngleRad * RAD2DEG;

      // --- 1. Рулевое управление и Ассистент стабилизации в дрифте ---
      let targetSteer = input.steer * maxSteerRad;
      if (assistLevel > 0.01 && speed > 5.0) {
        // Ассистент мягко помогает контррулить в сторону заноса, не мешая перекладкам
        const desiredCounter = clamp(driftAngleRad * 0.88 + this.omega * 0.22, -maxSteerRad * 0.92, maxSteerRad * 0.92);
        const assistWeight = assistLevel * clamp(Math.abs(driftAngleRad) / 0.28, 0, 1);
        targetSteer = lerp(targetSteer, clamp(desiredCounter + input.steer * maxSteerRad * 0.65, -maxSteerRad, maxSteerRad), assistWeight);
      }
      const steerRate = 9.5 + (t.stage === 3 ? 2.0 : 0);
      this.steerAngle = lerp(this.steerAngle, targetSteer, clamp(steerRate * dt, 0, 1));

      // --- 2. Газ, тормоз, задний ход, ручник, клатч-кик ---
      let throttle = clamp(input.throttle, 0, 1);
      let brake = clamp(input.brake, 0, 1);
      const handbrake = !!input.handbrake;

      if (input.clutchKick) {
        this.triggerClutchKick();
      }
      if (this.clutchKickTimer > 0) {
        this.clutchKickTimer = Math.max(0, this.clutchKickTimer - dt);
      }

      // Логика заднего хода
      if (brake > 0.1 && vLong < 1.2) {
        this.gear = -1;
        this.reversing = true;
        this.braking = false;
      } else if (throttle > 0.05 && this.gear === -1 && vLong > -1.0) {
        this.gear = 1;
        this.reversing = false;
      } else if (this.gear <= 0 && throttle > 0.05) {
        this.gear = 1;
        this.reversing = false;
      } else {
        this.reversing = this.gear === -1;
        this.braking = brake > 0.1 && !this.reversing;
      }

      this.throttle = throttle;

      // --- 3. Коробка передач, RPM и турбонаддув ---
      const gearRatios = [0, 3.35, 2.25, 1.62, 1.24, 0.98, 0.80];
      const wheelRadius = 0.34;
      const gRatio = this.gear === -1 ? 3.2 : (gearRatios[this.gear] || 1.6);

      // Целевые обороты от скорости колёс + пробуксовка
      const wheelRpm = (Math.abs(vLong) / (2 * Math.PI * wheelRadius)) * 60 * gRatio * finalDrive;
      const slipRpmBoost = this.wheelSpin * 2600 + (this.clutchKickTimer > 0.06 ? 3200 : 0);
      let targetRpm = Math.max(950, wheelRpm + slipRpmBoost + throttle * 1150);
      if (handbrake && throttle > 0.2) targetRpm = Math.max(targetRpm, redline * 0.78);

      // Отсечка (Rev Limiter) + отстрелы выхлопа
      if (targetRpm >= redline) {
        targetRpm = redline - 120 + Math.sin(performance.now() * 0.09) * 140;
        this.redlineTimer += dt;
        if (this.redlineTimer > 0.16 && Math.random() < 0.45) {
          this.events.backfire = true;
          this.redlineTimer = 0;
        }
      } else {
        // Редкие хлопки при резком сбросе газа на высоких оборотах
        if (this.rpm > redline * 0.72 && throttle < 0.08 && Math.random() < 0.06) {
          this.events.backfire = true;
        }
        this.redlineTimer = 0;
      }

      this.rpm = lerp(this.rpm, clamp(targetRpm, 900, redline + 100), clamp(dt * 12, 0, 1));

      // Автоматическое переключение передач (удобно для дрифта — держит передачу в угле)
      if (this.gear >= 1) {
        const inDeepDrift = Math.abs(this.driftAngleDeg) > 18;
        const shiftUpRpm = inDeepDrift ? redline * 0.96 : redline * 0.89;
        const shiftDownRpm = redline * 0.42;
        if (this.rpm > shiftUpRpm && this.gear < 6 && !handbrake && this.clutchKickTimer <= 0) {
          this.gear++;
          this.events.backfire = true;
        } else if (wheelRpm < shiftDownRpm && this.gear > 1 && speed < (this.gear * 13.5)) {
          this.gear--;
        }
      }

      // Турбина (-0.8 .. +1.8 bar)
      const maxBoost = (s.maxBoost || 1.3) * (t.stage === 3 ? 1.25 : (t.stage === 2 ? 1.12 : 1.0));
      const targetBoost = throttle > 0.12
        ? lerp(-0.3, maxBoost, clamp((this.rpm - 2200) / (redline - 2200), 0, 1) * throttle)
        : -0.75;
      this.boost = lerp(this.boost, clamp(targetBoost, -0.8, 1.85), clamp(dt * (throttle > 0.1 ? 3.8 : 7.5), 0, 1));

      // --- 4. Динамический перенос веса (Weight Transfer) ---
      const g = 9.81;
      const weightTotal = mass * g;
      const transfer = clamp((this.prevAccelLong / g) * (s.cgHeight / s.wheelbase) * weightTotal, -weightTotal * 0.24, weightTotal * 0.24);
      // При торможении (prevAccelLong < 0) вес переносится на переднюю ось -> Fzf растёт, Fzr падает!
      const Fzf = clamp(weightTotal * s.weightBiasFront - transfer, weightTotal * 0.28, weightTotal * 0.72);
      const Fzr = clamp(weightTotal * (1 - s.weightBiasFront) + transfer, weightTotal * 0.28, weightTotal * 0.72);

      // --- 5. Проверка покрытия (асфальт / гравийная обочина) ---
      const q = track.queryPosition(this.x, this.z, this.trackSegIdx);
      this.trackSegIdx = q.segIdx;
      const absOff = Math.abs(q.offset);
      this.onGravel = absOff > q.halfWidth * 0.94;
      const surfaceGrip = this.onGravel ? 0.64 : 1.0;

      // --- 6. Тяга двигателя на задней оси ---
      const rpmNorm = clamp((this.rpm - 950) / (redline - 950), 0, 1);
      const torqueCurve = 0.62 + 0.58 * Math.sin(rpmNorm * Math.PI * 0.85);
      const boostFactor = 1.0 + Math.max(0, this.boost) * 0.24;
      let driveForce = 0;

      if (this.reversing) {
        driveForce = -brake * s.engineForce * 0.55;
      } else if (this.clutchKickTimer > 0.08) {
        // Сцепление выжато — двигатель раскручивается
        driveForce = 0;
      } else {
        const kickSurge = (this.clutchKickTimer > 0 && this.clutchKickTimer <= 0.08) ? 1.85 : 1.0;
        const gearTorqueScale = clamp(gRatio * (finalDrive / 4.0) * 0.48, 0.55, 1.95);
        driveForce = throttle * s.engineForce * stageMult * torqueCurve * boostFactor * gearTorqueScale * kickSurge;
      }

      // Тормозное усилие
      let brakeForce = 0;
      if (this.braking) {
        brakeForce = -Math.sign(vLong || 1) * brake * s.brakeForce;
      }
      if (handbrake && Math.abs(vLong) > 0.5) {
        brakeForce += -Math.sign(vLong) * s.brakeForce * 0.34;
      }

      // --- 7. Углы увода шин и боковые силы (Pacejka + Traction Circle) ---
      const vLongSafe = Math.max(Math.abs(vLong), 2.2);
      const vLatFront = vLat + this.omega * lf;
      const vLatRear = vLat - this.omega * lr;

      const alphaFront = Math.atan2(vLatFront, vLongSafe) - this.steerAngle * Math.sign(vLong >= -0.2 ? 1 : -1);
      const alphaRear = Math.atan2(vLatRear, vLongSafe);

      // Сцепление передней оси (немного растёт при небольшом отрицательном развале)
      const camberBonusF = 1.0 + Math.min(Math.abs(t.camberFront || 0), 8) * 0.012;
      const muFront = s.gripFront * surfaceGrip * camberBonusF;
      const muRearBase = s.gripRear * surfaceGrip * pressureGripFactor;

      // Задняя ось: срыв в пробуксовку при избытке тяги (Traction Circle) или ручнике
      const maxRearForce = Fzr * muRearBase;
      let rearSlipRatio = 0;
      if (handbrake) {
        rearSlipRatio = 1.0;
      } else if (Math.abs(driveForce) > maxRearForce * 0.68) {
        rearSlipRatio = clamp((Math.abs(driveForce) - maxRearForce * 0.68) / (maxRearForce * 0.85), 0, 1);
      }
      this.wheelSpin = lerp(this.wheelSpin, rearSlipRatio, clamp(dt * 10, 0, 1));

      // Температура резины (влияет на дымность)
      const slipWork = clamp(Math.abs(driftAngleRad) * 1.1 + this.wheelSpin * 0.8, 0, 1.4);
      this.tireTemp = clamp(this.tireTemp + (slipWork * 0.35 - 0.14) * dt, 0.15, 1.0);

      // Боковые силы на передней и задней осях
      let FyFront = -pacejka(alphaFront, Fzf * muFront, 5.2, 1.42);
      // При пробуксовке задней оси или ручнике боковой зацеп резко падает -> глубокий стабильный дрифт
      const rearLatFactor = handbrake ? 0.12 : lerp(1.0, 0.36, this.wheelSpin);
      let FyRear = -pacejka(alphaRear, Fzr * muRearBase * rearLatFactor, 4.6, 1.38);

      // Ограничиваем продольную силу реальным сцеплением, сохраняя ускорение в дрифте
      const effectiveDrive = clamp(driveForce, -maxRearForce * 1.25, maxRearForce * 1.32);

      // Аэродинамическое сопротивление + сопротивление качению (+ гравий)
      const rollingDrag = (this.onGravel ? 0.085 : 0.018) * weightTotal * Math.sign(vLong);
      const aeroDrag = 0.42 * vLong * Math.abs(vLong);

      // Суммарные силы в локальной системе машины
      const FxTotal = effectiveDrive + brakeForce - aeroDrag - (Math.abs(vLong) > 0.2 ? rollingDrag : 0) - FyFront * Math.sin(this.steerAngle) * 0.35;
      const FyTotal = FyFront * Math.cos(this.steerAngle) + FyRear;

      // Момент рыскания (Yaw Torque)
      let yawTorque = FyFront * lf * Math.cos(this.steerAngle) - FyRear * lr;

      // Небольшой дрифт-импульс при ручнике или клатч-кике в повороте
      if (handbrake && Math.abs(input.steer) > 0.1 && speed > 5) {
        yawTorque += input.steer * mass * 2.8;
      }
      if (this.clutchKickTimer > 0 && this.clutchKickTimer < 0.1 && Math.abs(input.steer) > 0.1 && speed > 4) {
        yawTorque += input.steer * mass * 3.4;
      }

      // Демпфирование чрезмерного вращения (чтобы машина не улетала в неуправляемый волчок)
      const angularDamp = (assistLevel * 3.2 + 1.35) * inertia;
      yawTorque -= this.omega * angularDamp;

      // Ускорения
      let aLong = FxTotal / mass + this.omega * vLat;
      let aLat = FyTotal / mass - this.omega * vLong;
      const aYaw = yawTorque / inertia;

      // Сохраняем продольное ускорение для переноса веса на следующем шаге
      this.prevAccelLong = clamp(FxTotal / mass, -14, 14);

      vLong += aLong * dt;
      vLat += aLat * dt;
      this.omega = clamp(this.omega + aYaw * dt, -3.4, 3.4);

      // Остановка на сверхмалых скоростях без газа
      if (speed < 0.35 && throttle < 0.05 && brake < 0.05) {
        vLong *= 0.82;
        vLat *= 0.72;
        this.omega *= 0.7;
      }
      // Натуральное боковое затухание на малых скоростях
      if (speed < 2.0) {
        vLat *= Math.pow(0.15, dt);
      }

      // Ограничение максимальной скорости (около 235–285 км/ч в зависимости от стадии)
      const maxSpeedMs = (s.maxSpeedKmh * (0.94 + stageMult * 0.08)) / 3.6;
      const newSpeed = Math.hypot(vLong, vLat);
      if (newSpeed > maxSpeedMs) {
        const sc = maxSpeedMs / newSpeed;
        vLong *= sc;
        vLat *= sc;
      }

      this.vLong = vLong;
      this.vLat = vLat;

      // Обратный перевод в мировые координаты
      this.yaw += this.omega * dt;
      const nSin = Math.sin(this.yaw);
      const nCos = Math.cos(this.yaw);
      this.vx = vLong * nSin + vLat * nCos;
      this.vz = vLong * nCos - vLat * nSin;

      this.x += this.vx * dt;
      this.z += this.vz * dt;

      // --- 8. Высота трассы, тангаж (pitch) и крен (roll) ---
      const q2 = track.queryPosition(this.x, this.z, this.trackSegIdx);
      this.trackSegIdx = q2.segIdx;
      this.y = lerp(this.y, q2.y, clamp(dt * 18, 0, 1));

      const softSusp = s.softSuspension ? 1.55 : 1.0;
      const targetPitch = q2.slopePitch + clamp(-this.prevAccelLong * 0.0055 * softSusp, -0.075, 0.075);
      const targetRoll = clamp(-(FyTotal / weightTotal) * 0.065 * softSusp, -0.11, 0.11);
      this.pitch = lerp(this.pitch, targetPitch, clamp(dt * 9, 0, 1));
      this.roll = lerp(this.roll, targetRoll, clamp(dt * 9, 0, 1));

      // Вращение колёс
      this.wheelRot += (vLong / wheelRadius) * dt;
      this.rearWheelRot += ((vLong / wheelRadius) + this.wheelSpin * 28) * dt;

      // --- 9. Коллизия с отбойниками и детектор Wall Tap ---
      const wallLimit = q2.halfWidth + 1.55;
      const carHalfW = 0.98;
      const distToWall = wallLimit - (Math.abs(q2.offset) + carHalfW);

      // Бонус Wall Tap: проход в 0.3–1.2 м от стены в заносе без удара
      if (distToWall > 0.15 && distToWall < 1.25 && Math.abs(this.driftAngleDeg) > 18 && this.speedKmh > 35) {
        this.events.wallTap = true;
      }

      if (distToWall < 0) {
        const sideSign = q2.offset >= 0 ? 1 : -1;
        // Нормаль от стены внутрь трассы
        const nx = -q2.rightX * sideSign;
        const nz = -q2.rightZ * sideSign;

        // Выталкиваем машину от отбойника
        const push = -distToWall + 0.04;
        this.x += nx * push;
        this.z += nz * push;

        // Скорость удара в стену
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          const impactSpeed = -vn;
          this.vx -= (1.32 * vn) * nx;
          this.vz -= (1.32 * vn) * nz;
          // Трение об отбойник
          this.vx *= 0.86;
          this.vz *= 0.86;
          this.omega *= 0.55;

          this.events.impactStrength = clamp(impactSpeed / 14, 0.15, 1.0);
          this.events.sparkPos = {
            x: this.x - nx * carHalfW,
            y: this.y + 0.55,
            z: this.z - nz * carHalfW
          };

          if (impactSpeed > 6.2) {
            this.events.crash = true;
          }
        }
      }
    }
  }

  global.DriftCarPhysics = DriftCarPhysics;
})(window);
