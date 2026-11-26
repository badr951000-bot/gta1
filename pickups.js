export const ITEM_SPECS = {
  MEDKIT: {
    label: '+HP',
    color: '#2ecc71',
    glow: 'rgba(46, 204, 113, 0.25)'
  },
  ARMOR: {
    label: 'ARM',
    color: '#3498db',
    glow: 'rgba(52, 152, 219, 0.25)'
  },
  REPAIR: {
    label: 'FIX',
    color: '#f39c12',
    glow: 'rgba(243, 156, 18, 0.25)'
  }
};

export class SupplyPickupManager {
  constructor(map) {
    this.map = map;
    this.items = [];
    this.spawnTimer = 0;
    this.spawnInitial();
  }

  randomSpot() {
    for (let i = 0; i < 35; i++) {
      const c = Math.floor(Math.random() * this.map.cols);
      const r = Math.floor(Math.random() * this.map.rows);
      const tile = this.map.grid[r]?.[c];
      if (tile === 0 || tile === 1 || tile === 3) {
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
    const types = ['MEDKIT', 'ARMOR', 'REPAIR', 'MEDKIT', 'REPAIR'];
    this.items = types.map((kind) => {
      const pt = this.randomSpot();
      return { x: pt.x, y: pt.y, kind, radius: 13 };
    });
  }

  update(dt, player, onBanner, audio) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= 10 && this.items.length < 6) {
      this.spawnTimer = 0;
      const pool = ['MEDKIT', 'ARMOR', 'REPAIR'];
      const kind = pool[Math.floor(Math.random() * pool.length)];
      const pt = this.randomSpot();
      this.items.push({ x: pt.x, y: pt.y, kind, radius: 13 });
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (Math.hypot(item.x - player.x, item.y - player.y) < item.radius + player.radius + 8) {
        if (item.kind === 'MEDKIT') {
          player.health = Math.min(100, player.health + 40);
          audio.cash();
          onBanner('TROUSSE DE SOINS (+40 SANTÉ)');
          this.items.splice(i, 1);
        } else if (item.kind === 'ARMOR') {
          player.armor = Math.min(100, player.armor + 50);
          audio.cash();
          onBanner('GILET PARE-BALLES (+50 ARMURE)');
          this.items.splice(i, 1);
        } else if (item.kind === 'REPAIR' && player.vehicle && !player.vehicle.exploded) {
          player.vehicle.hp = player.vehicle.maxHp;
          audio.cash();
          onBanner(`VÉHICULE RÉPARÉ (${player.vehicle.name})`);
          this.items.splice(i, 1);
        }
      }
    }
  }

  draw(ctx, time) {
    for (const item of this.items) {
      const spec = ITEM_SPECS[item.kind];
      const pulse = Math.sin(time * 6) * 2;
      ctx.save();
      ctx.translate(item.x, item.y);

      ctx.fillStyle = spec.glow;
      ctx.beginPath();
      ctx.arc(0, 0, item.radius + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = spec.color;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-8, -8, 16, 16);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spec.label, 0, 0.5);

      ctx.restore();
    }
  }
}