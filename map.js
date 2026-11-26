export const TILE_SIZE = 64;
export const MAP_COLS = 36;
export const MAP_ROWS = 36;

export class GameMap {
  constructor() {
    this.tileSize = TILE_SIZE;
    this.cols = MAP_COLS;
    this.rows = MAP_ROWS;
    this.grid = [];
    this.roadNodes = [];
    this.props = [];
    this.generateCity();
  }

  generateCity() {
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          this.grid[r][c] = 2;
        } else {
          this.grid[r][c] = 1;
        }
      }
    }

    const roadCols = [4, 10, 16, 22, 28, 32];
    const roadRows = [4, 10, 16, 22, 28, 32];

    for (const r of roadRows) {
      for (let c = 1; c < this.cols - 1; c++) {
        this.grid[r][c] = 0;
      }
    }

    for (const c of roadCols) {
      for (let r = 1; r < this.rows - 1; r++) {
        this.grid[r][c] = 0;
      }
    }

    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        if (this.grid[r][c] === 1) {
          const isPark = (r + c) % 7 === 0;
          if (isPark) {
            this.grid[r][c] = 3;
          } else {
            const hash = (r * 31 + c * 17) % 11;
            this.grid[r][c] = hash < 7 ? 2 : 1;
          }
        }
      }
    }

    this.roadNodes = [];
    for (const r of roadRows) {
      for (const c of roadCols) {
        this.roadNodes.push({
          col: c,
          row: r,
          x: c * this.tileSize + this.tileSize / 2,
          y: r * this.tileSize + this.tileSize / 2
        });
      }
    }

    this.props = [];
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        const tile = this.grid[r][c];
        const cx = c * this.tileSize + this.tileSize / 2;
        const cy = r * this.tileSize + this.tileSize / 2;

        if (tile === 3 && (r + c) % 2 === 0) {
          this.props.push({
            kind: 'TREE',
            x: cx,
            y: cy,
            radius: 10,
            solid: true
          });
        } else if (tile === 1 && (r * 13 + c * 7) % 9 === 0) {
          this.props.push({
            kind: 'BENCH',
            x: cx + 10,
            y: cy - 8,
            w: 18,
            h: 8,
            solid: false
          });
        } else if (tile === 1 && (r * 5 + c * 11) % 13 === 0) {
          this.props.push({
            kind: 'LAMP',
            x: cx - 16,
            y: cy - 16,
            radius: 5,
            solid: true
          });
        }
      }
    }
  }

  getDistrictAt(x, y) {
    const col = Math.floor(x / this.tileSize);
    const row = Math.floor(y / this.tileSize);
    if (col < 18 && row < 18) return 'NORTH PRECINCT';
    if (col >= 18 && row < 18) return 'MIDTOWN COMMERCE';
    if (col < 18 && row >= 18) return 'WEST DOCKS & PARK';
    return 'SOUTH INDUSTRIAL';
  }

  isSolidTile(c, r) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true;
    return this.grid[r][c] === 2;
  }

  isSolidAt(x, y) {
    const c = Math.floor(x / this.tileSize);
    const r = Math.floor(y / this.tileSize);
    if (this.isSolidTile(c, r)) return true;

    for (const p of this.props) {
      if (!p.solid) continue;
      if (Math.hypot(x - p.x, y - p.y) < (p.radius || 8)) {
        return true;
      }
    }
    return false;
  }

  resolveCircleCollision(entity) {
    let collided = false;
    const minCol = Math.max(0, Math.floor((entity.x - entity.radius) / this.tileSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((entity.x + entity.radius) / this.tileSize));
    const minRow = Math.max(0, Math.floor((entity.y - entity.radius) / this.tileSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((entity.y + entity.radius) / this.tileSize));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (!this.isSolidTile(c, r)) continue;

        const left = c * this.tileSize;
        const right = left + this.tileSize;
        const top = r * this.tileSize;
        const bottom = top + this.tileSize;

        const closestX = Math.max(left, Math.min(entity.x, right));
        const closestY = Math.max(top, Math.min(entity.y, bottom));

        const dx = entity.x - closestX;
        const dy = entity.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < entity.radius * entity.radius) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = entity.radius - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
          collided = true;
        }
      }
    }

    for (const p of this.props) {
      if (!p.solid) continue;
      const rad = p.radius || 8;
      const dx = entity.x - p.x;
      const dy = entity.y - p.y;
      const dist = Math.hypot(dx, dy);
      const minDist = entity.radius + rad;
      if (dist > 0 && dist < minDist) {
        const overlap = minDist - dist;
        entity.x += (dx / dist) * overlap;
        entity.y += (dy / dist) * overlap;
        collided = true;
      }
    }

    return collided;
  }

  drawGround(ctx, cam) {
    const startCol = Math.max(0, Math.floor(cam.x / this.tileSize) - 1);
    const endCol = Math.min(this.cols - 1, Math.ceil((cam.x + cam.w) / this.tileSize) + 1);
    const startRow = Math.max(0, Math.floor(cam.y / this.tileSize) - 1);
    const endRow = Math.min(this.rows - 1, Math.ceil((cam.y + cam.h) / this.tileSize) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tile = this.grid[r][c];
        const x = c * this.tileSize;
        const y = r * this.tileSize;

        if (tile === 0) {
          ctx.fillStyle = '#25282e';
          ctx.fillRect(x, y, this.tileSize, this.tileSize);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 8]);

          const hasRoadLeft = this.grid[r]?.[c - 1] === 0;
          const hasRoadRight = this.grid[r]?.[c + 1] === 0;
          const hasRoadUp = this.grid[r - 1]?.[c] === 0;
          const hasRoadDown = this.grid[r + 1]?.[c] === 0;

          if (hasRoadLeft && hasRoadRight && !hasRoadUp && !hasRoadDown) {
            ctx.beginPath();
            ctx.moveTo(x, y + this.tileSize / 2);
            ctx.lineTo(x + this.tileSize, y + this.tileSize / 2);
            ctx.stroke();
          } else if (hasRoadUp && hasRoadDown && !hasRoadLeft && !hasRoadRight) {
            ctx.beginPath();
            ctx.moveTo(x + this.tileSize / 2, y);
            ctx.lineTo(x + this.tileSize / 2, y + this.tileSize);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        } else if (tile === 3) {
          ctx.fillStyle = '#1e4620';
          ctx.fillRect(x, y, this.tileSize, this.tileSize);
          ctx.strokeStyle = '#2d6a30';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
        } else {
          ctx.fillStyle = '#474c54';
          ctx.fillRect(x, y, this.tileSize, this.tileSize);
          ctx.strokeStyle = '#363a40';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, this.tileSize, this.tileSize);
        }
      }
    }

    // Passages piétons aux intersections
    ctx.fillStyle = 'rgba(241, 245, 249, 0.35)';
    for (const n of this.roadNodes) {
      if (
        n.x < cam.x - 90 || n.x > cam.x + cam.w + 90 ||
        n.y < cam.y - 90 || n.y > cam.y + cam.h + 90
      ) continue;

      for (let i = -18; i <= 18; i += 9) {
        ctx.fillRect(n.x + i - 2, n.y - 38, 4, 9);
        ctx.fillRect(n.x + i - 2, n.y + 29, 4, 9);
        ctx.fillRect(n.x - 38, n.y + i - 2, 9, 4);
        ctx.fillRect(n.x + 29, n.y + i - 2, 9, 4);
      }
    }

    // Bancs et props au sol
    for (const p of this.props) {
      if (p.solid) continue;
      if (
        p.x < cam.x - 40 || p.x > cam.x + cam.w + 40 ||
        p.y < cam.y - 40 || p.y > cam.y + cam.h + 40
      ) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }

  drawRoofs(ctx, cam) {
    const startCol = Math.max(0, Math.floor(cam.x / this.tileSize) - 1);
    const endCol = Math.min(this.cols - 1, Math.ceil((cam.x + cam.w) / this.tileSize) + 1);
    const startRow = Math.max(0, Math.floor(cam.y / this.tileSize) - 1);
    const endRow = Math.min(this.rows - 1, Math.ceil((cam.y + cam.h) / this.tileSize) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (this.grid[r][c] !== 2) continue;

        const x = c * this.tileSize;
        const y = r * this.tileSize;
        const shade = (r * 7 + c * 13) % 3;
        const roofColor = shade === 0 ? '#334155' : shade === 1 ? '#3f3f46' : '#374151';
        const trimColor = shade === 0 ? '#475569' : shade === 1 ? '#52525b' : '#4b5563';

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 6, y + 6, this.tileSize - 4, this.tileSize - 4);

        ctx.fillStyle = roofColor;
        ctx.fillRect(x + 3, y + 3, this.tileSize - 6, this.tileSize - 6);

        ctx.strokeStyle = trimColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 7, y + 7, this.tileSize - 14, this.tileSize - 14);
      }
    }

    // Arbres et lampadaires
    for (const p of this.props) {
      if (!p.solid) continue;
      if (
        p.x < cam.x - 40 || p.x > cam.x + cam.w + 40 ||
        p.y < cam.y - 40 || p.y > cam.y + cam.h + 40
      ) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'TREE') {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.arc(3, 4, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(-3, -3, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'LAMP') {
        ctx.fillStyle = 'rgba(253, 224, 71, 0.14)';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}