export class MissionManager {
  constructor(map) {
    this.map = map;
    this.phones = [];
    this.activeMission = null;
    this.timer = 0;
    this.completedCount = 0;

    const candidateNodes = [
      map.roadNodes[2],
      map.roadNodes[7],
      map.roadNodes[15],
      map.roadNodes[22]
    ].filter(Boolean);

    candidateNodes.forEach((node, idx) => {
      this.phones.push({
        id: idx + 1,
        x: node.x + 56,
        y: node.y - 56,
        radius: 16
      });
    });
  }

  findNearbyPhone(player) {
    if (this.activeMission) return null;
    for (const phone of this.phones) {
      if (Math.hypot(phone.x - player.x, phone.y - player.y) < 46) {
        return phone;
      }
    }
    return null;
  }

  startMissionFromPhone(phone, player, vehicles, onBanner, audio) {
    if (this.activeMission) return false;

    const missionNumber = this.completedCount + 1;
    const reward = 500 + this.completedCount * 150;
    const mode = missionNumber % 3;

    if (mode === 1) {
      const targetVeh =
        vehicles.find((v) => !v.exploded && v.driver !== player && !v.isPolice && Math.hypot(v.x - player.x, v.y - player.y) > 250) ||
        vehicles.find((v) => !v.exploded && v.driver !== player && !v.isPolice);

      if (targetVeh) {
        const timeLimit = 55;
        this.activeMission = {
          type: 'STEAL',
          title: `VOL DE ${targetVeh.name} #${missionNumber}`,
          targetVehicle: targetVeh,
          targetX: targetVeh.x,
          targetY: targetVeh.y,
          targetRadius: 40,
          reward
        };
        this.timer = timeLimit;
        audio.missionStart();
        onBanner(`CONTRAT : VOLE LA ${targetVeh.name} (${timeLimit}s)`);
        return true;
      }
    }

    if (mode === 2) {
      const targetVeh =
        vehicles.find((v) => !v.exploded && v.driver !== player && Math.hypot(v.x - player.x, v.y - player.y) > 350) ||
        vehicles.find((v) => !v.exploded && v.driver !== player);

      if (targetVeh) {
        const timeLimit = 50;
        this.activeMission = {
          type: 'DESTROY',
          title: `CONTRAT #${missionNumber} : DÉTRUIS LA CIBLE`,
          targetVehicle: targetVeh,
          targetX: targetVeh.x,
          targetY: targetVeh.y,
          targetRadius: 42,
          reward
        };
        this.timer = timeLimit;
        audio.missionStart();
        onBanner(`MISSION : DÉTRUIS LA VOITURE CIBLE (${timeLimit}s)`);
        return true;
      }
    }

    const targetNode =
      this.map.roadNodes.find((n) => Math.hypot(n.x - player.x, n.y - player.y) > 950) ||
      this.map.roadNodes[0];

    const timeLimit = 45;
    this.activeMission = {
      type: 'DELIVERY',
      title: `LIVRAISON EXPRESS #${missionNumber}`,
      targetX: targetNode.x,
      targetY: targetNode.y,
      targetRadius: 55,
      reward
    };
    this.timer = timeLimit;

    audio.missionStart();
    onBanner(`MISSION : REJOINS LE POINT JAUNE (${timeLimit}s)`);
    return true;
  }

  completeMission(player, onBanner, audio, onComplete) {
    const gain = this.activeMission.reward;
    player.cash += gain;
    this.completedCount += 1;
    this.activeMission = null;
    this.timer = 0;
    audio.cash();
    onBanner(`CONTRAT RÉUSSI ! +$${gain}`);
    if (onComplete) onComplete();
  }

  update(dt, player, onBanner, audio, onComplete) {
    if (!this.activeMission) return;

    this.timer -= dt;

    if (this.activeMission.type === 'STEAL') {
      const targetVeh = this.activeMission.targetVehicle;
      if (targetVeh && !targetVeh.exploded) {
        this.activeMission.targetX = targetVeh.x;
        this.activeMission.targetY = targetVeh.y;
        if (player.vehicle === targetVeh) {
          this.completeMission(player, onBanner, audio, onComplete);
          return;
        }
      } else {
        this.activeMission = null;
        this.timer = 0;
        onBanner('CIBLE DÉTRUITE — CONTRAT ANNULÉ');
        return;
      }
    } else if (this.activeMission.type === 'DESTROY') {
      const targetVeh = this.activeMission.targetVehicle;
      if (targetVeh && !targetVeh.exploded) {
        this.activeMission.targetX = targetVeh.x;
        this.activeMission.targetY = targetVeh.y;
      } else {
        this.completeMission(player, onBanner, audio, onComplete);
        return;
      }
    } else {
      const dist = Math.hypot(
        this.activeMission.targetX - player.x,
        this.activeMission.targetY - player.y
      );
      if (dist <= this.activeMission.targetRadius) {
        this.completeMission(player, onBanner, audio, onComplete);
        return;
      }
    }

    if (this.timer <= 0) {
      this.activeMission = null;
      this.timer = 0;
      onBanner('TEMPS ÉCOULÉ — MISSION RATÉE');
    }
  }

  draw(ctx, time) {
    for (const phone of this.phones) {
      ctx.save();
      ctx.translate(phone.x, phone.y);

      ctx.fillStyle = 'rgba(241, 196, 15, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, phone.radius + Math.sin(time * 6) * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(-8, -8, 16, 16);

      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T', 0, 1);
      ctx.restore();
    }

    if (this.activeMission) {
      const m = this.activeMission;
      const pulse = 1 + Math.sin(time * 8) * 0.12;
      const color = m.type === 'DESTROY' ? '#ff4757' : m.type === 'STEAL' ? '#2ecc71' : '#f1c40f';
      const fill = m.type === 'DESTROY'
        ? 'rgba(255, 71, 87, 0.2)'
        : m.type === 'STEAL'
          ? 'rgba(46, 204, 113, 0.2)'
          : 'rgba(241, 196, 15, 0.22)';

      ctx.save();
      ctx.translate(m.targetX, m.targetY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, m.targetRadius * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }
  }
}