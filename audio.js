export class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioIndex = 0;
    this.radioStations = [
      { name: 'DOM PÉRIGNON', src: './dom-perignon.mp3' },
      { name: 'HEAD RADIO (SYNTH)', notes: [110, 146.83, 164.81, 196, 220, 196, 164.81, 146.83] },
      { name: 'MSX FM (BASSLINE)', notes: [82.41, 82.41, 98, 110, 123.47, 110, 98, 73.42] },
      { name: 'LIPS 106 (RETRO)', notes: [220, 261.63, 329.63, 293.66, 261.63, 246.94, 220, 196] }
    ];
    this.noteTimer = 0;
    this.step = 0;
    this.sirenTimer = 0;
    this.audioErrorCode = null;

    this.customTrack = new Audio('./dom-perignon.mp3');
    this.customTrack.loop = true;
    this.customTrack.volume = 0.75;
    this.customTrack.preload = 'auto';

    this.customTrack.addEventListener('error', () => {
      this.audioErrorCode = this.customTrack.error ? this.customTrack.error.code : 'UNKNOWN';
    });

    this.customTrack.addEventListener('canplay', () => {
      this.audioErrorCode = null;
    });

    this.customTrack.addEventListener('playing', () => {
      this.audioErrorCode = null;
    });
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.syncCustomTrack();
  }

  isCustomRadioSelected() {
    return Boolean(this.radioStations[this.radioIndex]?.src);
  }

  syncCustomTrack() {
    if (!this.customTrack) return;

    if (this.muted || !this.isCustomRadioSelected()) {
      this.customTrack.pause();
      return;
    }

    const station = this.radioStations[this.radioIndex];
    const targetFile = station.src.replace(/^\.\//, '');
    const currentSrc = this.customTrack.getAttribute('src') || '';

    if (currentSrc !== station.src && !this.customTrack.src.endsWith('/' + targetFile)) {
      this.audioErrorCode = null;
      this.customTrack.src = station.src;
      this.customTrack.load();
    }

    const playPromise = this.customTrack.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.syncCustomTrack();
    return this.muted;
  }

  cycleRadio() {
    this.radioIndex = (this.radioIndex + 1) % this.radioStations.length;
    this.step = 0;
    this.noteTimer = 0;
    this.syncCustomTrack();

    const station = this.radioStations[this.radioIndex];
    if (station.src && this.audioErrorCode) {
      return `RADIO : ${station.name} (ERR ${this.audioErrorCode})`;
    }
    return `RADIO : ${station.name}`;
  }

  playTone(freq, duration, type = 'square', volume = 0.06, slideTo = null) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  shoot(weaponId = 'PISTOL') {
    if (weaponId === 'SHOTGUN') {
      this.playTone(170, 0.14, 'sawtooth', 0.11, 45);
      this.playTone(95, 0.16, 'square', 0.08, 32);
    } else if (weaponId === 'SMG') {
      this.playTone(340, 0.06, 'square', 0.065, 120);
    } else {
      this.playTone(460, 0.08, 'square', 0.07, 130);
    }
  }

  crash() {
    this.playTone(120, 0.16, 'sawtooth', 0.11, 36);
  }

  explosion() {
    this.playTone(95, 0.42, 'sawtooth', 0.15, 24);
    this.playTone(62, 0.48, 'square', 0.11, 20);
  }

  cash() {
    this.playTone(784, 0.08, 'triangle', 0.08);
    setTimeout(() => this.playTone(1046.5, 0.14, 'triangle', 0.08), 75);
  }

  missionStart() {
    this.playTone(440, 0.1, 'square', 0.07);
    setTimeout(() => this.playTone(587.33, 0.14, 'square', 0.07), 100);
  }

  engineStart() {
    this.playTone(85, 0.14, 'sawtooth', 0.08, 165);
    setTimeout(() => this.playTone(130, 0.12, 'triangle', 0.06, 95), 110);
  }

  siren() {
    this.playTone(660, 0.14, 'sine', 0.035, 880);
  }

  updateRadio(dt, wantedLevel = 0) {
    if (this.muted) {
      if (this.customTrack && !this.customTrack.paused) {
        this.customTrack.pause();
      }
      return;
    }

    if (this.isCustomRadioSelected()) {
      if (this.customTrack && this.customTrack.paused && !this.audioErrorCode) {
        this.customTrack.play().catch(() => {});
      }
    } else if (this.ctx && this.ctx.state === 'running') {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) {
        const station = this.radioStations[this.radioIndex];
        if (station?.notes) {
          const freq = station.notes[this.step % station.notes.length];
          this.step += 1;
          this.noteTimer = 0.24;
          this.playTone(freq, 0.16, 'triangle', 0.025);
        }
      }
    }

    if (wantedLevel > 0 && this.ctx && this.ctx.state === 'running') {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = Math.max(0.55, 1.15 - wantedLevel * 0.1);
        this.siren();
      }
    } else {
      this.sirenTimer = 0.2;
    }
  }
}
