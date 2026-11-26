export const WEAPONS = {
  PISTOL: {
    id: 'PISTOL',
    name: '9MM PISTOL',
    damage: 22,
    cooldown: 0.22,
    pellets: 1,
    spread: 0.04,
    speed: 780,
    color: '#fff200'
  },
  SMG: {
    id: 'SMG',
    name: 'MICRO SMG',
    damage: 15,
    cooldown: 0.09,
    pellets: 1,
    spread: 0.11,
    speed: 820,
    color: '#ffeaa7'
  },
  SHOTGUN: {
    id: 'SHOTGUN',
    name: 'PUMP SHOTGUN',
    damage: 16,
    cooldown: 0.58,
    pellets: 6,
    spread: 0.26,
    speed: 700,
    color: '#ff9f43'
  }
};

const WEAPON_ORDER = ['PISTOL', 'SMG', 'SHOTGUN'];

export class Player {
  constructor(x, y, saved = null) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.radius = 10;
    this.speed = 195;
    this.health = 100;
    this.armor = saved?.armor ?? 0;
    this.cash = saved?.cash ?? 0;
    this.kills = saved?.kills ?? 0;
    this.wantedLevel = 0;
    this.wantedDecayTimer = 0;
    this.shootCooldown = 0;
    this.walkPhase = 0;
    this.isMoving = false;
    this.vehicle = null;
    this.enterCooldown = 0;

    const validWeapons = Array.isArray(saved?.weapons)
      ? saved.weapons.filter((w) => WEAPONS[w])
      : ['PISTOL'];
    this.weapons = validWeapons.length > 0 ? validWeapons : ['PISTOL'];
    this.weaponIndex = 0;
    this.ammo = {
      PISTOL: Infinity,
      SMG: saved?.ammo?.SMG ?? 0,
      SHOTGUN: saved?.ammo?.SHOTGUN ?? 0
    };
  }

  get currentWeaponId() {
    return this.weapons[this.weaponIndex] || 'PISTOL';
  }

  get currentWeaponSpec() {
    return WEAPONS[this.currentWeaponId] || WEAPONS.PISTOL;
  }

  get currentAmmo() {
    const id = this.currentWeaponId;
    return id === 'PISTOL' ? Infinity : (this.ammo[id] ?? 0);
  }

  giveWeapon(weaponId, ammoAmount, showBanner) {
    if (!WEAPONS[weaponId]) return;
    const wasOwned = this.weapons.includes(weaponId);
    if (!wasOwned) {
      this.weapons.push(weaponId);
      this.weaponIndex = this.weapons.length - 1;
    }
    if (weaponId !== 'PISTOL') {
      this.ammo[weaponId] = (this.ammo[weaponId] || 0) + ammoAmount;
    }
    if (showBanner) {
      showBanner(`${WEAPONS[weaponId].name} (+${ammoAmount} MUN.)`);
    }
  }

  cycleWeapon(showBanner) {
    if (this.weapons.length <= 1) return;
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
    const spec = this.currentWeaponSpec;
    const ammoText = spec.id === 'PISTOL' ? '∞' : `${this.currentAmmo}`;
    if (showBanner) {
      showBanner(`ARME : ${spec.name} (${ammoText})`);
    }
  }

  addWanted(amount = 1) {
    this.wantedLevel = Math.min(5, this.wantedLevel + amount);
    this.wantedDecayTimer = 9;
  }

  takeDamage(amount) {
    if (this.health <= 0) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);

    if (this.health === 0) {
      this.health = 100;
      this.armor = 0;
      this.wantedLevel = 0;
      this.cash = Math.max(0, this.cash - 150);
      if (this.vehicle) {
        this.vehicle.driver = null;
        this.vehicle = null;
      }
    }
  }

  canShoot() {
    if (this.shootCooldown > 0) return false;
    const id = this.currentWeaponId;
    if (id === 'PISTOL') return true;
    return (this.ammo[id] || 0) > 0;
  }

  createBullets() {
    const spec = this.currentWeaponSpec;
    if (spec.id !== 'PISTOL') {
      if ((this.ammo[spec.id] || 0) <= 0) {
        this.weaponIndex = 0;
        return [];
      }
      this.ammo[spec.id] = Math.max(0, this.ammo[spec.id] - 1);
      if (this.ammo[spec.id] === 0 && this.weaponIndex > 0) {
        this.weaponIndex = 0;
      }
    }

    this.shootCooldown = spec.cooldown;
    const originX = this.vehicle ? this.vehicle.x : this.x;
    const originY = this.vehicle ? this.vehicle.y : this.y;
    const originAngle = this.vehicle ? this.vehicle.angle : this.angle;

    const spawned = [];
    for (let i = 0; i < spec.pellets; i++) {
      const spreadOffset = (Math.random() - 0.5) * spec.spread;
      const finalAngle = originAngle + spreadOffset;
      spawned.push({
        fromPlayer: true,
        x: originX + Math.cos(finalAngle) * 18,
        y: originY + Math.sin(finalAngle) * 18,
        vx: Math.cos(finalAngle) * spec.speed,
        vy: Math.sin(finalAngle) * spec.speed,
        life: 0.65,
        damage: spec.damage,
        color: spec.color
      });
    }
    return spawned;
  }

  toggleVehicle(vehicles, showBanner) {
    if (this.enterCooldown > 0) return;
    this.enterCooldown = 0.35;

    if (this.vehicle) {
      const exitAngle = this.vehicle.angle - Math.PI / 2;
      this.x = this.vehicle.x + Math.cos(exitAngle) * 28;
      this.y = this.vehicle.y + Math.sin(exitAngle) * 28;
      this.vehicle.driver = null;
      this.vehicle.isAI = true;
      this.vehicle = null;
      if (showBanner) showBanner('SORTI DU VÉHICULE');
      return;
    }

    let nearest = null;
    let bestDist = 46;
    for (const v of vehicles) {
      if (v.exploded) continue;
      const d = Math.hypot(v.x - this.x, v.y - this.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = v;
      }
    }

    if (nearest) {
      if (nearest.driver && nearest.driver !== this) {
        nearest.driver = null;
      }
      nearest.driver = this;
      nearest.isAI = false;
      this.vehicle = nearest;
      this.x = nearest.x;
      this.y = nearest.y;
      if (nearest.isPolice) {
        this.addWanted(2);
      }
      if (showBanner) showBanner(`À BORD : ${nearest.name}`);
    }
  }

  update(dt, keys, map) {
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.enterCooldown > 0) this.enterCooldown -= dt;
    this.isMoving = false;

    if (this.wantedLevel > 0) {
      this.wantedDecayTimer -= dt;
      if (this.wantedDecayTimer <= 0) {
        this.wantedLevel -= 1;
        this.wantedDecayTimer = 9;
      }
    }

    if (this.vehicle) {
      if (this.vehicle.exploded) {
        this.takeDamage(35);
        this.x = this.vehicle.x + 26;
        this.y = this.vehicle.y;
        this.vehicle.driver = null;
        this.vehicle = null;
        return;
      }
      this.vehicle.updatePlayerControl(dt, keys, map);
      this.x = this.vehicle.x;
      this.y = this.vehicle.y;
      this.angle = this.vehicle.angle;
      return;
    }

    let vx = 0;
    let vy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) vy -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) vy += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) vx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) vx += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx /= len;
      vy /= len;
      this.angle = Math.atan2(vy, vx);
      this.isMoving = true;
      this.walkPhase += dt * 12;

      const nextX = this.x + vx * this.speed * dt;
      const nextY = this.y + vy * this.speed * dt;

      if (!map.isSolidAt(nextX, this.y)) this.x = nextX;
      if (!map.isSolidAt(this.x, nextY)) this.y = nextY;
      map.resolveCircleCollision(this);
    }
  }

  draw(ctx) {
    if (this.vehicle) return;

    const swing = this.isMoving ? Math.sin(this.walkPhase) * 4 : 0;
    const gunLen = this.currentWeaponId === 'SHOTGUN' ? 12 : this.currentWeaponId === 'SMG' ? 9 : 7;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Ombre au sol
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 9, 11.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bras droit (tient l'arme) + bras gauche d'appui
    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.5;

    ctx.fillRect(1, -10.5, 6, 3.8);
    ctx.strokeRect(1, -10.5, 6, 3.8);

    ctx.fillRect(2, 6.8, 10, 4.2);
    ctx.strokeRect(2, 6.8, 10, 4.2);

    // Arme visible dans la main
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(10, 7.2, gunLen, 3.2);
    ctx.strokeRect(10, 7.2, gunLen, 3.2);

    // Blouson / épaules (avec léger mouvement de marche)
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.roundRect(-7, -9.5, 14, 19, 4.5);
    ctx.fill();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.7;
    ctx.stroke();

    // Détail col / zip
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(-3, -6.5, 6, 13);

    // Tête
    ctx.fillStyle = '#e0ac69';
    ctx.beginPath();
    ctx.arc(1.5, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cheveux bouclés denses à l'arrière / côtés
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(-0.8, 0, 5.8, Math.PI * 0.52, Math.PI * 1.48);
    ctx.fill();
    ctx.stroke();

    if (swing !== 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-5, -1, 4, 2);
    }

    ctx.restore();
  }
}

export { WEAPON_ORDER };