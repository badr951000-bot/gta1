import { GameMap, TILE_SIZE, MAP_COLS, MAP_ROWS } from './map.js';
import { Vehicle } from './vehicles.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { RetroAudio } from './audio.js';
import { PedestrianManager } from './pedestrians.js';
import { WeaponPickupManager } from './weapons.js';
import { SupplyPickupManager } from './pickups.js';

const SAVE_KEY = 'gta1_clone_save_v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(player, missions) {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: player.cash,
        armor: player.armor,
        kills: player.kills,
        completedCount: missions.completedCount,
        weapons: player.weapons,
        ammo: {
          SMG: player.ammo.SMG || 0,
          SHOTGUN: player.ammo.SHOTGUN || 0
        }
      })
    );
  } catch {
    // ignore storage errors
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore storage errors
  }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');

const hudCash = document.getElementById('hud-cash');
const hudWanted = document.getElementById('hud-wanted');
const hudHealth = document.getElementById('hud-health');
const hudVehicle = document.getElementById('hud-vehicle');
const hudVehName = document.getElementById('hud-veh-name');
const hudVehSpeed = document.getElementById('hud-veh-speed');
const hudBanner = document.getElementById('hud-banner');
const hudMission = document.getElementById('hud-mission');
const hudMissionTitle = document.getElementById('hud-mission-title');
const hudMissionTimer = document.getElementById('hud-mission-timer');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const saved = loadSave();
const audio = new RetroAudio();
const map = new GameMap();
const missions = new MissionManager(map);
if (saved?.completedCount) {
  missions.completedCount = saved.completedCount;
}
const pedManager = new PedestrianManager(map, 45);
const weaponPickups = new WeaponPickupManager(map);
const supplyPickups = new SupplyPickupManager(map);

const spawnNode = map.roadNodes[Math.floor(map.roadNodes.length / 2)];
const player = new Player(spawnNode.x + 40, spawnNode.y, saved);

function findPrecinctLayout(map, preferredNode) {
  const baseCol = preferredNode ? Math.floor(preferredNode.x / TILE_SIZE) : 6;
  const baseRow = preferredNode ? Math.floor(preferredNode.y / TILE_SIZE) : 6;

  for (let radius = 1; radius <= 8; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = baseRow + dr;
        const c = baseCol + dc;
        if (map.grid[r]?.[c] === 2) {
          const bldX = c * TILE_SIZE + TILE_SIZE / 2;
          const bldY = r * TILE_SIZE + TILE_SIZE / 2;

          const lotDirs = [
            { dc: 0, dr: 1, ang: Math.PI / 2 },
            { dc: 0, dr: -1, ang: -Math.PI / 2 },
            { dc: 1, dr: 0, ang: 0 },
            { dc: -1, dr: 0, ang: Math.PI }
          ];

          for (const d of lotDirs) {
            const nr = r + d.dr;
            const nc = c + d.dc;
            const t = map.grid[nr]?.[nc];
            if (t === 1 || t === 3) {
              return {
                x: bldX,
                y: bldY,
                lotX: nc * TILE_SIZE + TILE_SIZE / 2,
                lotY: nr * TILE_SIZE + TILE_SIZE / 2,
                lotW: TILE_SIZE * 0.9,
                lotH: TILE_SIZE * 0.85,
                parkAngle: d.ang
              };
            }
          }
        }
      }
    }
  }

  return {
    x: spawnNode.x + 120,
    y: spawnNode.y - 120,
    lotX: spawnNode.x + 120,
    lotY: spawnNode.y - 64,
    lotW: TILE_SIZE * 0.9,
    lotH: TILE_SIZE * 0.85,
    parkAngle: Math.PI / 2
  };
}

const precinct = findPrecinctLayout(map, map.roadNodes[9] || spawnNode);
const policeStation = {
  x: precinct.x,
  y: precinct.y,
  lotX: precinct.lotX,
  lotY: precinct.lotY,
  lotW: precinct.lotW,
  lotH: precinct.lotH,
  parkAngle: precinct.parkAngle,
  w: TILE_SIZE * 1.35,
  h: TILE_SIZE * 1.35
};

const sprayShops = [map.roadNodes[4], map.roadNodes[18]]
  .filter(Boolean)
  .map((n, idx) => ({
    id: idx + 1,
    x: n.x,
    y: n.y,
    radius: 34,
    cooldown: 0
  }));

const vehicles = [];
const bullets = [];
const particles = [];
const skidmarks = [];
const impacts = [];
const roadblocks = [];
const vehiclePool = ['SPORT', 'SEDAN', 'MUSCLE', 'VAN', 'POLICE'];

for (let i = 0; i < 28; i++) {
  const node = map.roadNodes[i % map.roadNodes.length];
  const type = vehiclePool[i % vehiclePool.length];
  const angle = (i % 4) * (Math.PI / 2);
  vehicles.push(new Vehicle(node.x + (i % 2 === 0 ? 18 : -18), node.y, angle, type));
}

const parkedCop1 = new Vehicle(policeStation.lotX - 12, policeStation.lotY, policeStation.parkAngle, 'POLICE');
parkedCop1.parkedInLot = true;
const parkedCop2 = new Vehicle(policeStation.lotX + 12, policeStation.lotY, policeStation.parkAngle, 'POLICE');
parkedCop2.parkedInLot = true;

vehicles.push(parkedCop1, parkedCop2);
vehicles.push(new Vehicle(spawnNode.x - 30, spawnNode.y - 35, 0, 'SPORT'));

const keys = {};
let paused = false;
let gameOverScreen = null;
let bannerTimeout = null;
let policeSpawnCooldown = 0;
let policeFireTimer = 0;
let roadblockCooldown = 0;
let saveTimer = 0;
let lightCycle = 0;
let screenShake = 0;
let damageFlash = 0;
let currentDistrict = map.getDistrictAt(player.x, player.y);

function showBanner(text) {
  hudBanner.textContent = text;
  hudBanner.classList.add('visible');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => {
    hudBanner.classList.remove('visible');
  }, 2400);
}

function addShake(amount) {
  screenShake = Math.min(18, Math.max(screenShake, amount));
}

function triggerGameOver(type) {
  if (gameOverScreen) return;
  gameOverScreen = type;
  if (player.vehicle) {
    player.vehicle.driver = null;
    player.vehicle = null;
  }
  player.cash = Math.max(0, player.cash - 150);
  writeSave(player, missions);
}

function respawnFromGameOver() {
  gameOverScreen = null;
  player.health = 100;
  player.armor = 0;
  player.wantedLevel = 0;
  player.x = spawnNode.x + 40;
  player.y = spawnNode.y;
  map.resolveCircleCollision(player);
  showBanner('NOUVELLE VIE — LIBERTY CITY');
}

function addImpactMark(x, y, color = '#2c3e50') {
  impacts.push({ x, y, color, alpha: 0.55 });
  if (impacts.length > 260) {
    impacts.splice(0, impacts.length - 260);
  }
}

function spawnSparks(x, y, color = '#ffeaa7', count = 6) {
  if (particles.length > 240) return;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 50 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.16 + Math.random() * 0.14,
      size: 2.5 + Math.random() * 2.5,
      color
    });
  }
}

function spawnExplosion(x, y) {
  audio.explosion();
  addShake(14);
  pedManager.alertAround(x, y, 420);
  for (let i = 0; i < 24; i++) {
    if (particles.length > 260) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 260;
    particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.35 + Math.random() * 0.45,
      size: 4 + Math.random() * 7,
      color: i % 2 === 0 ? '#ff6b00' : '#f1c40f'
    });
  }
}

function emitDamageSmoke(dt) {
  for (const v of vehicles) {
    if (v.exploded || v.hp >= v.maxHp * 0.5) continue;
    v.smokeTimer -= dt;
    if (v.smokeTimer <= 0 && particles.length < 260) {
      v.smokeTimer = 0.11;
      particles.push({
        x: v.x + (Math.random() - 0.5) * 12,
        y: v.y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 25,
        vy: -20 - Math.random() * 25,
        life: 0.5,
        size: 6 + Math.random() * 5,
        color: v.hp < v.maxHp * 0.25 ? '#ff7675' : '#636e72'
      });
    }
  }
}

function updateSprayShops(dt) {
  for (const shop of sprayShops) {
    if (shop.cooldown > 0) {
      shop.cooldown -= dt;
      continue;
    }

    const v = player.vehicle;
    if (!v || v.exploded) continue;

    if (Math.hypot(v.x - shop.x, v.y - shop.y) < shop.radius + v.radius) {
      const cost = player.cash >= 100 ? 100 : 0;
      player.cash -= cost;
      v.hp = v.maxHp;
      player.wantedLevel = Math.max(0, player.wantedLevel - 2);
      shop.cooldown = 6;
      audio.cash();
      writeSave(player, missions);
      showBanner(cost > 0 ? `PAY 'N' SPRAY (-$100) • RÉPARÉ` : `PAY 'N' SPRAY • RÉPARÉ`);
    }
  }
}

function triggerShoot() {
  if (paused || gameOverScreen) return;
  audio.unlock();
  if (player.canShoot()) {
    const weaponId = player.currentWeaponId;
    const created = player.createBullets();
    bullets.push(...created);
    audio.shoot(weaponId);
    pedManager.alertAround(player.x, player.y, 260);
    player.addWanted(1);
  }
}

function spawnEnemyBullet(fromX, fromY, targetX, targetY, spread = 0.22, damage = 7) {
  if (gameOverScreen) return;
  const ang = Math.atan2(targetY - fromY, targetX - fromX) + (Math.random() - 0.5) * spread;
  bullets.push({
    fromPlayer: false,
    x: fromX + Math.cos(ang) * 16,
    y: fromY + Math.sin(ang) * 16,
    vx: Math.cos(ang) * 620,
    vy: Math.sin(ang) * 620,
    life: 0.7,
    damage,
    color: '#ff5252'
  });
}

function updatePoliceDisembarkAndFire(dt) {
  if (player.wantedLevel < 2) {
    policeFireTimer = 0;
    return;
  }

  for (const v of vehicles) {
    if (!v.isPolice || v.exploded || v.driver === player || v.disembarked) continue;
    const dist = Math.hypot(player.x - v.x, player.y - v.y);
    if (dist < 155 || v.hp < v.maxHp * 0.45) {
      v.disembarked = true;
      const exitAng = v.angle - Math.PI / 2;
      pedManager.spawnCop(
        v.x + Math.cos(exitAng) * 26,
        v.y + Math.sin(exitAng) * 26,
        v.angle
      );
      showBanner('POLICE À PIED !');
    }
  }

  if (!player.vehicle && player.wantedLevel >= 4) {
    const nearCop = pedManager.peds.find(
      (p) => p.alive && p.isCop && Math.hypot(p.x - player.x, p.y - player.y) < 26
    );
    if (nearCop) {
      triggerGameOver('BUSTED');
      return;
    }
  }

  policeFireTimer -= dt;
  if (policeFireTimer > 0) return;

  const shooter = vehicles.find(
    (v) => v.isPolice && !v.exploded && v.driver !== player && Math.hypot(v.x - player.x, v.y - player.y) < 340
  );
  if (!shooter) return;

  policeFireTimer = Math.max(0.45, 1.35 - player.wantedLevel * 0.16);
  spawnEnemyBullet(shooter.x, shooter.y, player.x, player.y, 0.24, 7);
}

function resolveBoxEntityCollision(ent, box) {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const closestX = Math.max(box.x - halfW, Math.min(ent.x, box.x + halfW));
  const closestY = Math.max(box.y - halfH, Math.min(ent.y, box.y + halfH));

  const dx = ent.x - closestX;
  const dy = ent.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < ent.radius * ent.radius) {
    const dist = Math.sqrt(distSq) || 0.001;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = ent.radius - dist;
    ent.x += nx * overlap;
    ent.y += ny * overlap;
    return { nx, ny, closestX, closestY };
  }
  return null;
}

function handleInteractKey() {
  if (paused || gameOverScreen) return;
  const phone = missions.findNearbyPhone(player);
  if (phone) {
    missions.startMissionFromPhone(phone, player, vehicles, showBanner, audio);
  } else {
    const wasInVehicle = Boolean(player.vehicle);
    player.toggleVehicle(vehicles, showBanner);
    if (!wasInVehicle && player.vehicle) {
      player.vehicle.parkedInLot = false;
      audio.engineStart();
    } else if (wasInVehicle && !player.vehicle) {
      for (const rb of roadblocks) {
        resolveBoxEntityCollision(player, rb);
      }
      resolveBoxEntityCollision(player, policeStation);
      map.resolveCircleCollision(player);
      if (map.isSolidAt(player.x, player.y)) {
        player.x = spawnNode.x;
        player.y = spawnNode.y;
      }
    }
  }
}

window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (gameOverScreen) {
    if (e.code === 'Enter' || e.code === 'Space') {
      respawnFromGameOver();
    }
    return;
  }

  if (e.code === 'KeyP') {
    paused = !paused;
    showBanner(paused ? 'JEU EN PAUSE (P POUR REPRENDRE)' : 'REPRISE');
    return;
  }

  if (e.shiftKey && e.code === 'KeyK') {
    clearSave();
    player.cash = 0;
    player.armor = 0;
    player.kills = 0;
    player.weapons = ['PISTOL'];
    player.weaponIndex = 0;
    player.ammo = { PISTOL: Infinity, SMG: 0, SHOTGUN: 0 };
    missions.completedCount = 0;
    showBanner('SAUVEGARDE RÉINITIALISÉE ($0)');
    return;
  }

  if (paused) return;

  if (e.code === 'KeyE') {
    handleInteractKey();
  }

  if (e.code === 'KeyF') {
    triggerShoot();
  }

  if (e.code === 'KeyR') {
    player.cycleWeapon(showBanner);
  }

  if (e.code === 'KeyM') {
    audio.unlock();
    const muted = audio.toggleMute();
    showBanner(muted ? 'SON COUPÉ (M)' : 'SON ACTIVÉ (M)');
  }

  if (e.code === 'KeyB') {
    showBanner(audio.cycleRadio());
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    triggerShoot();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function setupTouchControls() {
  const joyZone = document.getElementById('joystick-zone');
  const joyStick = document.getElementById('joystick-stick');
  let activeTouchId = null;

  const setMoveKeys = (nx, ny) => {
    const deadzone = 0.28;
    keys['KeyW'] = ny < -deadzone;
    keys['KeyS'] = ny > deadzone;
    keys['KeyA'] = nx < -deadzone;
    keys['KeyD'] = nx > deadzone;
  };

  const resetJoystick = () => {
    activeTouchId = null;
    if (joyStick) {
      joyStick.style.transform = 'translate(0px, 0px)';
    }
    setMoveKeys(0, 0);
  };

  const updateJoystickFromTouch = (touch) => {
    if (!joyZone || !joyStick) return;
    const rect = joyZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;

    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius && dist > 0) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    joyStick.style.transform = `translate(${dx}px, ${dy}px)`;
    setMoveKeys(dx / maxRadius, dy / maxRadius);
  };

  if (joyZone) {
    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      audio.unlock();
      if (activeTouchId !== null) return;
      const t = e.changedTouches[0];
      activeTouchId = t.identifier;
      updateJoystickFromTouch(t);
    }, { passive: false });

    joyZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) {
          updateJoystickFromTouch(t);
          break;
        }
      }
    }, { passive: false });

    const endJoy = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) {
          resetJoystick();
          break;
        }
      }
    };

    joyZone.addEventListener('touchend', endJoy, { passive: false });
    joyZone.addEventListener('touchcancel', endJoy, { passive: false });
  }

  document.querySelectorAll('#touch-controls .t-btn').forEach((btn) => {
    const code = btn.dataset.key;
    const action = btn.dataset.action;

    const press = (e) => {
      e.preventDefault();
      audio.unlock();
      if (gameOverScreen && (code === 'Space' || action === 'interact')) {
        respawnFromGameOver();
        return;
      }
      if (code) {
        keys[code] = true;
      } else if (action === 'fire') {
        triggerShoot();
      } else if (action === 'interact') {
        handleInteractKey();
      } else if (action === 'weapon') {
        player.cycleWeapon(showBanner);
      } else if (action === 'radio') {
        showBanner(audio.cycleRadio());
      }
    };

    const release = (e) => {
      e.preventDefault();
      if (code) {
        keys[code] = false;
      }
    };

    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
  });
}

setupTouchControls();

function recordSkidmarks() {
  const v = player.vehicle;
  if (!v || v.exploded) return;
  const speed = v.getSpeed();
  if (speed > 170 && (keys['Space'] || Math.abs(v.vx * Math.sin(v.angle) - v.vy * Math.cos(v.angle)) > 75)) {
    const cos = Math.cos(v.angle);
    const sin = Math.sin(v.angle);
    const rearOffset = -v.width * 0.32;
    const trackHalf = v.height * 0.34;
    const cx = v.x + cos * rearOffset;
    const cy = v.y + sin * rearOffset;

    skidmarks.push(
      { x: cx - sin * trackHalf, y: cy + cos * trackHalf, alpha: 0.35 },
      { x: cx + sin * trackHalf, y: cy - cos * trackHalf, alpha: 0.35 }
    );

    if (skidmarks.length > 300) {
      skidmarks.splice(0, skidmarks.length - 300);
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    const hitStation =
      Math.abs(b.x - policeStation.x) < policeStation.w / 2 &&
      Math.abs(b.y - policeStation.y) < policeStation.h / 2;

    if (hitStation || map.isSolidAt(b.x, b.y)) {
      addImpactMark(b.x, b.y, '#222');
      spawnSparks(b.x, b.y, '#f5f6fa', 4);
      bullets.splice(i, 1);
      continue;
    }

    let hit = false;

    if (!b.fromPlayer) {
      if (player.vehicle && !player.vehicle.exploded) {
        if (Math.hypot(player.vehicle.x - b.x, player.vehicle.y - b.y) < player.vehicle.radius + 4) {
          addImpactMark(b.x, b.y, '#ff6b6b');
          spawnSparks(b.x, b.y, '#ff9f43', 5);
          player.vehicle.takeDamage(b.damage, (veh) => spawnExplosion(veh.x, veh.y));
          hit = true;
        }
      } else if (Math.hypot(player.x - b.x, player.y - b.y) < player.radius + 4) {
        spawnSparks(b.x, b.y, '#ff4757', 5);
        damageFlash = 0.28;
        addShake(5);
        player.takeDamage(b.damage);
        if (player.health <= 0) {
          triggerGameOver('WASTED');
        }
        hit = true;
      }
    } else {
      for (const p of pedManager.peds) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < p.radius + 4) {
          p.takeDamage(b.damage, () => {
            player.cash += 50;
            player.kills += 1;
            player.addWanted(1);
            audio.cash();
            showBanner(p.isCop ? 'FLIC ABATTU ! +$50' : p.isHostileCiv ? 'HOSTILE ABATTU ! +$50' : 'PNJ ÉLIMINÉ ! +$50');
          });
          hit = true;
          break;
        }
      }

      if (!hit) {
        for (const v of vehicles) {
          if (v === player.vehicle || v.exploded) continue;
          if (Math.hypot(v.x - b.x, v.y - b.y) < v.radius + 4) {
            v.parkedInLot = false;
            addImpactMark(b.x, b.y, '#dfe6e9');
            spawnSparks(b.x, b.y, '#ffeaa7', 5);
            v.takeDamage(b.damage, (veh) => {
              player.kills += 1;
              spawnExplosion(veh.x, veh.y);
            });
            hit = true;
            break;
          }
        }
      }
    }

    if (hit) bullets.splice(i, 1);
  }
}

function handlePedestrianVehicleHits() {
  for (const v of vehicles) {
    if (v.exploded) continue;
    const speed = v.getSpeed();
    if (speed < 95) continue;

    for (const p of pedManager.peds) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - v.x, p.y - v.y) < v.radius + p.radius) {
        const dmg = Math.round(speed * 0.14);
        p.takeDamage(dmg, () => {
          if (v.driver === player) {
            player.cash += 50;
            player.kills += 1;
            player.addWanted(1);
            audio.crash();
            addShake(4);
            showBanner('RENVERSEMENT ! +$50');
          }
        });
      }
    }
  }
}

function resolveRoadblockCollision(v, rb) {
  const res = resolveBoxEntityCollision(v, rb);
  if (res) {
    const impactSpeed = v.getSpeed();
    v.vx = res.nx * Math.max(40, impactSpeed * 0.35);
    v.vy = res.ny * Math.max(40, impactSpeed * 0.35);

    if (impactSpeed > 140) {
      audio.crash();
      if (v.driver === player) addShake(6);
      spawnSparks(res.closestX, res.closestY, '#f1c40f', 7);
      v.takeDamage(Math.round((impactSpeed - 120) * 0.12), (veh) => spawnExplosion(veh.x, veh.y));
      if (v.driver === player) {
        player.addWanted(1);
      }
    }
  }
}

function updatePoliceAndRoadblocks(dt) {
  if (player.wantedLevel <= 0) {
    policeSpawnCooldown = 0;
    roadblockCooldown = 0;
    roadblocks.length = 0;
    return;
  }

  for (const v of vehicles) {
    if (v.isPolice && v.parkedInLot) {
      v.parkedInLot = false;
    }
  }

  policeSpawnCooldown -= dt;
  const activePolice = vehicles.filter((v) => v.isPolice && !v.exploded).length;
  const maxPolice = Math.min(7, player.wantedLevel + 1);

  if (policeSpawnCooldown <= 0 && activePolice < maxPolice) {
    policeSpawnCooldown = 5.5;
    const candidates = map.roadNodes.filter((n) => {
      const d = Math.hypot(n.x - player.x, n.y - player.y);
      return d > 650 && d < 1450;
    });
    const spawnPt = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : { x: policeStation.lotX, y: policeStation.lotY };
    vehicles.push(new Vehicle(spawnPt.x, spawnPt.y, 0, 'POLICE'));
  }

  if (player.wantedLevel >= 3) {
    roadblockCooldown -= dt;
    const maxBlocks = Math.min(4, player.wantedLevel - 1);
    if (roadblockCooldown <= 0 && roadblocks.length < maxBlocks) {
      roadblockCooldown = 10;
      const candidates = map.roadNodes.filter((n) => {
        const d = Math.hypot(n.x - player.x, n.y - player.y);
        return d > 480 && d < 1100;
      });
      if (candidates.length > 0) {
        const node = candidates[Math.floor(Math.random() * candidates.length)];
        const horizontal = Math.random() < 0.5;
        roadblocks.push({
          x: node.x,
          y: node.y,
          w: horizontal ? 104 : 24,
          h: horizontal ? 24 : 104
        });
        showBanner('BARRAGE DE POLICE SIGNALÉ');
      }
    }
  }

  for (let i = roadblocks.length - 1; i >= 0; i--) {
    const rb = roadblocks[i];
    if (Math.hypot(rb.x - player.x, rb.y - player.y) > 2200) {
      roadblocks.splice(i, 1);
      continue;
    }

    for (const v of vehicles) {
      if (v.exploded) continue;
      resolveRoadblockCollision(v, rb);
    }

    if (!player.vehicle) {
      resolveBoxEntityCollision(player, rb);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.25, dt);
    p.vy *= Math.pow(0.25, dt);
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function resolveVehicleCollisions() {
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;

      if (dist > 0 && dist < minDist) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;

        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (relSpeed > 220) {
          audio.crash();
          if (a.driver === player || b.driver === player) addShake(6);
          const dmg = Math.round((relSpeed - 220) * 0.09);
          a.takeDamage(dmg, (veh) => spawnExplosion(veh.x, veh.y));
          b.takeDamage(dmg, (veh) => spawnExplosion(veh.x, veh.y));
        }

        const tempVx = a.vx;
        const tempVy = a.vy;
        a.vx = b.vx * 0.7;
        a.vy = b.vy * 0.7;
        b.vx = tempVx * 0.7;
        b.vy = tempVy * 0.7;

        if ((a.driver === player && b.isPolice) || (b.driver === player && a.isPolice)) {
          player.addWanted(1);
        }
      }
    }
  }

  for (const v of vehicles) {
    resolveBoxEntityCollision(v, policeStation);
    map.resolveCircleCollision(v);
  }

  if (!player.vehicle) {
    resolveBoxEntityCollision(player, policeStation);
  } else if (!player.vehicle.exploded) {
    player.x = player.vehicle.x;
    player.y = player.vehicle.y;
  }
}

function drawPoliceStationAndLot(ctx, time) {
  ctx.save();
  ctx.translate(policeStation.lotX, policeStation.lotY);
  ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
  ctx.fillRect(-policeStation.lotW / 2, -policeStation.lotH / 2, policeStation.lotW, policeStation.lotH);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(-policeStation.lotW / 2, -policeStation.lotH / 2, policeStation.lotW, policeStation.lotH);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -policeStation.lotH / 2 + 4);
  ctx.lineTo(0, policeStation.lotH / 2 - 4);
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', -14, 0);
  ctx.fillText('P', 14, 0);
  ctx.restore();

  const flash = Math.sin(time * 7) > 0;
  ctx.save();
  ctx.translate(policeStation.x, policeStation.y);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(-policeStation.w / 2 + 6, -policeStation.h / 2 + 6, policeStation.w, policeStation.h);

  ctx.fillStyle = '#243447';
  ctx.fillRect(-policeStation.w / 2, -policeStation.h / 2, policeStation.w, policeStation.h);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.strokeRect(-policeStation.w / 2, -policeStation.h / 2, policeStation.w, policeStation.h);

  ctx.fillStyle = '#16202c';
  ctx.fillRect(-policeStation.w / 2 + 8, -policeStation.h / 2 + 8, policeStation.w - 16, policeStation.h - 16);

  ctx.fillStyle = flash ? '#ff3838' : '#18dcff';
  ctx.fillRect(-16, -policeStation.h / 2 + 12, 14, 6);
  ctx.fillStyle = flash ? '#18dcff' : '#ff3838';
  ctx.fillRect(2, -policeStation.h / 2 + 12, 14, 6);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLICE HQ', 0, 4);

  ctx.restore();
}

function drawTrafficLights(ctx, cam, isGreen) {
  for (const n of map.roadNodes) {
    if (
      n.x < cam.x - 60 || n.x > cam.x + cam.w + 60 ||
      n.y < cam.y - 60 || n.y > cam.y + cam.h + 60
    ) continue;

    ctx.save();
    ctx.fillStyle = isGreen ? '#2ecc71' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(n.x + 28, n.y - 28, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawSprayShops(ctx, time) {
  for (const shop of sprayShops) {
    const pulse = 1 + Math.sin(time * 5) * 0.08;
    ctx.save();
    ctx.translate(shop.x, shop.y);
    ctx.fillStyle = 'rgba(52, 152, 219, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, shop.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 1);
    ctx.restore();
  }
}

function drawMissionArrow(ctx) {
  if (!missions.activeMission) return;
  const dx = missions.activeMission.targetX - player.x;
  const dy = missions.activeMission.targetY - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 75) return;

  const angle = Math.atan2(dy, dx);
  const offset = 46;
  const ax = player.x + Math.cos(angle) * offset;
  const ay = player.y + Math.sin(angle) * offset;

  const arrowColor = missions.activeMission.type === 'DESTROY'
    ? '#ff4757'
    : missions.activeMission.type === 'STEAL'
      ? '#2ecc71'
      : '#f1c40f';

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.fillStyle = arrowColor;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, -6);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMinimap() {
  const worldW = MAP_COLS * TILE_SIZE;
  const worldH = MAP_ROWS * TILE_SIZE;
  const sx = minimap.width / worldW;
  const sy = minimap.height / worldH;

  mctx.clearRect(0, 0, minimap.width, minimap.height);
  mctx.fillStyle = '#181818';
  mctx.fillRect(0, 0, minimap.width, minimap.height);

  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const tile = map.grid[r][c];
      if (tile === 0) {
        mctx.fillStyle = '#555';
        mctx.fillRect(c * TILE_SIZE * sx, r * TILE_SIZE * sy, TILE_SIZE * sx + 0.5, TILE_SIZE * sy + 0.5);
      } else if (tile === 3) {
        mctx.fillStyle = '#1e4620';
        mctx.fillRect(c * TILE_SIZE * sx, r * TILE_SIZE * sy, TILE_SIZE * sx + 0.5, TILE_SIZE * sy + 0.5);
      }
    }
  }

  for (const phone of missions.phones) {
    mctx.fillStyle = '#f1c40f';
    mctx.fillRect(phone.x * sx - 2, phone.y * sy - 2, 4, 4);
  }

  mctx.fillStyle = '#38bdf8';
  mctx.fillRect(policeStation.x * sx - 4, policeStation.y * sy - 4, 8, 8);
  mctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
  mctx.fillRect(policeStation.lotX * sx - 4, policeStation.lotY * sy - 4, 8, 8);

  for (const shop of sprayShops) {
    mctx.fillStyle = '#3498db';
    mctx.fillRect(shop.x * sx - 3, shop.y * sy - 3, 6, 6);
  }

  for (const rb of roadblocks) {
    mctx.fillStyle = '#e74c3c';
    mctx.fillRect(rb.x * sx - 2.5, rb.y * sy - 2.5, 5, 5);
  }

  for (const v of vehicles) {
    if (v.exploded) continue;
    mctx.fillStyle = v.isPolice ? '#3498db' : '#95a5a6';
    mctx.fillRect(v.x * sx - 1.5, v.y * sy - 1.5, 3, 3);
  }

  if (missions.activeMission) {
    mctx.fillStyle = missions.activeMission.type === 'DESTROY'
      ? '#ff4757'
      : missions.activeMission.type === 'STEAL'
        ? '#2ecc71'
        : '#f1c40f';
    mctx.beginPath();
    mctx.arc(missions.activeMission.targetX * sx, missions.activeMission.targetY * sy, 4, 0, Math.PI * 2);
    mctx.fill();
  }

  mctx.fillStyle = '#e74c3c';
  mctx.beginPath();
  mctx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
  mctx.fill();
}

function drawGameOverOverlay(ctx) {
  if (!gameOverScreen) return;
  const isWasted = gameOverScreen === 'WASTED';

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 56px monospace';
  ctx.fillStyle = isWasted ? '#ff4757' : '#38bdf8';
  ctx.fillText(isWasted ? 'WASTED' : 'BUSTED', canvas.width / 2, canvas.height / 2 - 28);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('APPUYE SUR ENTRÉE OU ESPACE POUR REPARTIR', canvas.width / 2, canvas.height / 2 + 24);
  ctx.restore();
}

function updateHUD() {
  hudCash.textContent = `$${player.cash} • ${missions.completedCount}M / ${player.kills}K`;
  hudHealth.textContent = player.armor > 0
    ? `${Math.ceil(player.health)}% / ${Math.ceil(player.armor)} ARM`
    : `${Math.ceil(player.health)}%`;

  const filled = '★'.repeat(player.wantedLevel);
  const empty = '☆'.repeat(5 - player.wantedLevel);
  hudWanted.textContent = filled + empty;

  const wSpec = player.currentWeaponSpec;
  const ammoLabel = wSpec.id === 'PISTOL' ? '∞' : `${player.currentAmmo}`;

  if (player.vehicle) {
    hudVehicle.classList.remove('hidden');
    hudVehName.textContent = `${player.vehicle.name} (${player.vehicle.hp} HP)`;
    hudVehSpeed.textContent = Math.round(player.vehicle.getSpeed() * 0.32);
  } else {
    hudVehicle.classList.remove('hidden');
    hudVehName.textContent = `${wSpec.name} [${ammoLabel}] • R: ARME • B: RADIO`;
    hudVehSpeed.textContent = 0;
  }

  if (missions.activeMission) {
    hudMission.classList.remove('hidden');
    hudMissionTitle.textContent = missions.activeMission.title;
    hudMissionTimer.textContent = `${Math.max(0, Math.ceil(missions.timer))}s`;
  } else {
    hudMission.classList.add('hidden');
  }
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  const elapsedSec = now / 1000;
  lastTime = now;

  if (screenShake > 0) {
    screenShake = Math.max(0, screenShake - dt * 36);
  }
  if (damageFlash > 0) {
    damageFlash = Math.max(0, damageFlash - dt);
  }

  if (!paused && !gameOverScreen) {
    audio.updateRadio(dt, player.wantedLevel);
    lightCycle = (lightCycle + dt) % 14;
    const trafficGreen = lightCycle < 9;

    player.update(dt, keys, map);

    const nextDistrict = map.getDistrictAt(player.x, player.y);
    if (nextDistrict !== currentDistrict) {
      currentDistrict = nextDistrict;
      showBanner(currentDistrict);
    }

    recordSkidmarks();
    pedManager.update(dt, map, player, vehicles, (enemy, dmg) => {
      spawnEnemyBullet(enemy.x, enemy.y, player.x, player.y, enemy.isCop ? 0.2 : 0.28, dmg);
    });
    weaponPickups.update(dt, player, (msg) => {
      showBanner(msg);
      writeSave(player, missions);
    }, audio);
    supplyPickups.update(dt, player, (msg) => {
      showBanner(msg);
      writeSave(player, missions);
    }, audio);
    updateSprayShops(dt);
    missions.update(dt, player, showBanner, audio, () => writeSave(player, missions));
    updateBullets(dt);
    updatePoliceDisembarkAndFire(dt);
    handlePedestrianVehicleHits();
    updatePoliceAndRoadblocks(dt);
    emitDamageSmoke(dt);
    updateParticles(dt);

    saveTimer += dt;
    if (saveTimer >= 5) {
      saveTimer = 0;
      writeSave(player, missions);
    }

    for (const v of vehicles) {
      if (v.driver !== player && v.isAI && !v.parkedInLot) {
        const allowMoveAtLight = v.isPolice && player.wantedLevel > 0 ? true : trafficGreen;
        v.updateAI(dt, map, player, player.wantedLevel, allowMoveAtLight, vehicles, roadblocks);
      }
    }

    resolveVehicleCollisions();
  }

  updateHUD();
  drawMinimap();

  const speed = player.vehicle ? player.vehicle.getSpeed() : 0;
  const zoom = Math.max(0.78, 1 - speed / 2600);
  const trafficGreen = lightCycle < 9;
  const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
  const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-player.x, -player.y);

  const cam = {
    x: player.x - (canvas.width / 2) / zoom,
    y: player.y - (canvas.height / 2) / zoom,
    w: canvas.width / zoom,
    h: canvas.height / zoom
  };

  map.drawGround(ctx, cam);
  drawPoliceStationAndLot(ctx, elapsedSec);
  drawTrafficLights(ctx, cam, trafficGreen);
  drawSprayShops(ctx, elapsedSec);

  for (const s of skidmarks) {
    ctx.fillStyle = `rgba(10, 10, 10, ${s.alpha})`;
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }

  for (const imp of impacts) {
    ctx.fillStyle = imp.color;
    ctx.globalAlpha = imp.alpha;
    ctx.beginPath();
    ctx.arc(imp.x, imp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const rb of roadblocks) {
    ctx.save();
    ctx.translate(rb.x, rb.y);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-rb.w / 2, -rb.h / 2, rb.w, rb.h);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.strokeRect(-rb.w / 2, -rb.h / 2, rb.w, rb.h);
    ctx.restore();
  }

  supplyPickups.draw(ctx, elapsedSec);
  weaponPickups.draw(ctx, elapsedSec);
  missions.draw(ctx, elapsedSec);
  pedManager.draw(ctx, cam);

  for (const v of vehicles) {
    v.draw(ctx);
  }

  player.draw(ctx);
  drawMissionArrow(ctx);

  for (const b of bullets) {
    ctx.fillStyle = b.color || '#fff200';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  map.drawRoofs(ctx, cam);

  ctx.restore();

  if (damageFlash > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 56, 56, ${Math.min(0.32, damageFlash)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  drawGameOverOverlay(ctx);

  requestAnimationFrame(loop);
}

showBanner(`BIENVENUE À LIBERTY CITY — ${currentDistrict}`);
requestAnimationFrame(loop);
