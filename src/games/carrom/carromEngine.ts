import { raycastCircle, type CircleRaycastHit, type PhysicsBody, type Pocket, type TableBounds } from '../../engine/physics2d';

export const CARROM_SIZE = 640;
export const CARROM_BORDER = 42;
export const COIN_RADIUS = 13.5;
export const STRIKER_RADIUS = 18.5;
export const POCKET_RADIUS = 24.5;

export const CARROM_BOUNDS: TableBounds = {
  left: CARROM_BORDER,
  right: CARROM_SIZE - CARROM_BORDER,
  top: CARROM_BORDER,
  bottom: CARROM_SIZE - CARROM_BORDER,
};

export const CARROM_POCKETS: Pocket[] = [
  { x: CARROM_BORDER + 23, y: CARROM_BORDER + 23, radius: POCKET_RADIUS },
  { x: CARROM_SIZE - CARROM_BORDER - 23, y: CARROM_BORDER + 23, radius: POCKET_RADIUS },
  { x: CARROM_BORDER + 23, y: CARROM_SIZE - CARROM_BORDER - 23, radius: POCKET_RADIUS },
  { x: CARROM_SIZE - CARROM_BORDER - 23, y: CARROM_SIZE - CARROM_BORDER - 23, radius: POCKET_RADIUS },
];

export function raycastCarromAim(
  bodies: PhysicsBody[],
  striker: PhysicsBody,
  ux: number,
  uy: number
): CircleRaycastHit {
  return raycastCircle(bodies, striker, ux, uy, CARROM_BOUNDS);
}

export const BASELINE_BOTTOM_Y = CARROM_SIZE - CARROM_BORDER - 72;
export const BASELINE_TOP_Y = CARROM_BORDER + 72;
export const BASELINE_LEFT_X = CARROM_BORDER + 72;
export const BASELINE_RIGHT_X = CARROM_SIZE - CARROM_BORDER - 72;
export const BASELINE_MIN_X = CARROM_BORDER + 96;
export const BASELINE_MAX_X = CARROM_SIZE - CARROM_BORDER - 96;

export type CarromSide = 'bottom' | 'right' | 'top' | 'left';

export function getCarromSide(playerNum: number, playerCount: 2 | 4): CarromSide {
  if (playerCount === 2) {
    return playerNum === 1 ? 'bottom' : 'top';
  }
  switch (playerNum) {
    case 1:
      return 'bottom';
    case 2:
      return 'right';
    case 3:
      return 'top';
    default:
      return 'left';
  }
}

export function getCarromTeam(playerNum: number): 1 | 2 {
  return playerNum % 2 === 1 ? 1 : 2;
}

export function getBaselinePoint(side: CarromSide, t: number): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const span = BASELINE_MIN_X + clamped * (BASELINE_MAX_X - BASELINE_MIN_X);
  switch (side) {
    case 'bottom':
      return { x: span, y: BASELINE_BOTTOM_Y };
    case 'top':
      return { x: span, y: BASELINE_TOP_Y };
    case 'left':
      return { x: BASELINE_LEFT_X, y: span };
    case 'right':
      return { x: BASELINE_RIGHT_X, y: span };
  }
}

export function createCarromBodies(): PhysicsBody[] {
  const cx = CARROM_SIZE / 2;
  const cy = CARROM_SIZE / 2;
  const bodies: PhysicsBody[] = [];

  // Red Queen in center
  bodies.push({
    id: 'queen',
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    radius: COIN_RADIUS,
    mass: 1,
    restitution: 0.88,
    pocketed: false,
    kind: 'queen',
    color: '#e11d48',
  });

  // Inner ring: 6 coins alternating white & black
  const ring1Dist = COIN_RADIUS * 2.08;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 2;
    const isWhite = i % 2 === 0;
    bodies.push({
      id: `r1-${i}`,
      x: cx + Math.cos(angle) * ring1Dist,
      y: cy + Math.sin(angle) * ring1Dist,
      vx: 0,
      vy: 0,
      radius: COIN_RADIUS,
      mass: 1,
      restitution: 0.88,
      pocketed: false,
      kind: isWhite ? 'white' : 'black',
      color: isWhite ? '#f8fafc' : '#1e293b',
    });
  }

  // Outer ring: 12 coins (6 white, 6 black)
  const ring2Dist = COIN_RADIUS * 4.15;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6 - Math.PI / 2;
    const r = i % 2 === 0 ? ring2Dist : ring2Dist * 0.9;
    const isWhite = i % 2 === 0;
    bodies.push({
      id: `r2-${i}`,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      radius: COIN_RADIUS,
      mass: 1,
      restitution: 0.88,
      pocketed: false,
      kind: isWhite ? 'white' : 'black',
      color: isWhite ? '#f8fafc' : '#1e293b',
    });
  }

  // Striker
  bodies.push({
    id: 'striker',
    x: cx,
    y: BASELINE_BOTTOM_Y,
    vx: 0,
    vy: 0,
    radius: STRIKER_RADIUS,
    mass: 2.3,
    restitution: 0.9,
    pocketed: false,
    kind: 'striker',
    color: '#fde68a',
  });

  return bodies;
}

export function isStrikerPositionValid(bodies: PhysicsBody[], x: number, y: number): boolean {
  for (const b of bodies) {
    if (b.pocketed || b.kind === 'striker') continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const minDist = b.radius + STRIKER_RADIUS + 2;
    if (dx * dx + dy * dy < minDist * minDist) return false;
  }
  return true;
}

export function findValidStrikerX(bodies: PhysicsBody[], preferredX: number, y: number): number {
  const clamped = Math.max(BASELINE_MIN_X, Math.min(BASELINE_MAX_X, preferredX));
  if (isStrikerPositionValid(bodies, clamped, y)) return clamped;

  for (let offset = 6; offset <= BASELINE_MAX_X - BASELINE_MIN_X; offset += 6) {
    const right = Math.min(BASELINE_MAX_X, clamped + offset);
    if (isStrikerPositionValid(bodies, right, y)) return right;
    const left = Math.max(BASELINE_MIN_X, clamped - offset);
    if (isStrikerPositionValid(bodies, left, y)) return left;
  }
  return clamped;
}

export function findValidStrikerOnSide(
  bodies: PhysicsBody[],
  side: CarromSide,
  preferredT = 0.5
): { x: number; y: number; t: number } {
  const clampedT = Math.max(0, Math.min(1, preferredT));
  const pt = getBaselinePoint(side, clampedT);
  if (isStrikerPositionValid(bodies, pt.x, pt.y)) {
    return { x: pt.x, y: pt.y, t: clampedT };
  }

  for (let step = 0.02; step <= 1; step += 0.02) {
    const tPlus = Math.min(1, clampedT + step);
    const pPlus = getBaselinePoint(side, tPlus);
    if (isStrikerPositionValid(bodies, pPlus.x, pPlus.y)) {
      return { x: pPlus.x, y: pPlus.y, t: tPlus };
    }
    const tMinus = Math.max(0, clampedT - step);
    const pMinus = getBaselinePoint(side, tMinus);
    if (isStrikerPositionValid(bodies, pMinus.x, pMinus.y)) {
      return { x: pMinus.x, y: pMinus.y, t: tMinus };
    }
  }
  return { x: pt.x, y: pt.y, t: clampedT };
}

function segmentClear(
  bodies: PhysicsBody[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ignoreIds: Set<string>,
  clearance: number
): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return true;

  for (const b of bodies) {
    if (b.pocketed || ignoreIds.has(b.id)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * vx + (b.y - ay) * vy) / lenSq));
    const px = ax + t * vx;
    const py = ay + t * vy;
    const dist = Math.hypot(b.x - px, b.y - py);
    if (dist < b.radius + clearance) return false;
  }
  return true;
}

export function computeCarromAiShot(
  bodies: PhysicsBody[],
  targetKind: 'black' | 'white',
  side: CarromSide = 'top'
): { strikerX: number; strikerY: number; vx: number; vy: number } {
  const targets = bodies.filter((b) => !b.pocketed && b.kind === targetKind);

  let bestScore = -Infinity;
  let bestShot: { strikerX: number; strikerY: number; vx: number; vy: number } | null = null;

  const tCandidates = [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9];

  for (const coin of targets) {
    for (const pocket of CARROM_POCKETS) {
      const toPocketX = pocket.x - coin.x;
      const toPocketY = pocket.y - coin.y;
      const distToPocket = Math.hypot(toPocketX, toPocketY) || 1;
      const ux = toPocketX / distToPocket;
      const uy = toPocketY / distToPocket;

      // Ghost striker contact point behind the coin
      const contactX = coin.x - ux * (COIN_RADIUS + STRIKER_RADIUS);
      const contactY = coin.y - uy * (COIN_RADIUS + STRIKER_RADIUS);

      for (const tc of tCandidates) {
        const sp = getBaselinePoint(side, tc);
        if (!isStrikerPositionValid(bodies, sp.x, sp.y)) continue;
        const shotX = contactX - sp.x;
        const shotY = contactY - sp.y;
        const shotDist = Math.hypot(shotX, shotY) || 1;
        const sux = shotX / shotDist;
        const suy = shotY / shotDist;

        // Alignment dot product (must push coin toward pocket, not backward)
        const dot = sux * ux + suy * uy;
        if (dot < 0.35) continue;

        const ignore = new Set(['striker', coin.id]);
        const pathClear =
          segmentClear(bodies, sp.x, sp.y, contactX, contactY, ignore, STRIKER_RADIUS * 0.85) &&
          segmentClear(bodies, coin.x, coin.y, pocket.x, pocket.y, ignore, COIN_RADIUS * 0.85);

        const score = dot * 120 - distToPocket * 0.14 - shotDist * 0.08 + (pathClear ? 90 : 0);
        if (score > bestScore) {
          bestScore = score;
          const speed = Math.min(20, Math.max(12.5, (shotDist + distToPocket) * 0.036));
          bestShot = { strikerX: sp.x, strikerY: sp.y, vx: sux * speed, vy: suy * speed };
        }
      }
    }
  }

  if (bestShot) return bestShot;

  const fallbackSpot = findValidStrikerOnSide(bodies, side, 0.5);
  const fallbackTarget = targets[0] ?? bodies.find((b) => !b.pocketed && b.kind !== 'striker');
  if (!fallbackTarget) {
    return { strikerX: fallbackSpot.x, strikerY: fallbackSpot.y, vx: 0, vy: side === 'top' ? 14 : -14 };
  }
  const dx = fallbackTarget.x - fallbackSpot.x;
  const dy = fallbackTarget.y - fallbackSpot.y;
  const d = Math.hypot(dx, dy) || 1;
  return { strikerX: fallbackSpot.x, strikerY: fallbackSpot.y, vx: (dx / d) * 15, vy: (dy / d) * 15 };
}
