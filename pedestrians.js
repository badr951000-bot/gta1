const CIV_PALETTES = [
  { shirt: '#e67e22', pants: '#2c3e50', skin: '#f1c27d', hair: '#1c1917' },
  { shirt: '#3498db', pants: '#1e293b', skin: '#e0ac69', hair: '#3b2314' },
  { shirt: '#9b59b6', pants: '#27272a', skin: '#8d5524', hair: '#18181b' },
  { shirt: '#1abc9c', pants: '#334155', skin: '#ffdbac', hair: '#78350f' },
  { shirt: '#e84393', pants: '#1f2937', skin: '#c68642', hair: '#111827' },
  { shirt: '#f39c12', pants: '#292524', skin: '#f1c27d', hair: '#451a03' },
  { shirt: '#ecf0f1', pants: '#0f172a', skin: '#d99b66', hair: '#09090b' }
];

export class Pedestrian {
  constructor(x, y, angle = 0, options = {}) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.radius = 9;
    this.walkSpeed = 62;
    this.fleeSpeed = 152;
    this.chaseSpeed = 138;
    this.hp = options.hp ?? 30;
    this.alive = true;
    this.isCop = Boolean(options.isCop);
    this.isHostileCiv = Boolean(options.isHostileCiv);
    this.state = this.isCop || this.isHostileCiv ? 'CHASE' : 'WALK'; // 'WALK' | 'FLEE' | 'CHASE'
    this.target = null;
    this.fleeTimer = 0;
    this.fireCooldown = 0.6 + Math.random() * 0.5;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.isMoving = false;

    const palette = CIV_PALETTES[Math.floor(Math.random() * CIV_PALETTES.length)];
    this.shirtColor = this.isCop ? '#172554' : this.isHostileCiv ? '#991b1b' : palette.shirt;
    this.pantsColor = this.isCop ? '#0f172a' : palette.pants;
    this.skinColor = this.isCop ? '#e0ac69' : palette.skin;
    this.hairColor = this.isCop ? '#090d16' : palette.hair;
    this.hasHat = !this.isCop && Math.random() < 0.35;
  }

  fleeFrom(sourceX, sourceY, duration = 4.5) {
    if (!this.alive || this.isCop || this.isHostileCiv) return;
    this.state = 'FLEE';
    this.fleeTimer = duration;
    this.angle = Math.atan2(this.y - sourceY, this.x - sourceX);
  }

  provoke(sourceX, sourceY) {
    if (!this.alive || this.isCop) return;
    if (Math.random() < 0.25) {
      this.isHostileCiv = true;
      this.shirtColor = '#991b1b';
      this.state = 'CHASE';
      this.fireCooldown = 0.45;
    } else {
      this.fleeFrom(sourceX, sourceY, 5.5);
    }
  }

  takeDamage(amount, onKill) {
    if (!this.alive) return;
    this.hp -= amount;
    if (!this.isCop && !this.isHostileCiv) {
      this.state = 'FLEE';
      this.fleeTimer = 5;
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      if (onKill) onKill(this);
    }
  }

  pickSidewalkTarget(map) {
    const candidates = [];
    for (let i = 0; i < 18; i++) {
      const c = Math.floor(Math.random() * map.cols);
      const r = Math.floor(Math.random() * map.rows);
      const tile = map.grid[r]?.[c];
      if (tile === 1 || tile === 3) {
        const px = c * map.tileSize + map.tileSize * (0.25 + Math.random() * 0.5);
        const py = r * map.tileSize + map.tileSize * (0.25 + Math.random() * 0.5);
        const dist = Math.hypot(px - this.x, py - this.y);
        if (dist > 140 && dist < 650) {
          candidates.push({ x: px, y: py });
        }
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)] || null;
  }

  update(dt, map, player, vehicles = [], onEnemyShoot = null) {
    if (!this.alive) return;
    this.isMoving = false;

    if (this.isCop || this.isHostileCiv) {
      if (this.isCop && player.wantedLevel <= 0) {
        this.alive = false;
        return;
      }

      if (this.fireCooldown > 0) {
        this.fireCooldown -= dt;
      }

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.angle = Math.atan2(dy, dx);

      if (dist > 95) {
        const nextX = this.x + (dx / dist) * this.chaseSpeed * dt;
        const nextY = this.y + (dy / dist) * this.chaseSpeed * dt;
        if (!map.isSolidAt(nextX, nextY)) {
          this.x = nextX;
          this.y = nextY;
          this.isMoving = true;
        } else {
          this.x += Math.cos(this.angle + Math.PI * 0.4) * this.chaseSpeed * 0.7 * dt;
          this.y += Math.sin(this.angle + Math.PI * 0.4) * this.chaseSpeed * 0.7 * dt;
          this.isMoving = true;
        }
        map.resolveCircleCollision(this);
      }

      if (this.isMoving) {
        this.walkPhase += dt * 13;
      }

      if (dist < 260 && this.fireCooldown <= 0 && onEnemyShoot) {
        this.fireCooldown = this.isCop
          ? Math.max(0.55, 1.25 - player.wantedLevel * 0.12)
          : 1.15;
        onEnemyShoot(this, this.isCop ? 6 : 5);
      }
      return;
    }

    for (const v of vehicles) {
      if (v.exploded) continue;
      const d = Math.hypot(v.x - this.x, v.y - this.y);
      if (d < 95 && v.getSpeed() > 110) {
        this.fleeFrom(v.x, v.y, 2.5);
        break;
      }
    }

    const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    const playerSpeed = player.vehicle ? player.vehicle.getSpeed() : 0;

    if (distToPlayer < 160 && (playerSpeed > 240 || player.wantedLevel >= 2)) {
      this.fleeFrom(player.x, player.y, 3.5);
    }

    if (this.state === 'FLEE') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'WALK';
        this.target = this.pickSidewalkTarget(map);
      }

      const nextX = this.x + Math.cos(this.angle) * this.fleeSpeed * dt;
      const nextY = this.y + Math.sin(this.angle) * this.fleeSpeed * dt;

      if (map.isSolidAt(nextX, nextY)) {
        this.angle += Math.PI * 0.65;
      } else {
        this.x = nextX;
        this.y = nextY;
        this.isMoving = true;
      }
      if (this.isMoving) this.walkPhase += dt * 15;
      map.resolveCircleCollision(this);
      return;
    }

    if (!this.target || Math.hypot(this.target.x - this.x, this.target.y - this.y) < 22) {
      this.target = this.pickSidewalkTarget(map);
    }

    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      this.angle = Math.atan2(dy, dx);

      const nextX = this.x + (dx / len) * this.walkSpeed * dt;
      const nextY = this.y + (dy / len) * this.walkSpeed * dt;

      if (map.isSolidAt(nextX, nextY)) {
        this.target = this.pickSidewalkTarget(map);
      } else {
        this.x = nextX;
        this.y = nextY;
        this.isMoving = true;
      }
      if (this.isMoving) this.walkPhase += dt * 9;
      map.resolveCircleCollision(this);
    }
  }

  draw(ctx) {
    if (!this.alive) return;

    const swing = this.isMoving ? Math.sin(this.walkPhase) * 3.5 : 0;
    const armed = this.isCop || this.isHostileCiv;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 2.5, 8, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.shirtColor;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.4;

    if (armed) {
      ctx.fillRect(0, -9, 6, 4);
      ctx.strokeRect(0, -9, 6, 4);
      ctx.fillRect(2, 5, 11, 4.2);
      ctx.strokeRect(2, 5, 11, 4.2);

      ctx.fillStyle = '#1f2937';
      ctx.fillRect(11, 5.2, 6, 3);
    } else {
      ctx.fillRect(-3 + swing * 0.6, -10.5, 6, 3.5);
      ctx.strokeRect(-3 + swing * 0.6, -10.5, 6, 3.5);
      ctx.fillRect(-3 - swing * 0.6, 7, 6, 3.5);
      ctx.strokeRect(-3 - swing * 0.6, 7, 6, 3.5);
    }

    ctx.fillStyle = this.shirtColor;
    ctx.beginPath();
    ctx.roundRect(-6.5, -8.5, 13, 17, 4);
    ctx.fill();
    ctx.strokeStyle = this.isCop ? '#60a5fa' : this.isHostileCiv ? '#f87171' : '#090d16';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    if (this.isCop) {
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(-2, -8, 4, 16);
    }

    ctx.fillStyle = this.skinColor;
    ctx.beginPath();
    ctx.arc(1.5, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (this.isCop) {
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(0.5, 0, 5.4, Math.PI * 0.55, Math.PI * 1.45);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(3.5, -3.5, 3.5, 7);
    } else if (this.hasHat) {
      ctx.fillStyle = this.isHostileCiv ? '#dc2626' : '#ef4444';
      ctx.beginPath();
      ctx.arc(0.5, 0, 5.3, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fill();
      ctx.fillRect(3, -3, 3.5, 6);
    } else {
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.arc(-0.2, 0, 5.1, Math.PI * 0.6, Math.PI * 1.4);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class PedestrianManager {
  constructor(map, count = 45) {
    this.map = map;
    this.count = count;
    this.peds = [];
    this.respawnTimer = 0;
    this.spawnInitial();
  }

  spawnCop(x, y, angle = 0) {
    const activeCops = this.peds.filter((p) => p.alive && p.isCop).length;
    if (activeCops >= 8) return;
    const cop = new Pedestrian(x, y, angle, { isCop: true, hp: 55 });
    this.map.resolveCircleCollision(cop);
    this.peds.push(cop);
  }

  spawnSidewalkPoint() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const c = Math.floor(Math.random() * this.map.cols);
      const r = Math.floor(Math.random() * this.map.rows);
      const tile = this.map.grid[r]?.[c];
      if (tile === 1 || tile === 3) {
        return {
          x: c * this.map.tileSize + this.map.tileSize * (0.2 + Math.random() * 0.6),
          y: r * this.map.tileSize + this.map.tileSize * (0.2 + Math.random() * 0.6)
        };
      }
    }
    const fallback = this.map.roadNodes[0];
    return { x: fallback.x + 52, y: fallback.y };
  }

  spawnInitial() {
    this.peds = [];
    for (let i = 0; i < this.count; i++) {
      const pt = this.spawnSidewalkPoint();
      this.peds.push(new Pedestrian(pt.x, pt.y, Math.random() * Math.PI * 2));
    }
  }

  alertAround(x, y, radius = 260) {
    for (const p of this.peds) {
      if (!p.alive || p.isCop) continue;
      if (Math.hypot(p.x - x, p.y - y) <= radius) {
        p.provoke(x, y);
      }
    }
  }

  update(dt, map, player, vehicles = [], onEnemyShoot = null) {
    for (const p of this.peds) {
      p.update(dt, map, player, vehicles, onEnemyShoot);
    }

    this.peds = this.peds.filter((p) => p.alive);

    this.respawnTimer += dt;
    if (this.respawnTimer >= 4) {
      this.respawnTimer = 0;
      const civCount = this.peds.filter((p) => !p.isCop).length;
      if (civCount < this.count) {
        const pt = this.spawnSidewalkPoint();
        this.peds.push(new Pedestrian(pt.x, pt.y, Math.random() * Math.PI * 2));
      }
    }
  }

  draw(ctx, cam) {
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (
        p.x < cam.x - 40 || p.x > cam.x + cam.w + 40 ||
        p.y < cam.y - 40 || p.y > cam.y + cam.h + 40
      ) continue;
      p.draw(ctx);
    }
  }
}