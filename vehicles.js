export const VEHICLE_TYPES = {
  SPORT: {
    name: 'BANSHEE GT',
    color: '#e74c3c',
    stripe: '#ffffff',
    width: 48,
    height: 24,
    maxSpeed: 720,
    accel: 560,
    brake: 680,
    turnSpeed: 3.6,
    grip: 0.93,
    driftGrip: 0.975,
    maxHp: 100
  },
  SEDAN: {
    name: 'TAXI / BERLINE',
    color: '#f1c40f',
    stripe: '#2c3e50',
    width: 46,
    height: 24,
    maxSpeed: 540,
    accel: 420,
    brake: 540,
    turnSpeed: 3.05,
    grip: 0.91,
    driftGrip: 0.965,
    maxHp: 110
  },
  MUSCLE: {
    name: 'STALLION V8',
    color: '#2980b9',
    stripe: '#ecf0f1',
    width: 50,
    height: 25,
    maxSpeed: 640,
    accel: 510,
    brake: 580,
    turnSpeed: 3.25,
    grip: 0.9,
    driftGrip: 0.98,
    maxHp: 120
  },
  VAN: {
    name: 'RUMPO VAN',
    color: '#95a5a6',
    stripe: '#34495e',
    width: 56,
    height: 28,
    maxSpeed: 460,
    accel: 340,
    brake: 450,
    turnSpeed: 2.55,
    grip: 0.89,
    driftGrip: 0.96,
    maxHp: 180
  },
  POLICE: {
    name: 'POLICE PATROL',
    color: '#1e272e',
    stripe: '#ffffff',
    width: 48,
    height: 24,
    maxSpeed: 690,
    accel: 540,
    brake: 640,
    turnSpeed: 3.45,
    grip: 0.935,
    driftGrip: 0.97,
    maxHp: 130,
    isPolice: true
  }
};

const DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function snapCardinal(angle) {
  let best = DIRS[0];
  let bestDiff = Infinity;
  for (const d of DIRS) {
    let diff = Math.abs(angle - d);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

export class Vehicle {
  constructor(x, y, angle, typeKey = 'SEDAN') {
    const spec = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.SEDAN;
    Object.assign(this, spec);

    this.typeKey = typeKey;
    this.x = x;
    this.y = y;
    this.angle = snapCardinal(angle);
    this.vx = 0;
    this.vy = 0;
    this.radius = typeKey === 'VAN' ? 24 : 20;
    this.hp = this.maxHp;
    this.exploded = false;
    this.driver = null;
    this.isAI = true;
    this.aiTarget = null;
    this.sirenTimer = 0;
    this.smokeTimer = 0;
    this.stuckTimer = 0;
    this.turnCooldown = 0.4;
    this.lastPosX = x;
    this.lastPosY = y;
    this.rogueTimer = 0;
    this.rogueCooldown = 10 + Math.random() * 14;
    this.laneOffset = 12;
  }

  getSpeed() {
    return Math.hypot(this.vx, this.vy);
  }

  takeDamage(amount, onExplode) {
    if (this.exploded) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.exploded = true;
      this.vx = 0;
      this.vy = 0;
      if (onExplode) onExplode(this);
    }
  }

  updatePlayerControl(dt, keys, map) {
    if (this.exploded) return;

    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    let forwardSpeed = this.vx * forwardX + this.vy * forwardY;
    let lateralSpeed = this.vx * rightX + this.vy * rightY;

    const up = keys['KeyW'] || keys['ArrowUp'];
    const down = keys['KeyS'] || keys['ArrowDown'];
    const left = keys['KeyA'] || keys['ArrowLeft'];
    const right = keys['KeyD'] || keys['ArrowRight'];
    const handbrake = keys['Space'];

    if (up) forwardSpeed += this.accel * dt;
    if (down) {
      if (forwardSpeed > 20) forwardSpeed -= this.brake * dt;
      else forwardSpeed -= this.accel * 0.65 * dt;
    }

    forwardSpeed *= Math.pow(0.45, dt);
    forwardSpeed = Math.max(-this.maxSpeed * 0.45, Math.min(this.maxSpeed, forwardSpeed));

    const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 120);
    const reverseSign = forwardSpeed >= 0 ? 1 : -1;
    const turnBoost = handbrake ? 1.28 : 1.0;

    if (left) this.angle -= this.turnSpeed * speedFactor * reverseSign * turnBoost * dt;
    if (right) this.angle += this.turnSpeed * speedFactor * reverseSign * turnBoost * dt;

    const gripFactor = handbrake ? this.driftGrip : this.grip;
    lateralSpeed *= Math.pow(1 - gripFactor, dt * 10);

    const newForwardX = Math.cos(this.angle);
    const newForwardY = Math.sin(this.angle);
    const newRightX = -newForwardY;
    const newRightY = newForwardX;

    this.vx = newForwardX * forwardSpeed + newRightX * lateralSpeed;
    this.vy = newForwardY * forwardSpeed + newRightY * lateralSpeed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (map.resolveCircleCollision(this)) {
      const impact = this.getSpeed();
      this.vx *= -0.35;
      this.vy *= -0.35;
      if (impact > 260) {
        this.takeDamage(Math.round((impact - 260) * 0.08));
      }
    }

    if (this.isPolice) this.sirenTimer += dt * 8;
  }

  isRoadTile(map, x, y) {
    const c = Math.floor(x / map.tileSize);
    const r = Math.floor(y / map.tileSize);
    return map.grid[r]?.[c] === 0;
  }

  chooseDirectionAtIntersection(map, playerTarget, wantedLevel) {
    const dir = snapCardinal(this.angle);
    const leftAngle = snapCardinal(dir - Math.PI / 2);
    const rightAngle = snapCardinal(dir + Math.PI / 2);
    const backAngle = snapCardinal(dir + Math.PI);

    const checkAhead = (ang) => {
      const px = this.x + Math.cos(ang) * (map.tileSize * 1.15);
      const py = this.y + Math.sin(ang) * (map.tileSize * 1.15);
      return this.isRoadTile(map, px, py);
    };

    const options = [dir, leftAngle, rightAngle].filter(checkAhead);
    if (options.length === 0) {
      return checkAhead(backAngle) ? backAngle : rightAngle;
    }

    if (this.isPolice && wantedLevel > 0 && playerTarget) {
      let best = options[0];
      let bestDist = Infinity;
      for (const opt of options) {
        const tx = this.x + Math.cos(opt) * 120;
        const ty = this.y + Math.sin(opt) * 120;
        const d = Math.hypot(playerTarget.x - tx, playerTarget.y - ty);
        if (d < bestDist) {
          bestDist = d;
          best = opt;
        }
      }
      return best;
    }

    return options[Math.floor(Math.random() * options.length)];
  }

  hasObstacleAhead(allVehicles, roadblocks, lookDist = 72) {
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const probeX = this.x + fx * (lookDist * 0.6);
    const probeY = this.y + fy * (lookDist * 0.6);

    for (const other of allVehicles) {
      if (other === this || other.exploded) continue;
      if (Math.hypot(other.x - probeX, other.y - probeY) < this.radius + other.radius + 10) {
        return true;
      }
    }

    for (const rb of roadblocks) {
      if (Math.hypot(rb.x - probeX, rb.y - probeY) < this.radius + 30) {
        return true;
      }
    }

    return false;
  }

  updateAI(dt, map, playerTarget, wantedLevel, trafficGreen = true, allVehicles = [], roadblocks = []) {
    if (this.exploded) return;
    if (this.isPolice) this.sirenTimer += dt * 8;
    if (this.turnCooldown > 0) this.turnCooldown -= dt;

    this.rogueCooldown -= dt;
    if (this.rogueTimer > 0) {
      this.rogueTimer -= dt;
    } else if (this.rogueCooldown <= 0 && !this.isPolice) {
      this.rogueCooldown = 12 + Math.random() * 14;
      if (Math.random() < 0.22) {
        this.rogueTimer = 0.8 + Math.random() * 0.6;
      }
    }

    const movedDist = Math.hypot(this.x - this.lastPosX, this.y - this.lastPosY);
    if (movedDist < 2.2) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
      this.lastPosX = this.x;
      this.lastPosY = this.y;
    }

    if (this.stuckTimer > 0.9 && this.turnCooldown <= 0) {
      this.stuckTimer = 0;
      this.turnCooldown = 0.5;
      this.angle = this.chooseDirectionAtIntersection(map, playerTarget, wantedLevel);
    }

    const isRogue = this.rogueTimer > 0;
    const blocked = this.hasObstacleAhead(allVehicles, roadblocks, 72);

    const nearNode = (map.roadNodes || []).find(
      (n) => Math.hypot(n.x - this.x, n.y - this.y) < 34
    );

    if (nearNode && this.turnCooldown <= 0) {
      if (!trafficGreen && !isRogue && !(this.isPolice && wantedLevel > 0)) {
        this.vx = 0;
        this.vy = 0;
        return;
      }
      this.turnCooldown = 0.65;
      this.angle = this.chooseDirectionAtIntersection(map, playerTarget, wantedLevel);
    }

    const dir = snapCardinal(this.angle);
    const fx = Math.cos(dir);
    const fy = Math.sin(dir);
    const rx = -fy;
    const ry = fx;

    let laneCorrection = 0;
    if (!isRogue && nearNode) {
      const desiredLateral = this.laneOffset;
      const currentLateral = (this.x - nearNode.x) * rx + (this.y - nearNode.y) * ry;
      laneCorrection = (desiredLateral - currentLateral) * 0.08;
    }

    const baseSpeed = this.isPolice && wantedLevel > 0
      ? Math.min(this.maxSpeed * 0.85, 310 + wantedLevel * 28)
      : (this.typeKey === 'VAN' ? 150 : 185);

    const speed = blocked ? 0 : baseSpeed * (isRogue ? 1.2 : 1);
    const targetAngle = isRogue ? dir + 0.35 : dir;
    this.steerTowards(targetAngle, dt, 6.5);

    this.vx = fx * speed + rx * laneCorrection;
    this.vy = fy * speed + ry * laneCorrection;

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;

    if (!isRogue && !this.isRoadTile(map, nextX, nextY) && this.turnCooldown <= 0) {
      this.turnCooldown = 0.5;
      this.angle = this.chooseDirectionAtIntersection(map, playerTarget, wantedLevel);
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (map.resolveCircleCollision(this) && this.turnCooldown <= 0) {
      this.turnCooldown = 0.5;
      this.angle = this.chooseDirectionAtIntersection(map, playerTarget, wantedLevel);
    }
  }

  steerTowards(targetAngle, dt, turnRate) {
    let diff = targetAngle - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 4, this.width, this.height);

    ctx.fillStyle = this.exploded ? '#2d3436' : this.color;
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

    if (!this.exploded) {
      ctx.fillStyle = this.stripe;
      ctx.fillRect(-this.width * 0.22, -this.height / 2 + 2, this.width * 0.44, this.height - 4);

      ctx.fillStyle = '#1e272e';
      ctx.fillRect(this.width * 0.12, -this.height / 2 + 3, this.width * 0.18, this.height - 6);
      ctx.fillRect(-this.width * 0.32, -this.height / 2 + 3, this.width * 0.14, this.height - 6);

      ctx.fillStyle = '#fff200';
      ctx.fillRect(this.width / 2 - 3, -this.height / 2 + 3, 3, 5);
      ctx.fillRect(this.width / 2 - 3, this.height / 2 - 8, 3, 5);

      if (this.isPolice) {
        const flash = Math.sin(this.sirenTimer) > 0;
        ctx.fillStyle = flash ? '#ff3838' : '#18dcff';
        ctx.fillRect(-3, -this.height / 2 + 2, 6, this.height / 2 - 2);
        ctx.fillStyle = flash ? '#18dcff' : '#ff3838';
        ctx.fillRect(-3, 0, 6, this.height / 2 - 2);
      }
    }

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

    ctx.restore();
  }
}