export interface PhysicsBody {
  id: string;
  x: number;
  y: number;
  prevX?: number;
  prevY?: number;
  vx: number;
  vy: number;
  rollX?: number;
  rollY?: number;
  radius: number;
  mass: number;
  restitution: number;
  pocketed: boolean;
  kind: string;
  color: string;
  label?: string;
}

export interface Pocket {
  x: number;
  y: number;
  radius: number;
}

export interface TableBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PhysicsOptions {
  friction: number; // per-frame viscous multiplier at 60fps, e.g. 0.99
  linearFriction?: number; // per-frame Coulomb rolling deceleration, e.g. 0.025
  wallRestitution: number;
  substeps?: number;
  minSpeed?: number;
}

export interface PocketEvent {
  body: PhysicsBody;
  pocket: Pocket;
  entryX: number;
  entryY: number;
}

export interface ImpactPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  intensity: number;
  kind: 'ball' | 'wall';
}

export interface PhysicsStepResult {
  moving: boolean;
  newlyPocketed: PhysicsBody[];
  pocketedInto: PocketEvent[];
  firstHitId?: string;
  hitPairs: Array<[string, string]>;
  impactPoints: ImpactPoint[];
  wallHits: number;
  maxBallImpact: number;
  maxWallImpact: number;
}

export interface CircleRaycastHit {
  hitX: number;
  hitY: number;
  hitDist: number;
  targetBody?: PhysicsBody;
  wallNormalX?: number;
  wallNormalY?: number;
}

export function raycastCircle(
  bodies: PhysicsBody[],
  mover: { x: number; y: number; radius: number; id?: string },
  ux: number,
  uy: number,
  bounds: TableBounds
): CircleRaycastHit {
  const minX = bounds.left + mover.radius;
  const maxX = bounds.right - mover.radius;
  const minY = bounds.top + mover.radius;
  const maxY = bounds.bottom - mover.radius;

  let bestDist = Infinity;
  let wallNormalX = 0;
  let wallNormalY = 0;

  if (ux < -1e-6) {
    const t = (minX - mover.x) / ux;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      wallNormalX = 1;
      wallNormalY = 0;
    }
  } else if (ux > 1e-6) {
    const t = (maxX - mover.x) / ux;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      wallNormalX = -1;
      wallNormalY = 0;
    }
  }

  if (uy < -1e-6) {
    const t = (minY - mover.y) / uy;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      wallNormalX = 0;
      wallNormalY = 1;
    }
  } else if (uy > 1e-6) {
    const t = (maxY - mover.y) / uy;
    if (t >= 0 && t < bestDist) {
      bestDist = t;
      wallNormalX = 0;
      wallNormalY = -1;
    }
  }

  let targetBody: PhysicsBody | undefined;

  for (const b of bodies) {
    if (b.pocketed || (mover.id && b.id === mover.id)) continue;
    const ocX = b.x - mover.x;
    const ocY = b.y - mover.y;
    const proj = ocX * ux + ocY * uy;
    if (proj < 0) continue;

    const sumR = mover.radius + b.radius;
    const perpSq = ocX * ocX + ocY * ocY - proj * proj;
    if (perpSq > sumR * sumR) continue;

    const thc = Math.sqrt(Math.max(0, sumR * sumR - perpSq));
    const tHit = Math.max(0, proj - thc);
    if (tHit < bestDist) {
      bestDist = tHit;
      targetBody = b;
    }
  }

  if (!Number.isFinite(bestDist)) bestDist = 0;

  return {
    hitX: mover.x + ux * bestDist,
    hitY: mover.y + uy * bestDist,
    hitDist: bestDist,
    targetBody,
    wallNormalX: targetBody ? undefined : wallNormalX,
    wallNormalY: targetBody ? undefined : wallNormalY,
  };
}

export function stepPhysics(
  bodies: PhysicsBody[],
  bounds: TableBounds,
  pockets: Pocket[],
  options: PhysicsOptions
): PhysicsStepResult {
  const substeps = options.substeps ?? 10;
  const minSpeed = options.minSpeed ?? 0.05;
  const linearDecelPerSubstep = (options.linearFriction ?? 0) / substeps;
  const newlyPocketed: PhysicsBody[] = [];
  const pocketedInto: PocketEvent[] = [];
  const hitPairs: Array<[string, string]> = [];
  const impactPoints: ImpactPoint[] = [];
  const recordedImpacts = new Set<string>();
  let firstHitId: string | undefined;
  let wallHits = 0;
  let maxBallImpact = 0;
  let maxWallImpact = 0;

  // Snapshot positions prior to this frame step for sub-frame render interpolation
  for (const b of bodies) {
    if (!b.pocketed) {
      b.prevX = b.x;
      b.prevY = b.y;
    }
  }

  const substepFriction = Math.pow(options.friction, 1 / substeps);
  const dt = 1 / substeps;

  for (let step = 0; step < substeps; step++) {
    // 1. Integrate positions & rolling phase
    for (const b of bodies) {
      if (b.pocketed) continue;
      const dx = b.vx * dt;
      const dy = b.vy * dt;
      b.x += dx;
      b.y += dy;
      b.rollX = (b.rollX ?? 0) + dx;
      b.rollY = (b.rollY ?? 0) + dy;
    }

    // 2. Check pocket captures & subtle pocket-lip funnel before wall bounce
    for (const b of bodies) {
      if (b.pocketed) continue;
      for (const p of pockets) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const dist = Math.hypot(dx, dy);
        const captureRadius = p.radius - b.radius * 0.05;
        if (dist <= captureRadius) {
          const entryX = b.x;
          const entryY = b.y;
          b.pocketed = true;
          b.vx = 0;
          b.vy = 0;
          b.x = p.x;
          b.y = p.y;
          newlyPocketed.push(b);
          pocketedInto.push({ body: b, pocket: p, entryX, entryY });
          break;
        }
        // Gentle rim funnel when heading into pocket mouth
        if (dist <= p.radius + b.radius * 0.18 && dist > 0.001) {
          const toPx = -dx / dist;
          const toPy = -dy / dist;
          if (b.vx * toPx + b.vy * toPy > 0) {
            b.vx += toPx * 0.085 * dt;
            b.vy += toPy * 0.085 * dt;
          }
        }
      }
    }

    // 3. Wall collisions (only skip inner cushion bounce right at the pocket throat, with hard outer rail safety clamp)
    for (const b of bodies) {
      if (b.pocketed) continue;

      let nearPocket = false;
      for (const p of pockets) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const throatR = p.radius + b.radius * 0.12;
        if (dx * dx + dy * dy <= throatR * throatR) {
          nearPocket = true;
          break;
        }
      }

      if (nearPocket) {
        const slack = b.radius * 0.35;
        if (b.x - b.radius < bounds.left - slack) {
          b.x = bounds.left - slack + b.radius;
          b.vx = Math.abs(b.vx) * 0.65;
        } else if (b.x + b.radius > bounds.right + slack) {
          b.x = bounds.right + slack - b.radius;
          b.vx = -Math.abs(b.vx) * 0.65;
        }
        if (b.y - b.radius < bounds.top - slack) {
          b.y = bounds.top - slack + b.radius;
          b.vy = Math.abs(b.vy) * 0.65;
        } else if (b.y + b.radius > bounds.bottom + slack) {
          b.y = bounds.bottom + slack - b.radius;
          b.vy = -Math.abs(b.vy) * 0.65;
        }
        continue;
      }

      const recordWallHit = (hx: number, hy: number, nx: number, ny: number, spd: number, sideKey: string) => {
        if (spd <= 1.1) return;
        const intensity = Math.min(1, spd / 15);
        if (intensity > maxWallImpact) maxWallImpact = intensity;
        const key = `w:${b.id}:${sideKey}`;
        if (!recordedImpacts.has(key)) {
          recordedImpacts.add(key);
          impactPoints.push({ x: hx, y: hy, nx, ny, intensity, kind: 'wall' });
        }
      };

      if (b.x - b.radius < bounds.left) {
        const spd = Math.abs(b.vx);
        b.x = bounds.left + b.radius;
        b.vx = spd * options.wallRestitution;
        wallHits++;
        recordWallHit(bounds.left, b.y, 1, 0, spd, 'L');
      } else if (b.x + b.radius > bounds.right) {
        const spd = Math.abs(b.vx);
        b.x = bounds.right - b.radius;
        b.vx = -spd * options.wallRestitution;
        wallHits++;
        recordWallHit(bounds.right, b.y, -1, 0, spd, 'R');
      }

      if (b.y - b.radius < bounds.top) {
        const spd = Math.abs(b.vy);
        b.y = bounds.top + b.radius;
        b.vy = spd * options.wallRestitution;
        wallHits++;
        recordWallHit(b.x, bounds.top, 0, 1, spd, 'T');
      } else if (b.y + b.radius > bounds.bottom) {
        const spd = Math.abs(b.vy);
        b.y = bounds.bottom - b.radius;
        b.vy = -spd * options.wallRestitution;
        wallHits++;
        recordWallHit(b.x, bounds.bottom, 0, -1, spd, 'B');
      }
    }

    // 4. Circle-circle elastic collisions
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.pocketed) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;

        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq) || 0.0001;
        const nx = dx / dist;
        const ny = dy / dist;

        // Positional correction so balls never overlap/stick
        const overlap = minDist - dist;
        const totalMass = a.mass + b.mass;
        a.x -= nx * overlap * (b.mass / totalMass);
        a.y -= ny * overlap * (b.mass / totalMass);
        b.x += nx * overlap * (a.mass / totalMass);
        b.y += ny * overlap * (a.mass / totalMass);

        // Relative velocity along normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        hitPairs.push([a.id, b.id]);
        if (!firstHitId) {
          if (a.kind === 'cue' || a.kind === 'striker') firstHitId = b.id;
          else if (b.kind === 'cue' || b.kind === 'striker') firstHitId = a.id;
        }

        if (velAlongNormal > 0) continue;

        const impactSpeed = Math.abs(velAlongNormal);
        if (impactSpeed > 0.7) {
          const intensity = Math.min(1, impactSpeed / 14);
          if (intensity > maxBallImpact) maxBallImpact = intensity;
          const pairKey = a.id < b.id ? `b:${a.id}:${b.id}` : `b:${b.id}:${a.id}`;
          if (!recordedImpacts.has(pairKey)) {
            recordedImpacts.add(pairKey);
            impactPoints.push({
              x: a.x + nx * a.radius,
              y: a.y + ny * a.radius,
              nx,
              ny,
              intensity,
              kind: 'ball',
            });
          }
        }

        const e = Math.min(a.restitution, b.restitution);
        const impulse = (-(1 + e) * velAlongNormal) / (1 / a.mass + 1 / b.mass);

        a.vx -= (impulse / a.mass) * nx;
        a.vy -= (impulse / a.mass) * ny;
        b.vx += (impulse / b.mass) * nx;
        b.vy += (impulse / b.mass) * ny;
      }
    }

    // 5. Apply combined viscous drag + Coulomb rolling deceleration
    for (const b of bodies) {
      if (b.pocketed) continue;
      b.vx *= substepFriction;
      b.vy *= substepFriction;
      if (linearDecelPerSubstep > 0) {
        const speed = Math.hypot(b.vx, b.vy);
        if (speed <= linearDecelPerSubstep) {
          b.vx = 0;
          b.vy = 0;
        } else if (speed > 0) {
          const scale = (speed - linearDecelPerSubstep) / speed;
          b.vx *= scale;
          b.vy *= scale;
        }
      }
    }
  }

  let moving = false;
  for (const b of bodies) {
    if (b.pocketed) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < minSpeed) {
      b.vx = 0;
      b.vy = 0;
    } else {
      moving = true;
    }
  }

  return {
    moving,
    newlyPocketed,
    pocketedInto,
    firstHitId,
    hitPairs,
    impactPoints,
    wallHits,
    maxBallImpact,
    maxWallImpact,
  };
}

export interface ActiveImpact extends ImpactPoint {
  start: number;
  seed: number;
}

export interface PocketPulse {
  x: number;
  y: number;
  radius: number;
  start: number;
  color: string;
}

export interface ScreenShake {
  intensity: number;
  start: number;
}

export function applyMicroShake(
  ctx: CanvasRenderingContext2D,
  now: number,
  shake: ScreenShake | null
): boolean {
  if (!shake) return false;
  const elapsed = now - shake.start;
  if (elapsed >= 115) return false;
  const damp = 1 - elapsed / 115;
  const sx = Math.sin(elapsed * 0.45) * shake.intensity * damp;
  const sy = Math.cos(elapsed * 0.58) * shake.intensity * damp;
  ctx.translate(sx, sy);
  return true;
}

export function drawPhysicsHitVfx(
  ctx: CanvasRenderingContext2D,
  now: number,
  impacts: ActiveImpact[],
  pocketPulses: PocketPulse[],
  theme: { ballColor: string; sparkColor: string; wallColor: string }
): { impacts: ActiveImpact[]; pocketPulses: PocketPulse[] } {
  const activePulses = pocketPulses.filter((p) => now - p.start < 340);
  for (const p of activePulses) {
    const t = (now - p.start) / 340;
    const ease = 1 - Math.pow(1 - t, 2);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.72;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.6 * (1 - t * 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (0.85 + ease * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const activeImpacts = impacts.filter((im) => now - im.start < 240);
  for (const im of activeImpacts) {
    const t = (now - im.start) / 240;
    const ease = 1 - Math.pow(1 - t, 2);

    if (im.kind === 'wall') {
      const baseAngle = Math.atan2(im.ny, im.nx);
      ctx.save();
      ctx.globalAlpha = (1 - t) * Math.min(0.85, 0.35 + im.intensity * 0.5);
      ctx.strokeStyle = theme.wallColor;
      ctx.lineWidth = 2.4 * (1 - t * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(im.x, im.y, 5 + ease * 18 * Math.max(0.45, im.intensity), baseAngle - 0.85, baseAngle + 0.85);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    ctx.save();
    // 1. Bright contact flash core
    if (t < 0.45) {
      ctx.globalAlpha = (1 - t / 0.45) * Math.min(0.9, 0.4 + im.intensity * 0.5);
      ctx.fillStyle = theme.ballColor;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 4 + (1 - t) * 6 * im.intensity, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Dual concentric shockwave rings
    ctx.globalAlpha = (1 - t) * Math.min(0.85, 0.35 + im.intensity * 0.55);
    ctx.strokeStyle = theme.ballColor;
    ctx.lineWidth = 2.0 * (1 - t * 0.45);
    ctx.beginPath();
    ctx.arc(im.x, im.y, 4 + ease * 24 * Math.max(0.5, im.intensity), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = (1 - t) * 0.5 * im.intensity;
    ctx.strokeStyle = theme.sparkColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(im.x, im.y, 2 + ease * 13 * Math.max(0.5, im.intensity), 0, Math.PI * 2);
    ctx.stroke();

    // 3. Directional kinetic spark streaks along contact tangent
    const tangentAngle = Math.atan2(im.ny, im.nx) + Math.PI / 2;
    const sparkCount = im.intensity > 0.45 ? 6 : 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.sparkColor;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = (1 - t) * Math.min(0.95, 0.35 + im.intensity * 0.65);
    for (let k = 0; k < sparkCount; k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      const spread = (im.seed * 0.7 + k * 0.42) % 0.9;
      const ang = tangentAngle + (sign === -1 ? Math.PI : 0) + (spread - 0.45);
      const r0 = 3 + ease * 8 * Math.max(0.5, im.intensity);
      const r1 = r0 + (1 - t) * (6 + 7 * im.intensity);
      ctx.beginPath();
      ctx.moveTo(im.x + Math.cos(ang) * r0, im.y + Math.sin(ang) * r0);
      ctx.lineTo(im.x + Math.cos(ang) * r1, im.y + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { impacts: activeImpacts, pocketPulses: activePulses };
}
