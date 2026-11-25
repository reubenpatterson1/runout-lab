// @ts-check
export const W = 100;
export const H = 50;
export const R = 1.125;
export const CORNER_MOUTH = 4.5;
export const SIDE_MOUTH = 5.0;
export const G = 386.09;

export const MU_SLIDE = 0.2;
export const MU_ROLL = 0.01;
export const SPIN_DECAY = 20; // in/s^2 on wz
export const E_BALL = 1;
export const TIP = 1.25; // spin velocity factor

export const DT = 0.01;
export const MAX_T = 60;
export const MAX_EVENTS = 5000;
export const MAX_ZERO_TIME = 100;
export const EPS_V = 1e-6; // in/s (R3a)
export const EPS_D = 1e-9;
export const EPS_LAYOUT = 0.01;
export const POCKET_NEAR = 8;

export const SPEED_MIN = 1;
export const SPEED_MAX = 250;
export const V_REST = 0.5;
export const CUSHION = {
  E_HI: 0.92, E_SLOPE: 0.0012, E_MIN: 0.70,
  TAU_HI: 0.97, TAU_SLOPE: 0.004, TAU_MIN: 0.55,
  ENGLISH: 0.2, SPIN_KEEP: 0.5,
};
