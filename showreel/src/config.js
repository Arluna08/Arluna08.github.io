// Global constants shared by every scene, the HUD, the renderer and the soundtrack.
export const W = 1920;
export const H = 1080;
export const FPS = 60;
export const DURATION = 15;
export const FRAMES = DURATION * FPS;

// 128 BPM makes 15 s exactly 32 beats = 8 bars of 4/4. Every cut lands on the grid.
export const BPM = 128;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const b2t = (b) => b * BEAT;
export const t2b = (t) => t / BEAT;
// Cuts snap to frame boundaries so a motion-blurred frame never straddles two scenes.
export const cut = (b) => Math.round(b * BEAT * FPS) / FPS;

export const C = {
  ink: '#0E0E10',
  ink2: '#18181C',
  paper: '#F3EFE6',
  paper2: '#E6E0D3',
  coral: '#FF5B35',
  cobalt: '#2E3CFF',
  lime: '#D6FF3F',
  lilac: '#B8A8FF',
  stone: '#8C877D',
};

export const FONT = {
  display: 'Archivo',
  serif: 'Instrument Serif',
  mono: 'Geist Mono',
};
