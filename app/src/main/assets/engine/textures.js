// engine/textures.js — Процедурный генератор Canvas-текстур (100% офлайн)
(function (global) {
  'use strict';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // Мокрый ночной асфальт горного перевала Тогэ
  function genAsphaltTouge() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    const rnd = seededRandom(101);

    ctx.fillStyle = '#181a22';
    ctx.fillRect(0, 0, 512, 512);

    // Влажные пятна отражений
    for (let i = 0; i < 36; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = 30 + rnd() * 90;
      const g = ctx.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, 'rgba(65, 78, 110, 0.24)');
      g.addColorStop(1, 'rgba(20, 22, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Зернистость асфальта
    for (let i = 0; i < 14000; i++) {
      const x = (rnd() * 512) | 0;
      const y = (rnd() * 512) | 0;
      const v = 18 + ((rnd() * 34) | 0);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 6})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Продольные потёртости от шин
    ctx.fillStyle = 'rgba(8, 9, 13, 0.35)';
    ctx.fillRect(110, 0, 58, 512);
    ctx.fillRect(344, 0, 58, 512);

    // Белые краевые линии
    ctx.fillStyle = 'rgba(225, 232, 245, 0.85)';
    ctx.fillRect(18, 0, 12, 512);
    ctx.fillRect(482, 0, 12, 512);

    // Центральная жёлтая разметка (Япония)
    ctx.fillStyle = 'rgba(245, 185, 45, 0.9)';
    for (let y = 16; y < 512; y += 128) {
      ctx.fillRect(250, y, 12, 76);
    }

    return c;
  }

  // Ночной городской хайвей Сибуя
  function genAsphaltCity() {
    const c = makeCanvas(512, 512);
    const ctx = c.getContext('2d');
    const rnd = seededRandom(202);

    ctx.fillStyle = '#141720';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 30; i++) {
      const x = rnd() * 512;
      const y = rnd() * 512;
      const r = 40 + rnd() * 100;
      const g = ctx.createRadialGradient(x, y, 5, x, y, r);
      g.addColorStop(0, 'rgba(95, 55, 115, 0.18)');
      g.addColorStop(1, 'rgba(18, 20, 28, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 12000; i++) {
      const x = (rnd() * 512) | 0;
      const y = (rnd() * 512) | 0;
      const v = 16 + ((rnd() * 28) | 0);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Двойная оранжевая/белая разметка хайвея
    ctx.fillStyle = 'rgba(240, 245, 255, 0.9)';
    ctx.fillRect(14, 0, 10, 512);
    ctx.fillRect(488, 0, 10, 512);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    for (let y = 12; y < 512; y += 96) {
      ctx.fillRect(170, y, 8, 52);
      ctx.fillRect(334, y, 8, 52);
    }

    return c;
  }

  // Текстура ржавчины, грунта и царапин для «некрух»
  function genRustMissile() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const rnd = seededRandom(303);

    ctx.fillStyle = '#c8ccd0';
    ctx.fillRect(0, 0, 256, 256);

    // Пятна серого грунта
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(92, 96, 102, ${0.35 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(rnd() * 256, rnd() * 256, 15 + rnd() * 40, 10 + rnd() * 28, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ржавые потёки и кромки
    for (let i = 0; i < 28; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 6 + rnd() * 22;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(130, 56, 22, 0.85)');
      g.addColorStop(0.6, 'rgba(98, 44, 18, 0.45)');
      g.addColorStop(1, 'rgba(98, 44, 18, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Боевые царапины от отбойников
    ctx.strokeStyle = 'rgba(230, 235, 240, 0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18 + rnd() * 45, y + (rnd() - 0.5) * 8);
      ctx.stroke();
    }

    // Дрифт-стяжки (zip-ties) крестиком
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = 35 + i * 24;
      const y = 215;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
    }
    return c;
  }

  // Плетёный карбон
  function genCarbon() {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, 128, 128);
    const step = 8;
    for (let y = 0; y < 128; y += step) {
      for (let x = 0; x < 128; x += step) {
        const alt = ((x / step) + (y / step)) % 2 === 0;
        ctx.fillStyle = alt ? '#242730' : '#111318';
        ctx.fillRect(x, y, step, step);
        ctx.fillStyle = alt ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.22)';
        ctx.fillRect(x + 1, y + 1, step - 2, step / 2);
      }
    }
    return c;
  }

  // Японская гоночная ливрея Сакура (для S15 Widebody)
  function genLiverySakura() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#171525');
    grad.addColorStop(0.55, '#2a1638');
    grad.addColorStop(1, '#ff3d8b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Диагональные гоночные полосы
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, 180); ctx.lineTo(256, 40); ctx.lineTo(256, 62); ctx.lineTo(0, 202);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 210); ctx.lineTo(256, 70); ctx.lineTo(256, 80); ctx.lineTo(0, 220);
    ctx.fill();

    // Лепестки сакуры на борту
    const rnd = seededRandom(404);
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.translate(rnd() * 256, rnd() * 256);
      ctx.rotate(rnd() * Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 180, 215, 0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('桜 DRIFT', 22, 128);
    return c;
  }

  // Уличная ливрея для «взорванного» Mark II Widebody
  function genLiveryStreet() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#0f1d2e');
    grad.addColorStop(0.5, '#173854');
    grad.addColorStop(1, '#00e5ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#ff2a85';
    ctx.beginPath();
    ctx.moveTo(0, 140); ctx.lineTo(256, 20); ctx.lineTo(256, 55); ctx.lineTo(0, 175);
    ctx.fill();

    ctx.fillStyle = '#f8ff4a';
    ctx.beginPath();
    ctx.moveTo(0, 185); ctx.lineTo(256, 65); ctx.lineTo(256, 77); ctx.lineTo(0, 197);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('JZX 100', 26, 232);
    return c;
  }

  // Ливрея для RX-7 FD Роторный Демон
  function genLiveryRotary() {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#2a050d');
    grad.addColorStop(0.5, '#b80f2e');
    grad.addColorStop(1, '#ff3344');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#121216';
    ctx.fillRect(0, 96, 256, 48);
    ctx.fillStyle = '#ffd045';
    ctx.fillRect(0, 92, 256, 4);
    ctx.fillRect(0, 144, 256, 4);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('13B TURBO', 38, 130);
    return c;
  }

  // Неоновая японская вывеска с иероглифами
  function genNeonSign(textLines, mainColor, bgColor) {
    const c = makeCanvas(256, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = bgColor || '#0c0a18';
    ctx.fillRect(0, 0, 256, 512);

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 232, 488);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, 212, 468);

    ctx.fillStyle = mainColor;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 18;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 74px sans-serif';
    const step = 420 / textLines.length;
    for (let i = 0; i < textLines.length; i++) {
      ctx.fillText(textLines[i], 128, 72 + i * step + step * 0.35);
    }
    ctx.shadowBlur = 0;
    return c;
  }

  // Японский торговый автомат (джихандоки)
  function genVendingMachine() {
    const c = makeCanvas(256, 512);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#dce4f0';
    ctx.fillRect(0, 0, 256, 512);
    // Верхняя красная полоса
    ctx.fillStyle = '#e0243c';
    ctx.fillRect(0, 0, 256, 62);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRINK 自販機', 128, 40);

    // Светящаяся витрина с банками
    ctx.fillStyle = '#eef8ff';
    ctx.fillRect(18, 76, 220, 240);
    const colors = ['#e63946', '#00b4d8', '#2a9d8f', '#f4a261', '#ff5ca8', '#3a86ff'];
    for (let row = 0; row < 3; row++) {
      const y = 96 + row * 74;
      ctx.fillStyle = '#263042';
      ctx.fillRect(22, y + 48, 212, 8);
      for (let col = 0; col < 7; col++) {
        ctx.fillStyle = colors[(row * 3 + col) % colors.length];
        ctx.fillRect(28 + col * 29, y + 8, 20, 38);
      }
    }
    // Лоток выдачи
    ctx.fillStyle = '#1b202b';
    ctx.fillRect(26, 360, 204, 88);
    ctx.fillStyle = '#48cae4';
    ctx.fillRect(182, 326, 46, 22);
    return c;
  }

  // Отбойник с красно-белыми стрелками
  function genGuardrail() {
    const c = makeCanvas(256, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6f7785';
    ctx.fillRect(0, 0, 256, 128);
    // Гофрированный профиль
    ctx.fillStyle = '#9aa3b2';
    ctx.fillRect(0, 16, 256, 22);
    ctx.fillRect(0, 86, 256, 22);
    ctx.fillStyle = '#464d59';
    ctx.fillRect(0, 48, 256, 28);

    // Светоотражающие красно-белые шевроны
    for (let x = 0; x < 256; x += 64) {
      ctx.fillStyle = '#e62e3d';
      ctx.beginPath();
      ctx.moveTo(x + 8, 12); ctx.lineTo(x + 32, 12); ctx.lineTo(x + 22, 116); ctx.lineTo(x - 2, 116);
      ctx.fill();
      ctx.fillStyle = '#f2f5fa';
      ctx.beginPath();
      ctx.moveTo(x + 34, 12); ctx.lineTo(x + 56, 12); ctx.lineTo(x + 46, 116); ctx.lineTo(x + 24, 116);
      ctx.fill();
    }
    return c;
  }

  // Мягкое облако дыма
  function genSmokeParticle() {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    g.addColorStop(0.45, 'rgba(235, 240, 248, 0.6)');
    g.addColorStop(1, 'rgba(220, 228, 240, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return c;
  }

  // Лепесток сакуры
  function genSakuraPetal() {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.translate(32, 32);
    const g = ctx.createRadialGradient(0, -4, 3, 0, 0, 24);
    g.addColorStop(0, '#ffe4f1');
    g.addColorStop(0.65, '#ff8fc4');
    g.addColorStop(1, 'rgba(255, 110, 180, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.bezierCurveTo(22, -16, 20, 14, 0, 24);
    ctx.bezierCurveTo(-20, 14, -22, -16, 0, -24);
    ctx.fill();
    ctx.restore();
    return c;
  }

  // Искра / пламя
  function genSparkParticle() {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    g.addColorStop(0.35, 'rgba(255, 210, 120, 0.9)');
    g.addColorStop(1, 'rgba(255, 90, 10, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c;
  }

  // След протектора шин (skidmark)
  function genSkidMark() {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(12, 12, 15, 0.72)';
    ctx.fillRect(6, 0, 16, 64);
    ctx.fillRect(26, 0, 12, 64);
    ctx.fillRect(42, 0, 16, 64);
    return c;
  }

  function createTextureLibrary(renderer) {
    const libs = {
      asphalt_touge: renderer.createTextureFromCanvas(genAsphaltTouge(), true, true),
      asphalt_city: renderer.createTextureFromCanvas(genAsphaltCity(), true, true),
      rust_missile: renderer.createTextureFromCanvas(genRustMissile(), true, true),
      carbon: renderer.createTextureFromCanvas(genCarbon(), true, true),
      livery_sakura: renderer.createTextureFromCanvas(genLiverySakura(), true, true),
      livery_street: renderer.createTextureFromCanvas(genLiveryStreet(), true, true),
      livery_rotary: renderer.createTextureFromCanvas(genLiveryRotary(), true, true),
      neon_drift: renderer.createTextureFromCanvas(genNeonSign(['ド', 'リ', 'フ', 'ト'], '#ff2a85', '#12071a'), false, false),
      neon_touge: renderer.createTextureFromCanvas(genNeonSign(['峠', '深', '夜', '桜'], '#00f0ff', '#071420'), false, false),
      neon_ramen: renderer.createTextureFromCanvas(genNeonSign(['東', '京', '爆', '走'], '#ffbe0b', '#1b1106'), false, false),
      vending: renderer.createTextureFromCanvas(genVendingMachine(), false, false),
      guardrail: renderer.createTextureFromCanvas(genGuardrail(), true, true),
      smoke: renderer.createTextureFromCanvas(genSmokeParticle(), false, false),
      petal: renderer.createTextureFromCanvas(genSakuraPetal(), false, false),
      spark: renderer.createTextureFromCanvas(genSparkParticle(), false, false),
      skid: renderer.createTextureFromCanvas(genSkidMark(), true, false)
    };
    return libs;
  }

  global.TextureGen = {
    createTextureLibrary
  };
})(window);
