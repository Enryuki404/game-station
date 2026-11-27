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
  intensity: number;
}

export interface PhysicsStepResult {
  moving: boolean;
  newlyPocketed: PhysicsBody[];
  pocketedInto: PocketEvent[];
  firstHitId?: string;
  hitPairs: Array<[string, string]>;
  impactPoints: ImpactPoint[];
  wallHits: number;
}

export function stepPhysics(
  bodies: PhysicsBody[],
  bounds: TableBounds,
  pockets: Pocket[],
  options: PhysicsOptions
): PhysicsStepResult {
  const substeps = options.substeps ?? 8;
  const minSpeed = options.minSpeed ?? 0.05;
  const linearDecelPerSubstep = (options.linearFriction ?? 0) / substeps;
  const newlyPocketed: PhysicsBody[] = [];
  const pocketedInto: PocketEvent[] = [];
  const hitPairs: Array<[string, string]> = [];
  const impactPoints: ImpactPoint[] = [];
  let firstHitId: string | undefined;
  let wallHits = 0;

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

    // 2. Check pocket captures before wall bounce so balls near pocket mouth drop cleanly
    for (const b of bodies) {
      if (b.pocketed) continue;
      for (const p of pockets) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const captureRadius = p.radius - b.radius * 0.15;
        if (dx * dx + dy * dy <= captureRadius * captureRadius) {
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
      }
    }

    // 3. Wall collisions (skip bounce if aligned within a pocket opening)
    for (const b of bodies) {
      if (b.pocketed) continue;

      let nearPocket = false;
      for (const p of pockets) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy <= (p.radius + b.radius * 0.5) ** 2) {
          nearPocket = true;
          break;
        }
      }
      if (nearPocket) continue;

      if (b.x - b.radius < bounds.left) {
        b.x = bounds.left + b.radius;
        b.vx = Math.abs(b.vx) * options.wallRestitution;
        wallHits++;
      } else if (b.x + b.radius > bounds.right) {
        b.x = bounds.right - b.radius;
        b.vx = -Math.abs(b.vx) * options.wallRestitution;
        wallHits++;
      }

      if (b.y - b.radius < bounds.top) {
        b.y = bounds.top + b.radius;
        b.vy = Math.abs(b.vy) * options.wallRestitution;
        wallHits++;
      } else if (b.y + b.radius > bounds.bottom) {
        b.y = bounds.bottom - b.radius;
        b.vy = -Math.abs(b.vy) * options.wallRestitution;
        wallHits++;
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
        if (impactSpeed > 0.8 && step === 0) {
          impactPoints.push({
            x: a.x + nx * a.radius,
            y: a.y + ny * a.radius,
            intensity: Math.min(1, impactSpeed / 14),
          });
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
  };
}
