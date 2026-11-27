import type { PhysicsBody, Pocket, TableBounds } from '../../engine/physics2d';

export const POOL_W = 880;
export const POOL_H = 480;
export const RAIL = 38;
export const BALL_RADIUS = 12.5;
export const POOL_POCKET_RADIUS = 21;

export const POOL_BOUNDS: TableBounds = {
  left: RAIL,
  right: POOL_W - RAIL,
  top: RAIL,
  bottom: POOL_H - RAIL,
};

export const POOL_POCKETS: Pocket[] = [
  { x: RAIL + 6, y: RAIL + 6, radius: POOL_POCKET_RADIUS },
  { x: POOL_W / 2, y: RAIL - 2, radius: POOL_POCKET_RADIUS },
  { x: POOL_W - RAIL - 6, y: RAIL + 6, radius: POOL_POCKET_RADIUS },
  { x: RAIL + 6, y: POOL_H - RAIL - 6, radius: POOL_POCKET_RADIUS },
  { x: POOL_W / 2, y: POOL_H - RAIL + 2, radius: POOL_POCKET_RADIUS },
  { x: POOL_W - RAIL - 6, y: POOL_H - RAIL - 6, radius: POOL_POCKET_RADIUS },
];

export type BallGroup = 'solid' | 'stripe';

export interface PoolBall extends PhysicsBody {
  number: number; // 0 = cue, 1..7 solid, 8 = eight, 9..15 stripe
}

const BALL_COLORS: Record<number, string> = {
  0: '#f8fafc',
  1: '#eab308',
  2: '#2563eb',
  3: '#dc2626',
  4: '#7c3aed',
  5: '#f97316',
  6: '#16a34a',
  7: '#991b1b',
  8: '#0f172a',
  9: '#eab308',
  10: '#2563eb',
  11: '#dc2626',
  12: '#7c3aed',
  13: '#f97316',
  14: '#16a34a',
  15: '#991b1b',
};

export function getBallGroup(num: number): BallGroup | 'cue' | 'eight' {
  if (num === 0) return 'cue';
  if (num === 8) return 'eight';
  return num <= 7 ? 'solid' : 'stripe';
}

export function createPoolBalls(): PoolBall[] {
  const balls: PoolBall[] = [];

  // Cue ball
  balls.push({
    id: 'ball-0',
    number: 0,
    x: POOL_W * 0.26,
    y: POOL_H / 2,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    mass: 1,
    restitution: 0.92,
    pocketed: false,
    kind: 'cue',
    color: BALL_COLORS[0],
  });

  // Triangle rack (8-ball in center, alternating corner solid/stripe)
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const startX = POOL_W * 0.72;
  const startY = POOL_H / 2;
  const dx = BALL_RADIUS * 1.76;
  const dy = BALL_RADIUS * 2.04;

  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const num = rackOrder[idx++];
      const x = startX + row * dx;
      const y = startY + (col - row / 2) * dy;
      balls.push({
        id: `ball-${num}`,
        number: num,
        x,
        y,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        mass: 1,
        restitution: 0.92,
        pocketed: false,
        kind: getBallGroup(num),
        color: BALL_COLORS[num],
        label: String(num),
      });
    }
  }

  return balls;
}

export function isCuePlacementValid(balls: PoolBall[], x: number, y: number): boolean {
  if (
    x < POOL_BOUNDS.left + BALL_RADIUS + 2 ||
    x > POOL_BOUNDS.right - BALL_RADIUS - 2 ||
    y < POOL_BOUNDS.top + BALL_RADIUS + 2 ||
    y > POOL_BOUNDS.bottom - BALL_RADIUS - 2
  ) {
    return false;
  }

  for (const b of balls) {
    if (b.pocketed || b.number === 0) continue;
    const dist = Math.hypot(b.x - x, b.y - y);
    if (dist < b.radius + BALL_RADIUS + 2) return false;
  }
  return true;
}

export function findSafeCueSpot(balls: PoolBall[]): { x: number; y: number } {
  const candidates = [
    { x: POOL_W * 0.26, y: POOL_H / 2 },
    { x: POOL_W * 0.26, y: POOL_H / 2 - 50 },
    { x: POOL_W * 0.26, y: POOL_H / 2 + 50 },
    { x: POOL_W * 0.2, y: POOL_H / 2 },
  ];
  for (const c of candidates) {
    if (isCuePlacementValid(balls, c.x, c.y)) return c;
  }
  for (let x = POOL_BOUNDS.left + 30; x < POOL_W * 0.5; x += 24) {
    for (let y = POOL_BOUNDS.top + 30; y < POOL_BOUNDS.bottom - 30; y += 24) {
      if (isCuePlacementValid(balls, x, y)) return { x, y };
    }
  }
  return { x: POOL_W * 0.26, y: POOL_H / 2 };
}

function segmentClear(
  balls: PoolBall[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ignoreNums: Set<number>
): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return true;

  for (const b of balls) {
    if (b.pocketed || ignoreNums.has(b.number)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * vx + (b.y - ay) * vy) / lenSq));
    const px = ax + t * vx;
    const py = ay + t * vy;
    if (Math.hypot(b.x - px, b.y - py) < BALL_RADIUS * 1.95) return false;
  }
  return true;
}

export function computePoolAiShot(
  balls: PoolBall[],
  assignedGroup: BallGroup | null
): { vx: number; vy: number } {
  const cue = balls.find((b) => b.number === 0);
  if (!cue || cue.pocketed) return { vx: 12, vy: 0 };

  const groupBalls = balls.filter(
    (b) => !b.pocketed && b.number !== 0 && b.number !== 8 && (!assignedGroup || getBallGroup(b.number) === assignedGroup)
  );
  const targets = groupBalls.length > 0 ? groupBalls : balls.filter((b) => !b.pocketed && b.number === 8);

  let bestScore = -Infinity;
  let bestVec = { vx: 14, vy: 0 };

  for (const target of targets) {
    for (const pocket of POOL_POCKETS) {
      const tpX = pocket.x - target.x;
      const tpY = pocket.y - target.y;
      const tpDist = Math.hypot(tpX, tpY) || 1;
      const ux = tpX / tpDist;
      const uy = tpY / tpDist;

      const ghostX = target.x - ux * (BALL_RADIUS * 2);
      const ghostY = target.y - uy * (BALL_RADIUS * 2);

      const cgX = ghostX - cue.x;
      const cgY = ghostY - cue.y;
      const cgDist = Math.hypot(cgX, cgY) || 1;
      const cux = cgX / cgDist;
      const cuy = cgY / cgDist;

      const dot = cux * ux + cuy * uy;
      if (dot < 0.25) continue;

      const ignore = new Set([0, target.number]);
      const clear =
        segmentClear(balls, cue.x, cue.y, ghostX, ghostY, ignore) &&
        segmentClear(balls, target.x, target.y, pocket.x, pocket.y, ignore);

      const score = dot * 100 - tpDist * 0.1 - cgDist * 0.06 + (clear ? 110 : 0);
      if (score > bestScore) {
        bestScore = score;
        const speed = Math.min(22, Math.max(11, (cgDist + tpDist) * 0.028));
        bestVec = { vx: cux * speed, vy: cuy * speed };
      }
    }
  }

  return bestVec;
}

export function raycastAim(
  balls: PoolBall[],
  cue: PoolBall,
  ux: number,
  uy: number
): { hitX: number; hitY: number; targetBall?: PoolBall } {
  const step = 3;
  const maxDist = 900;
  for (let d = step; d < maxDist; d += step) {
    const px = cue.x + ux * d;
    const py = cue.y + uy * d;
    if (
      px - BALL_RADIUS <= POOL_BOUNDS.left ||
      px + BALL_RADIUS >= POOL_BOUNDS.right ||
      py - BALL_RADIUS <= POOL_BOUNDS.top ||
      py + BALL_RADIUS >= POOL_BOUNDS.bottom
    ) {
      return { hitX: px, hitY: py };
    }
    for (const b of balls) {
      if (b.pocketed || b.number === 0) continue;
      if (Math.hypot(b.x - px, b.y - py) <= BALL_RADIUS * 2) {
        return { hitX: px, hitY: py, targetBall: b };
      }
    }
  }
  return { hitX: cue.x + ux * maxDist, hitY: cue.y + uy * maxDist };
}
