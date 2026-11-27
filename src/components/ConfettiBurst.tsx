import React, { useEffect, useRef } from 'react';

interface ConfettiBurstProps {
  trigger: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  vRot: number;
  life: number;
  maxLife: number;
}

const COLORS = ['#facc15', '#34d399', '#38bdf8', '#fb7185', '#a78bfa', '#fb923c'];

export const ConfettiBurst: React.FC<ConfettiBurstProps> = ({ trigger }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (trigger <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const originX = width * 0.5;
    const originY = height * 0.35;

    const particles: Particle[] = Array.from({ length: 78 }).map((_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = 5 + Math.random() * 11;
      return {
        x: originX + (Math.random() - 0.5) * 120,
        y: originY + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.24,
        life: 0,
        maxLife: 110 + Math.random() * 40,
      };
    });

    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / (1000 / 60), 2.5);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      let alive = false;

      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        alive = true;

        p.vy += 0.28 * dt;
        p.vx *= Math.pow(0.985, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vRot * dt;

        const alpha = Math.max(0, 1 - Math.pow(p.life / p.maxLife, 1.8));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive) {
        rafId = requestAnimationFrame(loop);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, width, height);
    };
  }, [trigger]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 w-screen h-screen"
      aria-hidden="true"
    />
  );
};
