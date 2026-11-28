import { raycastCircle, type PhysicsBody, type Pocket, type TableBounds } from '../../engine/physics2d';

export const POOL_W = 880;
export const POOL_H = 480;
export const RAIL = 38;
export const BALL_RADIUS = 12.5;
export const POOL_POCKET_RADIUS = 22;

export const POOL_BOUNDS: TableBounds = {
  left: RAIL,
  right: POOL_W - RAIL,
  top: RAIL,
  bottom: POOL_H - RAIL,
};

export const POOL_POCKETS: Pocket[] = [
  { x: RAIL + 5, y: RAIL + 5, radius: POOL_POCKET_RADIUS },
  { x: POOL_W / 2, y: RAIL - 2, radius: 21.5 },
  { x: POOL_W - RAIL - 5, y: RAIL + 5, radius: POOL_POCKET_RADIUS },
  { x: RAIL + 5, y: POOL_H - RAIL - 5, radius: POOL_POCKET_RADIUS },
  { x: POOL_W / 2, y: POOL_H - RAIL + 2, radius: 21.5 },
  { x: POOL_W - RAIL - 5, y: POOL_H - RAIL - 5, radius: POOL_POCKET_RADIUS },
];

export type BilliardVariant = '8ball' | '9ball' | '15point' | 'cutthroat';
export type BallGroup = 'solid' | 'stripe';

export interface PoolBall extends PhysicsBody {
  number: number; // 0 = cue, 1..15 object balls
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

export function getCutthroatRange(playerNum: number): [number, number] {
  if (playerNum === 1) return [1, 5];
  if (playerNum === 2) return [6, 10];
  return [11, 15];
}

export function getLowestBallNumber(balls: PoolBall[]): number | null {
  let min: number | null = null;
  for (const b of balls) {
    if (!b.pocketed && b.number > 0) {
      if (min === null || b.number < min) min = b.number;
    }
  }
  return min;
}

function makeObjectBall(num: number, x: number, y: number): PoolBall {
  return {
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
  };
}

export function createPoolBalls(variant: BilliardVariant = '8ball'): PoolBall[] {
  const balls: PoolBall[] = [
    {
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
    },
  ];

  const startX = POOL_W * 0.72;
  const startY = POOL_H / 2;
  const dx = BALL_RADIUS * 1.76;
  const dy = BALL_RADIUS * 2.04;

  if (variant === '9ball') {
    // Authentic 9-Ball Diamond Rack: 1 in front, 9 in center, 8 at back
    const rows: number[][] = [[1], [2, 3], [4, 9, 5], [6, 7], [8]];
    rows.forEach((rowNums, rowIdx) => {
      rowNums.forEach((num, colIdx) => {
        const x = startX + rowIdx * dx;
        const y = startY + (colIdx - (rowNums.length - 1) / 2) * dy;
        balls.push(makeObjectBall(num, x, y));
      });
    });
    return balls;
  }

  // Standard 15-Ball Triangle Rack (8-ball, 15-point, cutthroat)
  const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const num = rackOrder[idx++];
      const x = startX + row * dx;
      const y = startY + (col - row / 2) * dy;
      balls.push(makeObjectBall(num, x, y));
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

  for (const p of POOL_POCKETS) {
    if (Math.hypot(p.x - x, p.y - y) < p.radius + BALL_RADIUS * 0.35) return false;
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

export function findSafeFootSpot(balls: PoolBall[]): { x: number; y: number } {
  const foot = { x: POOL_W * 0.72, y: POOL_H / 2 };
  if (isCuePlacementValid(balls, foot.x, foot.y)) return foot;
  for (let offset = 28; offset <= 160; offset += 24) {
    for (const candidate of [
      { x: foot.x + offset, y: foot.y },
      { x: foot.x - offset, y: foot.y },
      { x: foot.x, y: foot.y + offset },
      { x: foot.x, y: foot.y - offset },
    ]) {
      if (isCuePlacementValid(balls, candidate.x, candidate.y)) return candidate;
    }
  }
  return findSafeCueSpot(balls);
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
  variant: BilliardVariant = '8ball',
  opts: { assignedGroup?: BallGroup | null; playerNum?: number } = {}
): { vx: number; vy: number } {
  const cue = balls.find((b) => b.number === 0);
  if (!cue || cue.pocketed) return { vx: 12, vy: 0 };

  let targets: PoolBall[] = [];
  if (variant === '9ball') {
    const low = getLowestBallNumber(balls);
    targets = balls.filter((b) => !b.pocketed && b.number === low);
  } else if (variant === '15point') {
    targets = balls.filter((b) => !b.pocketed && b.number > 0);
  } else if (variant === 'cutthroat') {
    const [lo, hi] = getCutthroatRange(opts.playerNum ?? 2);
    targets = balls.filter((b) => !b.pocketed && b.number > 0 && (b.number < lo || b.number > hi));
    if (targets.length === 0) targets = balls.filter((b) => !b.pocketed && b.number > 0);
  } else {
    const grp = opts.assignedGroup ?? null;
    const groupBalls = balls.filter(
      (b) => !b.pocketed && b.number !== 0 && b.number !== 8 && (!grp || getBallGroup(b.number) === grp)
    );
    targets = groupBalls.length > 0 ? groupBalls : balls.filter((b) => !b.pocketed && b.number === 8);
  }

  let bestScore = -Infinity;
  let bestVec: { vx: number; vy: number } | null = null;

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

      const pointBonus = variant === '15point' ? target.number * 2.5 : 0;
      const score = dot * 100 - tpDist * 0.1 - cgDist * 0.06 + (clear ? 110 : 0) + pointBonus;
      if (score > bestScore) {
        bestScore = score;
        const speed = Math.min(22, Math.max(11, (cgDist + tpDist) * 0.028));
        bestVec = { vx: cux * speed, vy: cuy * speed };
      }
    }
  }

  if (bestVec) return bestVec;

  // Direct hit fallback toward lowest/first target
  const fallback = targets[0];
  if (fallback) {
    const dx = fallback.x - cue.x;
    const dy = fallback.y - cue.y;
    const d = Math.hypot(dx, dy) || 1;
    return { vx: (dx / d) * 14, vy: (dy / d) * 14 };
  }
  return { vx: 14, vy: 0 };
}

export function raycastAim(
  balls: PoolBall[],
  cue: PoolBall,
  ux: number,
  uy: number
): { hitX: number; hitY: number; targetBall?: PoolBall; wallNormalX?: number; wallNormalY?: number } {
  const hit = raycastCircle(balls, cue, ux, uy, POOL_BOUNDS);
  return {
    hitX: hit.hitX,
    hitY: hit.hitY,
    targetBall: hit.targetBody as PoolBall | undefined,
    wallNormalX: hit.wallNormalX,
    wallNormalY: hit.wallNormalY,
  };
}
