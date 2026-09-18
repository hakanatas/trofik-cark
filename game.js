"use strict";

// ---------------------------------------------------------------------------
// Trofik Çark — Besin Ağı Rogue-lite
// Oyuncu tek bir canlı değil, sırayla otçul/karnivor/ayrıştırıcı formuna
// bürünerek ekosistemin dengesini koruyan bir "biyoçeşitlilik endeksi"ni
// olabildiğince yüksek ve uzun süre tutmaya çalışır.
// ---------------------------------------------------------------------------

const COLS = 22;
const ROWS = 14;
const CELL = 40;

const CANVAS = document.getElementById("game-canvas");
const CTX = CANVAS.getContext("2d");

const FORMS = {
  rabbit: { name: "Tavşan", icon: "🐇", speed: 150, abilityName: "Sıçrayış", abilityCd: 3.0 },
  fox: { name: "Tilki", icon: "🦊", speed: 118, abilityName: "Hamle", abilityCd: 2.5 },
  mushroom: { name: "Mantar", icon: "🍄", speed: 78, abilityName: "Spor Patlaması", abilityCd: 4.0 },
};

const IDEAL = {
  grassBiomass: 220, grassTol: 180,
  rabbitCount: 8, rabbitTol: 7,
  foxCount: 3, foxTol: 3,
};

const EVENTS = [
  { key: "drought", label: "🌵 Kuraklık başladı! Bitki büyümesi yavaşladı, yangın riski arttı.", duration: 14 },
  { key: "invasive", label: "🌿 İstilacı tür yayılıyor! Yerli bitki örtüsü baskı altında.", duration: 16 },
  { key: "disease", label: "🦠 Hastalık salgını! Leşler tehlikeli hale geldi, hemen ayrıştır.", duration: 14 },
  { key: "wildfire", label: "🔥 Ani yangın çıktı! Yoğun bitki örtüsü tutuştu.", duration: 1 },
];

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function triangular(x, ideal, tol) { return clamp(1 - Math.abs(x - ideal) / tol, 0, 1); }

// ------------------------------- Grid state -------------------------------

let grid = [];

function makeCell() {
  return { type: "soil", growth: 0, nutrient: rand(0.55, 0.85), invasive: false, burning: false, burnTicks: 0 };
}

function initGrid() {
  grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) row.push(makeCell());
    grid.push(row);
  }
  // Seed some starting grass patches so the world isn't empty at launch.
  for (let i = 0; i < 40; i++) {
    const x = randInt(0, COLS - 1), y = randInt(0, ROWS - 1);
    grid[y][x].type = "grass";
    grid[y][x].growth = randInt(1, 3);
  }
}

function neighbors(x, y) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) out.push([nx, ny]);
  }
  return out;
}

// -------------------------------- Entities ---------------------------------

let rabbits = [];
let foxes = [];
let player = null;

function makeRabbit(x, y) {
  return { kind: "rabbit", x, y, vx: 0, vy: 0, wanderT: 0, ticksSinceAte: 0, fed: false };
}
function makeFox(x, y) {
  return { kind: "fox", x, y, vx: 0, vy: 0, wanderT: 0, ticksSinceHunt: 0, fed: false };
}

function spawnRabbit(nearX, nearY) {
  if (rabbits.length >= 16) return;
  const x = clamp(nearX + rand(-2, 2), 0, COLS - 1);
  const y = clamp(nearY + rand(-2, 2), 0, ROWS - 1);
  rabbits.push(makeRabbit(x, y));
}
function spawnFox(nearX, nearY) {
  if (foxes.length >= 7) return;
  const x = clamp(nearX + rand(-2, 2), 0, COLS - 1);
  const y = clamp(nearY + rand(-2, 2), 0, ROWS - 1);
  foxes.push(makeFox(x, y));
}

// -------------------------------- Game state --------------------------------

const state = {
  phase: "start", // start | playing | paused | gameover
  elapsed: 0,
  round: 1,
  roundTimer: 0,
  score: 0,
  index: 100,
  indexLowTimer: 0,
  difficulty: 1,
  activeEvent: null,
  eventTimer: 0,
  nextEventIn: rand(12, 20),
  simAccum: 0,
  subScores: { grass: 1, rabbit: 1, fox: 1, soil: 1 },
  collapseReason: "",
};

const keys = new Set();
let abilityCooldownLeft = 0;
let abilityActive = null; // {type, timer, ...}
let facing = { x: 0, y: 1 };

function resetGame() {
  initGrid();
  rabbits = [];
  foxes = [];
  for (let i = 0; i < 6; i++) spawnRabbit(randInt(2, COLS - 2), randInt(2, ROWS - 2));
  for (let i = 0; i < 2; i++) spawnFox(randInt(2, COLS - 2), randInt(2, ROWS - 2));
  player = { form: "rabbit", x: COLS / 2, y: ROWS / 2 };
  Object.assign(state, {
    phase: "playing", elapsed: 0, round: 1, roundTimer: 0, score: 0, index: 100,
    indexLowTimer: 0, difficulty: 1, activeEvent: null, eventTimer: 0,
    nextEventIn: rand(12, 20), simAccum: 0, collapseReason: "",
  });
  abilityCooldownLeft = 0;
  abilityActive = null;
  hideOverlayPanels();
}

// --------------------------------- Input ------------------------------------

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
  if (state.phase === "playing") {
    if (k === "1") setForm("rabbit");
    else if (k === "2") setForm("fox");
    else if (k === "3") setForm("mushroom");
    else if (k === " ") { e.preventDefault(); useAbility(); }
    else if (k === "p") togglePause();
  } else if (state.phase === "paused" && k === "p") {
    togglePause();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

document.getElementById("start-btn").addEventListener("click", resetGame);
document.getElementById("restart-btn").addEventListener("click", resetGame);
document.getElementById("resume-btn").addEventListener("click", togglePause);

function togglePause() {
  if (state.phase === "playing") { state.phase = "paused"; showPanel("pause-panel"); }
  else if (state.phase === "paused") { state.phase = "playing"; hideOverlayPanels(); }
}

function setForm(form) {
  if (player.form === form) return;
  player.form = form;
  abilityCooldownLeft = 0;
  abilityActive = null;
}

function useAbility() {
  if (abilityCooldownLeft > 0) return;
  const f = player.form;
  if (f === "rabbit") {
    abilityActive = { type: "dash", timer: 0.28, dx: facing.x, dy: facing.y };
    abilityCooldownLeft = FORMS.rabbit.abilityCd;
  } else if (f === "fox") {
    abilityActive = { type: "pounce", timer: 0.35, dx: facing.x, dy: facing.y };
    abilityCooldownLeft = FORMS.fox.abilityCd;
  } else if (f === "mushroom") {
    sporeBurst();
    abilityCooldownLeft = FORMS.mushroom.abilityCd;
  }
}

function sporeBurst() {
  const radius = 2.4;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (dist(x + 0.5, y + 0.5, player.x, player.y) > radius) continue;
      const cell = grid[y][x];
      if (cell.type === "carcass") {
        cell.type = "soil"; cell.growth = 0; cell.nutrient = clamp(cell.nutrient + 0.45, 0, 1);
      } else if (cell.type === "desert") {
        cell.nutrient = clamp(cell.nutrient + 0.3, 0, 1);
        if (cell.nutrient > 0.2) cell.type = "soil";
      } else {
        cell.nutrient = clamp(cell.nutrient + 0.12, 0, 1);
      }
    }
  }
  state.score += 12;
}

// ------------------------------- Simulation ---------------------------------

const SIM_STEP = 0.15; // seconds per ecosystem tick

function updatePlayerMovement(dt) {
  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    facing = { x: dx, y: dy };
  }

  let speed = FORMS[player.form].speed / CELL; // cells/sec
  let mx = dx, my = dy;

  if (abilityActive) {
    abilityActive.timer -= dt;
    if (abilityActive.type === "dash" || abilityActive.type === "pounce") {
      const boost = abilityActive.type === "dash" ? 3.2 : 4.2;
      mx = abilityActive.dx; my = abilityActive.dy;
      speed *= boost;
      if (abilityActive.type === "pounce") checkPounceCatch();
    }
    if (abilityActive.timer <= 0) abilityActive = null;
  }

  player.x = clamp(player.x + mx * speed * dt, 0.2, COLS - 0.2);
  player.y = clamp(player.y + my * speed * dt, 0.2, ROWS - 0.2);

  if (abilityCooldownLeft > 0) abilityCooldownLeft = Math.max(0, abilityCooldownLeft - dt);

  // Continuous interactions while moving
  if (player.form === "rabbit") playerEatGrass();
  else if (player.form === "fox") playerHuntTouch();
  else if (player.form === "mushroom") playerDecomposeTouch();
}

let lastEatCellKey = "";
function playerEatGrass() {
  const cx = Math.floor(player.x), cy = Math.floor(player.y);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
  const cell = grid[cy][cx];
  const key = cx + "," + cy;
  if (cell.type !== "grass" || cell.growth <= 0) return;
  if (key === lastEatCellKey) return; // avoid multi-bite same frame streak
  lastEatCellKey = key;
  cell.growth -= 1;
  cell.invasive = false;
  state.score += 1;
  if (cell.growth <= 0) cell.type = "soil";
}

function checkPounceCatch() {
  const radius = 0.9;
  for (let i = rabbits.length - 1; i >= 0; i--) {
    const r = rabbits[i];
    if (dist(player.x, player.y, r.x, r.y) < radius) {
      catchRabbitAt(r.x, r.y);
      rabbits.splice(i, 1);
      state.score += 6;
      break;
    }
  }
}

function playerHuntTouch() {
  const radius = 0.55;
  for (let i = rabbits.length - 1; i >= 0; i--) {
    const r = rabbits[i];
    if (dist(player.x, player.y, r.x, r.y) < radius) {
      catchRabbitAt(r.x, r.y);
      rabbits.splice(i, 1);
      state.score += 4;
      break;
    }
  }
}

function catchRabbitAt(x, y) {
  const cx = clamp(Math.floor(x), 0, COLS - 1), cy = clamp(Math.floor(y), 0, ROWS - 1);
  const cell = grid[cy][cx];
  if (cell.type !== "carcass") { cell.type = "carcass"; cell.growth = 0; }
}

function playerDecomposeTouch() {
  const cx = Math.floor(player.x), cy = Math.floor(player.y);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
  const cell = grid[cy][cx];
  if (cell.type === "carcass") {
    cell.type = "soil"; cell.growth = 0; cell.nutrient = clamp(cell.nutrient + 0.35, 0, 1);
    state.score += 2;
  }
}

function findNearestGrass(x, y, maxR) {
  let best = null, bestD = maxR;
  const ix = Math.floor(x), iy = Math.floor(y);
  const r = Math.ceil(maxR);
  for (let yy = Math.max(0, iy - r); yy <= Math.min(ROWS - 1, iy + r); yy++) {
    for (let xx = Math.max(0, ix - r); xx <= Math.min(COLS - 1, ix + r); xx++) {
      const cell = grid[yy][xx];
      if (cell.type === "grass" && cell.growth > 0) {
        const d = dist(x, y, xx + 0.5, yy + 0.5);
        if (d < bestD) { bestD = d; best = { x: xx + 0.5, y: yy + 0.5 }; }
      }
    }
  }
  return best;
}

function updateNPCs(dt) {
  const rabbitEatMul = state.activeEvent === "invasive" ? 0.6 : 1;

  for (let i = rabbits.length - 1; i >= 0; i--) {
    const r = rabbits[i];
    // Flee nearest fox (including player-fox) if close
    let fleeing = false;
    const threats = foxes.concat(player.form === "fox" ? [player] : []);
    for (const f of threats) {
      const d = dist(r.x, r.y, f.x, f.y);
      if (d < 2.2) {
        const ax = r.x - f.x, ay = r.y - f.y;
        const len = Math.hypot(ax, ay) || 1;
        r.x = clamp(r.x + (ax / len) * 2.4 * dt, 0, COLS - 0.1);
        r.y = clamp(r.y + (ay / len) * 2.4 * dt, 0, ROWS - 0.1);
        fleeing = true;
        break;
      }
    }
    if (!fleeing) {
      const target = findNearestGrass(r.x, r.y, 6);
      if (target) {
        const ax = target.x - r.x, ay = target.y - r.y;
        const len = Math.hypot(ax, ay) || 1;
        if (len > 0.15) {
          r.x = clamp(r.x + (ax / len) * 1.4 * dt, 0, COLS - 0.1);
          r.y = clamp(r.y + (ay / len) * 1.4 * dt, 0, ROWS - 0.1);
        } else {
          const cx = Math.floor(r.x), cy = Math.floor(r.y);
          const cell = grid[cy] && grid[cy][cx];
          if (cell && cell.type === "grass" && cell.growth > 0) {
            r.wanderT -= dt;
            if (r.wanderT <= 0) {
              cell.growth -= rabbitEatMul >= 1 ? 1 : (Math.random() < rabbitEatMul ? 1 : 0);
              if (cell.growth <= 0) { cell.type = "soil"; cell.growth = 0; }
              else cell.nutrient = clamp(cell.nutrient - 0.02, 0, 1);
              r.ticksSinceAte = 0; r.fed = true;
              r.wanderT = 0.6;
            }
          }
        }
      } else {
        r.wanderT -= dt;
        if (r.wanderT <= 0) {
          r.vx = rand(-1, 1); r.vy = rand(-1, 1); r.wanderT = rand(0.6, 1.4);
        }
        r.x = clamp(r.x + r.vx * 0.8 * dt, 0, COLS - 0.1);
        r.y = clamp(r.y + r.vy * 0.8 * dt, 0, ROWS - 0.1);
      }
    }
    r.ticksSinceAte += dt;
    if (r.ticksSinceAte > 22) {
      catchRabbitAt(r.x, r.y);
      rabbits.splice(i, 1);
      continue;
    }
    if (r.fed && Math.random() < 0.0025 && rabbits.length < 16) {
      spawnRabbit(r.x, r.y);
      r.fed = false;
    }
  }

  for (let i = foxes.length - 1; i >= 0; i--) {
    const f = foxes[i];
    let target = null, bestD = 5;
    for (const r of rabbits) {
      const d = dist(f.x, f.y, r.x, r.y);
      if (d < bestD) { bestD = d; target = r; }
    }
    if (target) {
      const ax = target.x - f.x, ay = target.y - f.y;
      const len = Math.hypot(ax, ay) || 1;
      f.x = clamp(f.x + (ax / len) * 1.55 * dt, 0, COLS - 0.1);
      f.y = clamp(f.y + (ay / len) * 1.55 * dt, 0, ROWS - 0.1);
      if (len < 0.4) {
        const idx = rabbits.indexOf(target);
        if (idx >= 0) {
          catchRabbitAt(target.x, target.y);
          rabbits.splice(idx, 1);
          f.ticksSinceHunt = 0; f.fed = true;
        }
      }
    } else {
      f.wanderT -= dt;
      if (f.wanderT <= 0) { f.vx = rand(-1, 1); f.vy = rand(-1, 1); f.wanderT = rand(0.8, 1.6); }
      f.x = clamp(f.x + f.vx * 0.7 * dt, 0, COLS - 0.1);
      f.y = clamp(f.y + f.vy * 0.7 * dt, 0, ROWS - 0.1);
    }
    f.ticksSinceHunt += dt;
    if (f.ticksSinceHunt > 28) { foxes.splice(i, 1); continue; }
    if (f.fed && Math.random() < 0.002 && foxes.length < 7) {
      spawnFox(f.x, f.y);
      f.fed = false;
    }
  }
}

function simTick() {
  const droughtMul = state.activeEvent === "drought" ? 0.45 : 1;
  const invasiveActive = state.activeEvent === "invasive";
  const diseaseActive = state.activeEvent === "disease";
  const diff = state.difficulty;

  let grassBiomass = 0, grassCount = 0, desertCount = 0, nutrientSum = 0, carcassCount = 0;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y][x];
      nutrientSum += cell.nutrient;

      if (cell.burning) {
        cell.burnTicks -= 1;
        if (Math.random() < 0.35) {
          for (const [nx, ny] of neighbors(x, y)) {
            const nc = grid[ny][nx];
            if (nc.type === "grass" && !nc.burning && Math.random() < 0.25) {
              nc.burning = true; nc.burnTicks = randInt(3, 5);
            }
          }
        }
        if (cell.burnTicks <= 0) {
          cell.burning = false; cell.type = "desert";
          cell.growth = 0; cell.nutrient = clamp(cell.nutrient - 0.4, 0, 1);
        }
        continue;
      }

      if (cell.type === "soil") {
        const growProb = 0.0025 * cell.nutrient * droughtMul;
        if (Math.random() < growProb) { cell.type = "grass"; cell.growth = 1; cell.invasive = invasiveActive && Math.random() < 0.5; }
      } else if (cell.type === "grass") {
        if (cell.growth < 3 && Math.random() < 0.008 * cell.nutrient * droughtMul) cell.growth += 1;
        const spreadChance = (cell.invasive ? 0.02 : 0.008) * cell.nutrient * droughtMul;
        if (cell.growth >= 2 && Math.random() < spreadChance) {
          const opts = neighbors(x, y).filter(([nx, ny]) => grid[ny][nx].type === "soil");
          if (opts.length) {
            const [nx, ny] = opts[randInt(0, opts.length - 1)];
            grid[ny][nx].type = "grass"; grid[ny][nx].growth = 1; grid[ny][nx].invasive = cell.invasive;
          }
        }
      } else if (cell.type === "carcass") {
        carcassCount++;
        if (Math.random() < 0.01) { cell.type = "soil"; cell.growth = 0; cell.nutrient = clamp(cell.nutrient + 0.15, 0, 1); }
      } else if (cell.type === "desert") {
        desertCount++;
        if (Math.random() < 0.004) cell.nutrient = clamp(cell.nutrient + 0.02, 0, 1);
        if (cell.nutrient > 0.3) cell.type = "soil";
      }

      if (cell.type === "grass") { grassBiomass += cell.growth; grassCount++; }
    }
  }

  // Fire risk from overgrown vegetation (well above the healthy/ideal zone)
  const fireThreshold = 380 - diff * 15;
  const fireRisk = clamp((grassBiomass - fireThreshold) / 160, 0, 1);
  const droughtFireMul = state.activeEvent === "drought" ? 1.6 : 1;
  if (Math.random() < fireRisk * 0.06 * droughtFireMul) igniteRandomDenseGrass();

  // Disease from carcass pileup
  const diseaseThreshold = diseaseActive ? 3 : 5;
  if (carcassCount > diseaseThreshold) {
    const p = clamp((carcassCount - diseaseThreshold) * (diseaseActive ? 0.02 : 0.008), 0, 0.15);
    if (Math.random() < p && (rabbits.length || foxes.length)) {
      if (rabbits.length && Math.random() < 0.6) {
        const idx = randInt(0, rabbits.length - 1);
        catchRabbitAt(rabbits[idx].x, rabbits[idx].y);
        rabbits.splice(idx, 1);
      } else if (foxes.length) {
        foxes.splice(randInt(0, foxes.length - 1), 1);
      }
    }
  }

  computeBiodiversity(grassBiomass, grassCount, desertCount, nutrientSum, carcassCount);
}

function igniteRandomDenseGrass() {
  const candidates = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (grid[y][x].type === "grass" && grid[y][x].growth >= 2 && !grid[y][x].burning) candidates.push([x, y]);
  if (!candidates.length) return;
  const [x, y] = candidates[randInt(0, candidates.length - 1)];
  grid[y][x].burning = true;
  grid[y][x].burnTicks = randInt(3, 5);

  const cx = x + 0.5, cy = y + 0.5;
  for (let i = rabbits.length - 1; i >= 0; i--) {
    if (dist(rabbits[i].x, rabbits[i].y, cx, cy) < 1) { catchRabbitAt(rabbits[i].x, rabbits[i].y); rabbits.splice(i, 1); }
  }
  triggerBanner("🔥 Yangın çıktı! Bitki örtüsü tutuşuyor.");
}

function computeBiodiversity(grassBiomass, grassCount, desertCount, nutrientSum, carcassCount) {
  const rabbitCount = rabbits.length + (player.form === "rabbit" ? 1 : 0);
  const foxCount = foxes.length + (player.form === "fox" ? 1 : 0);
  const totalCells = COLS * ROWS;

  const gScore = triangular(grassBiomass, IDEAL.grassBiomass, IDEAL.grassTol);
  const rScore = triangular(rabbitCount, IDEAL.rabbitCount, IDEAL.rabbitTol);
  const fScore = triangular(foxCount, IDEAL.foxCount, IDEAL.foxTol);
  const desertFraction = desertCount / totalCells;
  const sScore = clamp(nutrientSum / totalCells - desertFraction * 0.5, 0, 1);

  const diseasePenalty = clamp((carcassCount - 4) * 0.03, 0, 0.3);

  state.subScores = { grass: gScore, rabbit: rScore, fox: fScore, soil: sScore };

  const avg = (gScore + rScore + fScore + sScore) / 4;
  const target = clamp(100 * (avg - diseasePenalty), 0, 100);
  state.index += (target - state.index) * 0.08; // smooth toward target
  state.index = clamp(state.index, 0, 100);

  if (grassCount === 0 && rabbitCount === 0 && foxCount === 0) {
    triggerGameOver("Tüm türler yok oldu — ekosistem tamamen çöktü.");
    return;
  }

  if (state.index <= 5) {
    state.indexLowTimer += SIM_STEP;
    if (state.indexLowTimer > 5) {
      triggerGameOver(diagnoseCollapse());
    }
  } else {
    state.indexLowTimer = 0;
  }
}

function diagnoseCollapse() {
  const s = state.subScores;
  const entries = [
    ["grass", s.grass, "Bitki örtüsü dengesi bozuldu (aşırı büyüme ya da tamamen tükenme)."],
    ["rabbit", s.rabbit, "Otçul popülasyonu dengesiz — ya soyu tükendi ya da kontrolsüz çoğaldı."],
    ["fox", s.fox, "Karnivor popülasyonu dengesiz — avcı baskısı kayboldu ya da aşırı arttı."],
    ["soil", s.soil, "Toprak sağlığı çöktü — çölleşme ya da besin kaybı."],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][2];
}

function triggerGameOver(reason) {
  if (state.phase === "gameover") return;
  state.phase = "gameover";
  state.collapseReason = reason;
  showGameOver();
}

// --------------------------------- Events -----------------------------------

function updateEvents(dt) {
  if (state.activeEvent) {
    state.eventTimer -= dt;
    if (state.eventTimer <= 0) {
      state.activeEvent = null;
      state.nextEventIn = rand(18, 26) / state.difficulty;
    }
    return;
  }
  state.nextEventIn -= dt;
  if (state.nextEventIn <= 0) {
    const ev = EVENTS[randInt(0, EVENTS.length - 1)];
    state.activeEvent = ev.key;
    state.eventTimer = ev.duration;
    triggerBanner(ev.label);
    if (ev.key === "wildfire") { igniteRandomDenseGrass(); igniteRandomDenseGrass(); state.activeEvent = null; }
  }
}

let bannerTimeout = null;
function triggerBanner(text) {
  const el = document.getElementById("event-banner");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.classList.add("hidden"), 4200);
}

// ---------------------------------- Loop -------------------------------------

function updateRound(dt) {
  state.roundTimer += dt;
  if (state.roundTimer >= 45) {
    state.roundTimer = 0;
    state.round += 1;
    state.difficulty = 1 + (state.round - 1) * 0.18;
    triggerBanner(`🌀 Tur ${state.round} başladı! Zorluk arttı.`);
  }
}

function update(dt) {
  if (state.phase !== "playing") return;
  state.elapsed += dt;
  state.score += dt * (2 + state.subScores.grass + state.subScores.rabbit + state.subScores.fox + state.subScores.soil);

  updatePlayerMovement(dt);
  updateNPCs(dt);
  updateEvents(dt);
  updateRound(dt);

  state.simAccum += dt;
  while (state.simAccum >= SIM_STEP) {
    state.simAccum -= SIM_STEP;
    simTick();
  }
}

// --------------------------------- Render -------------------------------------

const CELL_COLORS = {
  soil: (n) => `rgb(${60 + n * 40}, ${40 + n * 28}, ${28 + n * 16})`,
  desert: () => "#d8c48a",
};

function grassColor(growth, invasive) {
  if (invasive) {
    const shades = ["#6a4b7a", "#7d5a8e", "#8f6aa1"];
    return shades[clamp(growth - 1, 0, 2)];
  }
  const shades = ["#3f7a3f", "#4f9a4f", "#63c463"];
  return shades[clamp(growth - 1, 0, 2)];
}

function draw() {
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y][x];
      let color;
      if (cell.burning) color = Math.random() < 0.5 ? "#e2593b" : "#f2894a";
      else if (cell.type === "grass") color = grassColor(cell.growth, cell.invasive);
      else if (cell.type === "desert") color = CELL_COLORS.desert();
      else color = CELL_COLORS.soil(cell.nutrient);
      CTX.fillStyle = color;
      CTX.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      if (cell.type === "carcass") {
        CTX.font = "20px sans-serif";
        CTX.textAlign = "center";
        CTX.textBaseline = "middle";
        CTX.fillText("💀", x * CELL + CELL / 2, y * CELL + CELL / 2);
      }
    }
  }

  CTX.textAlign = "center";
  CTX.textBaseline = "middle";
  CTX.font = "22px sans-serif";
  CTX.globalAlpha = 0.85;
  for (const r of rabbits) CTX.fillText("🐇", r.x * CELL, r.y * CELL);
  for (const f of foxes) CTX.fillText("🦊", f.x * CELL, f.y * CELL);
  CTX.globalAlpha = 1;

  if (player) {
    CTX.beginPath();
    CTX.arc(player.x * CELL, player.y * CELL, 20, 0, Math.PI * 2);
    CTX.strokeStyle = "#eaf3ea";
    CTX.lineWidth = 2.5;
    CTX.stroke();
    CTX.font = "28px sans-serif";
    CTX.fillText(FORMS[player.form].icon, player.x * CELL, player.y * CELL);
  }
}

// ---------------------------------- HUD ---------------------------------------

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function updateHUD() {
  document.getElementById("hud-round").textContent = state.round;
  document.getElementById("hud-time").textContent = formatTime(state.elapsed);
  document.getElementById("hud-score").textContent = Math.floor(state.score);

  const idx = Math.round(state.index);
  document.getElementById("hud-index-num").textContent = idx + "%";
  const fill = document.getElementById("hud-index-fill");
  fill.style.width = idx + "%";
  fill.style.background = idx > 60
    ? "linear-gradient(90deg,#4caf50,#8bd15c)"
    : idx > 30
      ? "linear-gradient(90deg,#c7a93b,#e2b93b)"
      : "linear-gradient(90deg,#c23f2a,#e2593b)";

  document.getElementById("m-grass").style.width = Math.round(state.subScores.grass * 100) + "%";
  document.getElementById("m-rabbit").style.width = Math.round(state.subScores.rabbit * 100) + "%";
  document.getElementById("m-fox").style.width = Math.round(state.subScores.fox * 100) + "%";
  document.getElementById("m-soil").style.width = Math.round(state.subScores.soil * 100) + "%";

  const f = FORMS[player.form];
  document.getElementById("form-icon").textContent = f.icon;
  document.getElementById("form-name").textContent = f.name;
  document.getElementById("ability-hint").textContent = `Boşluk: ${f.abilityName}`;
  const cdFrac = abilityCooldownLeft > 0 ? 1 - abilityCooldownLeft / f.abilityCd : 1;
  document.getElementById("ability-fill").style.width = Math.round(clamp(cdFrac, 0, 1) * 100) + "%";
}

function hideOverlayPanels() {
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("start-panel").classList.add("hidden");
  document.getElementById("gameover-panel").classList.add("hidden");
  document.getElementById("pause-panel").classList.add("hidden");
}
function showPanel(id) {
  document.getElementById("overlay").classList.remove("hidden");
  document.getElementById("start-panel").classList.add("hidden");
  document.getElementById("gameover-panel").classList.add("hidden");
  document.getElementById("pause-panel").classList.add("hidden");
  document.getElementById(id).classList.remove("hidden");
}
function showGameOver() {
  document.getElementById("go-reason").textContent = state.collapseReason;
  document.getElementById("go-time").textContent = formatTime(state.elapsed);
  document.getElementById("go-round").textContent = state.round;
  document.getElementById("go-score").textContent = Math.floor(state.score);
  showPanel("gameover-panel");
}

// Initial screen
showPanel("start-panel");
// Draw an empty preview grid behind the start panel
initGrid();
draw();

// ---------------------------------- Main loop -----------------------------------

let lastT = performance.now();
function frame(t) {
  let dt = (t - lastT) / 1000;
  lastT = t;
  dt = Math.min(dt, 0.05);

  update(dt);
  draw();
  if (state.phase === "playing" || state.phase === "paused") updateHUD();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
