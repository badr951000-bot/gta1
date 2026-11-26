export const WEAPON_SPECS = {
  PISTOL: {
    id: 'PISTOL',
    name: 'PISTOLET',
    cooldown: 0.18,
    pellets: 1,
    spread: 0.02,
    speed: 980,
    damage: 24,
    life: 0.75,
    color: '#fff200'
  },
  SMG: {
    id: 'SMG',
    name: 'MITRAILLETTE',
    cooldown: 0.08,
    pellets: 1,
    spread: 0.11,
    speed: 1050,
    damage: 16,
    life: 0.7,
    color: '#ff9f43'
  },
  SHOTGUN: {
    id: 'SHOTGUN',
    name: 'FUSIL À POMPE',
    cooldown: 0.55,
    pellets: 6,
    spread: 0.28,
    speed: 880,
    damage: 17,
    life: 0.45,
    color: '#ff6b6b'
  }
};

export class WeaponPickupManager {
  constructor(map) {
    this.map = map;
    this.pickups = [];
    this.spawnTimer = 0;
    this.spawnInitial();
  }

  randomStreetPoint() {
    for (let attempt = 0; attempt < 30; attempt++) {
      const c = Math.floor(Math.random() * this.map.cols);
      const r = Math.floor(Math.random() * this.map.rows);
      const tile = this.map.grid[r]?.[c];
      if (tile === 0 || tile === 1) {
        return {
          x: c * this.map.tileSize + this.map.tileSize * 0.5,
          y: r * this.map.tileSize + this.map.tileSize * 0.5
        };
      }
    }
    const n = this.map.roadNodes[0];
    return { x: n.x, y: n.y };
  }

  spawnInitial() {
    const types = ['SMG', 'SHOTGUN', 'SMG', 'SHOTGUN'];
    this.pickups = types.map((weaponId) => {
      const pt = this.randomStreetPoint();
      return {
        x: pt.x,
        y: pt.y,
        weaponId,
        ammo: weaponId === 'SHOTGUN' ? 24 : 90,
        radius: 14
      };
    });
  }

  update(dt, player, onPickup, audio) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= 12 && this.pickups.length < 5) {
      this.spawnTimer = 0;
      const weaponId = Math.random() < 0.5 ? 'SMG' : 'SHOTGUN';
      const pt = this.randomStreetPoint();
      this.pickups.push({
        x: pt.x,
        y: pt.y,
        weaponId,
        ammo: weaponId === 'SHOTGUN' ? 24 : 90,
        radius: 14
      });
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      if (Math.hypot(item.x - player.x, item.y - player.y) < item.radius + player.radius + 8) {
        player.giveWeapon(item.weaponId, item.ammo);
        audio.cash();
        if (onPickup) {
          const spec = WEAPON_SPECS[item.weaponId];
          onPickup(`${spec.name} (+${item.ammo} MUN.)`);
        }
        this.pickups.splice(i, 1);
      }
    }
  }

  draw(ctx, time) {
    for (const item of this.pickups) {
      const pulse = Math.sin(time * 6) * 2.5;
      ctx.save();
      ctx.translate(item.x, item.y);

      ctx.fillStyle = item.weaponId === 'SHOTGUN' ? 'rgba(255, 107, 107, 0.25)' : 'rgba(255, 159, 67, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = item.weaponId === 'SHOTGUN' ? '#e74c3c' : '#f39c12';
      ctx.fillRect(-9, -6, 18, 12);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -6, 18, 12);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.weaponId === 'SHOTGUN' ? 'SG' : 'SMG', 0, 0.5);

      ctx.restore();
    }
  }
}