import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Globe, Trophy } from 'lucide-react';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { GameShell } from '../../components/GameShell';
import { OnlineRoomModal } from '../../components/OnlineRoomModal';
import { useGameStation } from '../../context/GameStationContext';
import {
  getSocket,
  leaveOnlineRoom,
  type MultiplayerRoomInfo,
  type OnlineSession,
} from '../../lib/multiplayer';
import {
  applyMicroShake,
  drawPhysicsHitVfx,
  stepPhysics,
  type ActiveImpact,
  type PhysicsBody,
  type PocketPulse,
  type ScreenShake,
} from '../../engine/physics2d';
import {
  BASELINE_BOTTOM_Y,
  BASELINE_LEFT_X,
  BASELINE_MAX_X,
  BASELINE_MIN_X,
  BASELINE_RIGHT_X,
  BASELINE_TOP_Y,
  CARROM_BORDER,
  CARROM_BOUNDS,
  CARROM_POCKETS,
  CARROM_SIZE,
  COIN_RADIUS,
  computeCarromAiShot,
  createCarromBodies,
  findValidStrikerOnSide,
  getBaselinePoint,
  getCarromSide,
  getCarromTeam,
  isStrikerPositionValid,
  POCKET_OFFSET,
  POCKET_RADIUS,
  raycastCarromAim,
  STRIKER_RADIUS,
  type CarromSide,
} from './carromEngine';

interface CarromGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
  initialOnline?: boolean;
}

interface CarromHud {
  turn: 1 | 2 | 3 | 4;
  playerCount: 2 | 4;
  whiteLeft: number;
  blackLeft: number;
  queenState: 'board' | 'pending_1' | 'pending_2' | 'claimed_1' | 'claimed_2';
  score1: number;
  score2: number;
  status: string;
  winner: 1 | 2 | null;
  isMoving: boolean;
}

function getBaselineMetrics(pt: { x: number; y: number }, side: CarromSide) {
  const isVertical = side === 'left' || side === 'right';
  const baseCoord =
    side === 'bottom'
      ? BASELINE_BOTTOM_Y
      : side === 'top'
        ? BASELINE_TOP_Y
        : side === 'left'
          ? BASELINE_LEFT_X
          : BASELINE_RIGHT_X;
  const perpDist = Math.abs((isVertical ? pt.x : pt.y) - baseCoord);
  const alongCoord = isVertical ? pt.y : pt.x;
  const span = BASELINE_MAX_X - BASELINE_MIN_X;
  const t = Math.max(0, Math.min(1, (alongCoord - BASELINE_MIN_X) / span));
  const withinSpan = alongCoord >= BASELINE_MIN_X - 24 && alongCoord <= BASELINE_MAX_X + 24;
  return { perpDist, alongCoord, t, withinSpan };
}

export const CarromGame: React.FC<CarromGameProps> = ({ onBack, initialRoomCode, initialOnline }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<PhysicsBody[]>(createCarromBodies());

  const startInOnline = Boolean(initialRoomCode || initialOnline);
  const modeRef = useRef<'ai' | 'online'>(startInOnline ? 'online' : 'ai');
  const [mode, setMode] = useState<'ai' | 'online'>(startInOnline ? 'online' : 'ai');
  const [aiCount, setAiCount] = useState<1 | 3>(1);
  const playerCountRef = useRef<2 | 4>(2);

  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const onlineSessionRef = useRef<OnlineSession | null>(null);
  onlineSessionRef.current = onlineSession;
  const [roomModalOpen, setRoomModalOpen] = useState(startInOnline);

  const turnRef = useRef<1 | 2 | 3 | 4>(1);
  const movingRef = useRef(false);
  const queenStateRef = useRef<'board' | 'pending_1' | 'pending_2' | 'claimed_1' | 'claimed_2'>('board');
  const pocketedThisTurnRef = useRef<PhysicsBody[]>([]);
  const dragRef = useRef<{
    mode: 'none' | 'pending' | 'slide' | 'aim';
    startX: number;
    startY: number;
    x: number;
    y: number;
  }>({ mode: 'none', startX: 0, startY: 0, x: 0, y: 0 });
  const lastStrikerEmitRef = useRef(0);
  const winnerRef = useRef<1 | 2 | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair');
  const sinkingRef = useRef<Array<{ x: number; y: number; toX: number; toY: number; radius: number; color: string; start: number }>>([]);
  const impactsRef = useRef<ActiveImpact[]>([]);
  const pocketPulsesRef = useRef<PocketPulse[]>([]);
  const shakeRef = useRef<ScreenShake | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const aiAnimRef = useRef<{
    active: boolean;
    start: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    vx: number;
    vy: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const rewardRef = useRef(false);
  const patternsRef = useRef<{ lightWood: CanvasPattern | null; darkWood: CanvasPattern | null }>({
    lightWood: null,
    darkWood: null,
  });
  const [confettiKey, setConfettiKey] = useState(0);

  // Static board (0 rad) in AI & Lokal modes — never spins between turns!
  // In Online mode, locked once to your own seat so your baseline is at the bottom.
  const getViewAngle = useCallback((): number => {
    if (modeRef.current !== 'online') return 0;
    const seat = onlineSessionRef.current?.seatIdx ?? 0;
    const count = playerCountRef.current;
    if (count === 2) {
      return seat === 1 ? Math.PI : 0;
    }
    switch (seat) {
      case 1:
        return Math.PI / 2;
      case 2:
        return Math.PI;
      case 3:
        return -Math.PI / 2;
      default:
        return 0;
    }
  }, []);

  const [hud, setHud] = useState<CarromHud>({
    turn: 1,
    playerCount: 2,
    whiteLeft: 9,
    blackLeft: 9,
    queenState: 'board',
    score1: 0,
    score2: 0,
    status: 'Geser bidak kuning di garis hijau, lalu tarik mundur untuk menembak!',
    winner: null,
    isMoving: false,
  });

  const syncHud = useCallback((statusOverride?: string, winnerOverride?: 1 | 2 | null) => {
    const bodies = bodiesRef.current;
    const whiteLeft = bodies.filter((b) => b.kind === 'white' && !b.pocketed).length;
    const blackLeft = bodies.filter((b) => b.kind === 'black' && !b.pocketed).length;
    const qState = queenStateRef.current;
    if (winnerOverride !== undefined) {
      winnerRef.current = winnerOverride;
    }

    const score1 = 9 - whiteLeft + (qState === 'claimed_1' ? 3 : 0);
    const score2 = 9 - blackLeft + (qState === 'claimed_2' ? 3 : 0);

    setHud((prev) => ({
      turn: turnRef.current,
      playerCount: playerCountRef.current,
      whiteLeft,
      blackLeft,
      queenState: qState,
      score1,
      score2,
      status: statusOverride ?? prev.status,
      winner: winnerOverride !== undefined ? winnerOverride : prev.winner,
      isMoving: movingRef.current,
    }));
  }, []);

  const placeStrikerForTurn = useCallback((player: 1 | 2 | 3 | 4) => {
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker) return;
    const side = getCarromSide(player, playerCountRef.current);
    const spot = findValidStrikerOnSide(bodiesRef.current, side, 0.5);
    striker.pocketed = false;
    striker.vx = 0;
    striker.vy = 0;
    striker.x = spot.x;
    striker.y = spot.y;
    striker.prevX = spot.x;
    striker.prevY = spot.y;
  }, []);

  const returnCoinToCenter = useCallback((kind: 'white' | 'black' | 'queen') => {
    const coin = bodiesRef.current.find((b) => b.kind === kind && b.pocketed);
    if (!coin) return;
    coin.pocketed = false;
    coin.vx = 0;
    coin.vy = 0;
    let cx = CARROM_SIZE / 2;
    let cy = CARROM_SIZE / 2;
    for (let ring = 0; ring < 12; ring++) {
      const ang = ring * 0.9;
      const dist = ring === 0 ? 0 : COIN_RADIUS * 2.2 * Math.ceil(ring / 4);
      const tx = CARROM_SIZE / 2 + Math.cos(ang) * dist;
      const ty = CARROM_SIZE / 2 + Math.sin(ang) * dist;
      const free = bodiesRef.current.every(
        (b) => b.pocketed || b.id === coin.id || Math.hypot(b.x - tx, b.y - ty) >= b.radius + coin.radius + 1
      );
      if (free) {
        cx = tx;
        cy = ty;
        break;
      }
    }
    coin.x = cx;
    coin.y = cy;
    coin.prevX = cx;
    coin.prevY = cy;
  }, []);

  const getPlayerLabel = useCallback((playerNum: 1 | 2 | 3 | 4): string => {
    const teamLabel = getCarromTeam(playerNum) === 1 ? 'Putih' : 'Hitam';
    if (modeRef.current === 'online') {
      const p = onlineSessionRef.current?.room.players[playerNum - 1];
      return p ? `${p.name} (${teamLabel})` : `Pemain ${playerNum} (${teamLabel})`;
    }
    if (modeRef.current === 'ai') {
      if (playerNum === 1) return 'Kamu (Putih)';
      if (playerNum === 3) return 'Bot Partner (Putih)';
      return playerCountRef.current === 4 ? `Bot P${playerNum} (${teamLabel})` : `Bot (${teamLabel})`;
    }
    return `Pemain ${playerNum} (${teamLabel})`;
  }, []);

  const drawBoard = useCallback((alpha = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = Math.floor(CARROM_SIZE * dpr);
    if (canvas.width !== targetPx || canvas.height !== targetPx) {
      canvas.width = targetPx;
      canvas.height = targetPx;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const viewAngle = getViewAngle();
    const half = CARROM_SIZE / 2;
    const now = performance.now();
    ctx.save();
    if (!applyMicroShake(ctx, now, shakeRef.current)) {
      shakeRef.current = null;
    }
    if (viewAngle !== 0) {
      ctx.translate(half, half);
      ctx.rotate(viewAngle);
      ctx.translate(-half, -half);
    }

    // Outer wooden border
    ctx.fillStyle = '#3b1f10';
    ctx.fillRect(0, 0, CARROM_SIZE, CARROM_SIZE);
    if (patternsRef.current.darkWood) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = patternsRef.current.darkWood;
      ctx.fillRect(0, 0, CARROM_SIZE, CARROM_SIZE);
      ctx.restore();
    }

    // Inner bevel
    ctx.strokeStyle = '#6f3e21';
    ctx.lineWidth = 4;
    ctx.strokeRect(CARROM_BORDER - 2, CARROM_BORDER - 2, CARROM_SIZE - CARROM_BORDER * 2 + 4, CARROM_SIZE - CARROM_BORDER * 2 + 4);

    // Playing surface
    const grad = ctx.createRadialGradient(320, 320, 40, 320, 320, 420);
    grad.addColorStop(0, '#f6dfb9');
    grad.addColorStop(1, '#dfc08d');
    ctx.fillStyle = grad;
    ctx.fillRect(CARROM_BORDER, CARROM_BORDER, CARROM_SIZE - CARROM_BORDER * 2, CARROM_SIZE - CARROM_BORDER * 2);
    if (patternsRef.current.lightWood) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = patternsRef.current.lightWood;
      ctx.fillRect(CARROM_BORDER, CARROM_BORDER, CARROM_SIZE - CARROM_BORDER * 2, CARROM_SIZE - CARROM_BORDER * 2);
      ctx.restore();
    }

    // 4-Side Baselines (with subtle highlight on the active player's side)
    const activeSide = getCarromSide(turnRef.current, playerCountRef.current);
    const drawHorizontalBaseline = (y: number, side: 'bottom' | 'top') => {
      const isAct = activeSide === side && !movingRef.current;
      if (isAct) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.lineWidth = 24;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(BASELINE_MIN_X, y);
        ctx.lineTo(BASELINE_MAX_X, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BASELINE_MIN_X, y - 11);
      ctx.lineTo(BASELINE_MAX_X, y - 11);
      ctx.moveTo(BASELINE_MIN_X, y + 11);
      ctx.lineTo(BASELINE_MAX_X, y + 11);
      ctx.stroke();

      for (const endX of [BASELINE_MIN_X, BASELINE_MAX_X]) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(endX, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    const drawVerticalBaseline = (x: number, side: 'left' | 'right') => {
      const isAct = activeSide === side && !movingRef.current;
      if (isAct) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.lineWidth = 24;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, BASELINE_MIN_X);
        ctx.lineTo(x, BASELINE_MAX_X);
        ctx.stroke();
      }
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 11, BASELINE_MIN_X);
      ctx.lineTo(x - 11, BASELINE_MAX_X);
      ctx.moveTo(x + 11, BASELINE_MIN_X);
      ctx.lineTo(x + 11, BASELINE_MAX_X);
      ctx.stroke();

      for (const endY of [BASELINE_MIN_X, BASELINE_MAX_X]) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(x, endY, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    drawHorizontalBaseline(BASELINE_BOTTOM_Y, 'bottom');
    drawHorizontalBaseline(BASELINE_TOP_Y, 'top');
    drawVerticalBaseline(BASELINE_LEFT_X, 'left');
    drawVerticalBaseline(BASELINE_RIGHT_X, 'right');

    // Center circle & compass star
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(320, 320, 74, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(153, 27, 27, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(320, 320, 66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(320, 320);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(7, -34);
      ctx.lineTo(0, -60);
      ctx.lineTo(-7, -34);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(153, 27, 27, 0.22)' : 'rgba(124, 45, 18, 0.14)';
      ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(320, 320, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Diagonal guide arrows
    ctx.strokeStyle = 'rgba(124, 45, 18, 0.45)';
    ctx.lineWidth = 1.6;
    for (const [x1, y1, x2, y2] of [
      [120, 120, 225, 225],
      [520, 120, 415, 225],
      [120, 520, 225, 415],
      [520, 520, 415, 415],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Corner-merged 3D conical funnel pockets ("kerucut")
    const c = POCKET_OFFSET;
    const r = POCKET_RADIUS;
    const jaw = c + r + 5;
    const corners = [
      { cx: CARROM_BORDER, cy: CARROM_BORDER, sx: 1, sy: 1 },
      { cx: CARROM_SIZE - CARROM_BORDER, cy: CARROM_BORDER, sx: -1, sy: 1 },
      { cx: CARROM_BORDER, cy: CARROM_SIZE - CARROM_BORDER, sx: 1, sy: -1 },
      { cx: CARROM_SIZE - CARROM_BORDER, cy: CARROM_SIZE - CARROM_BORDER, sx: -1, sy: -1 },
    ];

    const traceMouthArc = () => {
      ctx.moveTo(jaw, 0);
      ctx.bezierCurveTo(jaw - 7, 0, c + r, 8, c + r, c);
      ctx.arc(c, c, r, 0, Math.PI / 2);
      ctx.bezierCurveTo(8, c + r, 0, jaw - 7, 0, jaw);
    };

    const traceFunnelOpening = () => {
      ctx.beginPath();
      traceMouthArc();
      ctx.bezierCurveTo(-9, 36, -16, 10, -10, -4);
      ctx.quadraticCurveTo(-13, -13, -4, -10);
      ctx.bezierCurveTo(10, -16, 36, -9, jaw, 0);
      ctx.closePath();
    };

    for (const corner of corners) {
      ctx.save();
      ctx.translate(corner.cx, corner.cy);
      ctx.scale(corner.sx, corner.sy);

      // 1. Outer wooden corner collar fusing pocket cleanly into corner frame
      ctx.beginPath();
      ctx.moveTo(jaw + 4, -4);
      ctx.bezierCurveTo(jaw - 5, -3, c + r + 3.5, 7, c + r + 3.5, c);
      ctx.arc(c, c, r + 3.5, 0, Math.PI / 2);
      ctx.bezierCurveTo(7, c + r + 3.5, -3, jaw - 5, -4, jaw + 4);
      ctx.bezierCurveTo(-13, 38, -20, 11, -14, -7);
      ctx.quadraticCurveTo(-17, -17, -7, -14);
      ctx.bezierCurveTo(11, -20, 38, -13, jaw + 4, -4);
      ctx.closePath();
      const collarGrad = ctx.createLinearGradient(-15, -15, c + r, c + r);
      collarGrad.addColorStop(0, '#2a1308');
      collarGrad.addColorStop(0.55, '#4e2813');
      collarGrad.addColorStop(1, '#6f3e21');
      ctx.fillStyle = collarGrad;
      ctx.fill();

      // 2. Conical interior clipped inside recessed funnel path
      ctx.save();
      traceFunnelOpening();
      ctx.clip();

      const coneGrad = ctx.createRadialGradient(-2, -2, 4, c + 4, c + 4, r + 18);
      coneGrad.addColorStop(0, '#020617');
      coneGrad.addColorStop(0.42, '#0b1220');
      coneGrad.addColorStop(0.78, '#1e293b');
      coneGrad.addColorStop(1, '#334155');
      ctx.fillStyle = coneGrad;
      ctx.fillRect(-20, -20, jaw + 30, jaw + 30);

      // Concentric tapered cone rings converging toward the corner apex
      for (const ring of [
        { cx: 14, cy: 14, radius: 26, stroke: 'rgba(148, 163, 184, 0.14)' },
        { cx: 7, cy: 7, radius: 18, stroke: 'rgba(148, 163, 184, 0.11)' },
        { cx: 0, cy: 0, radius: 10, stroke: 'rgba(148, 163, 184, 0.08)' },
      ]) {
        ctx.beginPath();
        ctx.arc(ring.cx, ring.cy, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = ring.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Soft inner shadow cast by overhanging wooden corner frame
      ctx.beginPath();
      ctx.moveTo(jaw + 2, -2);
      ctx.bezierCurveTo(10, -16, -9, -9, -2, jaw + 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();

      // 3. Open playing-surface jaw bevel & subtle warm lip highlight
      ctx.beginPath();
      traceMouthArc();
      ctx.strokeStyle = '#5c2d13';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      traceMouthArc();
      ctx.strokeStyle = 'rgba(253, 230, 138, 0.28)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // 4. Outer corner wood rim hugging the recessed back wall
      ctx.beginPath();
      ctx.moveTo(jaw + 1, -3);
      ctx.bezierCurveTo(11, -18, -12, -12, -3, jaw + 1);
      ctx.strokeStyle = '#6f3e21';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.restore();
    }

    // Sinking animations
    sinkingRef.current = sinkingRef.current.filter((s) => now - s.start < 240);
    for (const s of sinkingRef.current) {
      const t = (now - s.start) / 240;
      const ease = t * t;
      const sx = s.x + (s.toX - s.x) * ease;
      const sy = s.y + (s.toY - s.y) * ease;
      const scale = 1 - t * 0.85;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(sx, sy, s.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.restore();
    }

    // Hit VFX (warm coin/striker shockwaves, sparks, wood rail impact arcs, pocket rim pulses)
    const vfxNext = drawPhysicsHitVfx(ctx, now, impactsRef.current, pocketPulsesRef.current, {
      ballColor: '#fef3c7',
      sparkColor: '#f59e0b',
      wallColor: '#fb923c',
    });
    impactsRef.current = vfxNext.impacts;
    pocketPulsesRef.current = vfxNext.pocketPulses;

    // Striker trail
    if (trailRef.current.length > 1) {
      for (let i = 0; i < trailRef.current.length; i++) {
        const pt = trailRef.current[i];
        const frac = (i + 1) / trailRef.current.length;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 18.5 * (0.45 + 0.4 * frac), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(253, 230, 138, ${frac * 0.22})`;
        ctx.fill();
      }
    }

    // Coins & Striker
    for (const b of bodiesRef.current) {
      if (b.pocketed) continue;
      const px = b.prevX ?? b.x;
      const py = b.prevY ?? b.y;
      const rx = px + (b.x - px) * alpha;
      const ry = py + (b.y - py) * alpha;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(rx, ry, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2;
      ctx.strokeStyle =
        b.kind === 'white'
          ? '#cbd5e1'
          : b.kind === 'black'
            ? '#020617'
            : b.kind === 'queen'
              ? '#881337'
              : '#b45309';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rx, ry, b.radius * 0.58, 0, Math.PI * 2);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle =
        b.kind === 'white'
          ? 'rgba(100,116,139,0.45)'
          : b.kind === 'black'
            ? 'rgba(148,163,184,0.35)'
            : b.kind === 'queen'
              ? 'rgba(255,228,230,0.6)'
              : '#92400e';
      ctx.stroke();
      ctx.restore();
    }

    // Slide affordance + Aim guides
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    const canLocalDrag =
      !movingRef.current &&
      !aiAnimRef.current?.active &&
      winnerRef.current === null &&
      ((modeRef.current === 'ai' && turnRef.current === 1) ||
        (modeRef.current === 'online' &&
          Boolean(onlineSessionRef.current && onlineSessionRef.current.room.players.length >= 2) &&
          turnRef.current === (onlineSessionRef.current?.seatIdx ?? 0) + 1));

    if (canLocalDrag && striker && !striker.pocketed && dragRef.current.mode !== 'aim') {
      const side = getCarromSide(turnRef.current, playerCountRef.current);
      const isVertical = side === 'left' || side === 'right';
      const isSliding = dragRef.current.mode === 'slide' || dragRef.current.mode === 'pending';

      ctx.save();
      if (isSliding) {
        ctx.beginPath();
        ctx.arc(striker.x, striker.y, STRIKER_RADIUS + 5.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.stroke();
      }

      // Flanking chevron arrows along baseline axis to show direct slide control
      ctx.translate(striker.x, striker.y);
      if (isVertical) ctx.rotate(Math.PI / 2);
      const offset = STRIKER_RADIUS + 10;
      const drawChevron = (dir: -1 | 1) => {
        ctx.beginPath();
        ctx.moveTo(dir * (offset - 4), -4.5);
        ctx.lineTo(dir * (offset + 2), 0);
        ctx.lineTo(dir * (offset - 4), 4.5);
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.stroke();
        ctx.lineWidth = 1.9;
        ctx.strokeStyle = isSliding ? '#34d399' : '#fef08a';
        ctx.stroke();
      };
      drawChevron(-1);
      drawChevron(1);
      ctx.restore();
    }

    if (aiAnimRef.current?.active && striker && !striker.pocketed) {
      const anim = aiAnimRef.current;
      const elapsed = now - anim.start;
      if (elapsed > 320) {
        const pullT = Math.min(1, (elapsed - 320) / 300);
        const eased = 1 - Math.pow(1 - pullT, 2);
        const speed = Math.hypot(anim.vx, anim.vy) || 1;
        const ux = anim.vx / speed;
        const uy = anim.vy / speed;
        const pullLen = Math.min(130, speed * 5.8) * eased;

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.72)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x - ux * pullLen, striker.y - uy * pullLen);
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x + ux * (90 + pullLen * 1.2), striker.y + uy * (90 + pullLen * 1.2));
        ctx.stroke();
        ctx.restore();
      }
    } else if (dragRef.current.mode === 'aim' && striker && !striker.pocketed && !movingRef.current) {
      const dx = striker.x - dragRef.current.x;
      const dy = striker.y - dragRef.current.y;
      const pull = Math.hypot(dx, dy);
      if (pull > 12) {
        const clampedPull = Math.min(pull, 140);
        const ux = dx / pull;
        const uy = dy / pull;
        const aim = raycastCarromAim(bodiesRef.current, striker, ux, uy);

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x - ux * clampedPull, striker.y - uy * clampedPull);
        ctx.stroke();

        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(aim.hitX, aim.hitY);
        ctx.stroke();
        ctx.restore();

        // Ghost striker circle at exact contact point
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(aim.hitX, aim.hitY, STRIKER_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        if (aim.targetBody) {
          const tx = aim.targetBody.x - aim.hitX;
          const ty = aim.targetBody.y - aim.hitY;
          const td = Math.hypot(tx, ty) || 1;
          const nx = tx / td;
          const ny = ty / td;
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.92)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(aim.targetBody.x, aim.targetBody.y);
          ctx.lineTo(aim.targetBody.x + nx * 60, aim.targetBody.y + ny * 60);
          ctx.stroke();

          // Striker deflection preview
          const dot = ux * nx + uy * ny;
          const defX = ux - dot * nx;
          const defY = uy - dot * ny;
          const defLen = Math.hypot(defX, defY);
          if (defLen > 0.08) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(aim.hitX, aim.hitY);
            ctx.lineTo(aim.hitX + (defX / defLen) * 40, aim.hitY + (defY / defLen) * 40);
            ctx.stroke();
            ctx.restore();
          }
        } else if (aim.wallNormalX !== undefined && aim.wallNormalY !== undefined) {
          const dotW = ux * aim.wallNormalX + uy * aim.wallNormalY;
          const rx = ux - 2 * dotW * aim.wallNormalX;
          const ry = uy - 2 * dotW * aim.wallNormalY;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.65)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(aim.hitX, aim.hitY);
          ctx.lineTo(aim.hitX + rx * 48, aim.hitY + ry * 48);
          ctx.stroke();
          ctx.restore();
        }

        const pct = Math.round((clampedPull / 140) * 100);
        ctx.save();
        if (viewAngle !== 0) {
          ctx.translate(striker.x, striker.y - 31);
          ctx.rotate(-viewAngle);
          ctx.translate(-striker.x, -(striker.y - 31));
        }
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(striker.x - 24, striker.y - 42, 48, 22, 6);
        ctx.fill();
        ctx.fillStyle = pct > 75 ? '#fb7185' : '#fde047';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${pct}%`, striker.x, striker.y - 27);
        ctx.restore();
      }
    }
    ctx.restore();
  }, [getViewAngle]);

  const finishTurn = useCallback(() => {
    const onlineSess = onlineSessionRef.current;
    if (modeRef.current === 'online' && onlineSess && turnRef.current !== onlineSess.seatIdx + 1) {
      return;
    }

    const pocketed = pocketedThisTurnRef.current;
    pocketedThisTurnRef.current = [];
    const currentPlayer = turnRef.current;
    const currentTeam = getCarromTeam(currentPlayer);
    const ownKind: 'white' | 'black' = currentTeam === 1 ? 'white' : 'black';

    const strikerFoul = pocketed.some((b) => b.kind === 'striker');
    const pocketedOwn = pocketed.some((b) => b.kind === ownKind);
    const pocketedQueen = pocketed.some((b) => b.kind === 'queen');

    let qState = queenStateRef.current;
    let keepTurn = false;
    let msg = '';

    if (strikerFoul) {
      sfx('foul');
      returnCoinToCenter(ownKind);
      if (qState === `pending_${currentTeam}`) {
        returnCoinToCenter('queen');
        qState = 'board';
      }
      msg = 'Foul! Striker masuk lubang — 1 koin tim dikembalikan.';
      keepTurn = false;
    } else if (pocketedQueen) {
      if (pocketedOwn) {
        qState = `claimed_${currentTeam}`;
        msg = 'Mantap! Ratu Merah langsung ter-cover (+3 poin)!';
        keepTurn = true;
      } else {
        qState = `pending_${currentTeam}`;
        msg = 'Ratu Merah masuk! Masukkan koin tim untuk meng-cover.';
        keepTurn = true;
      }
    } else if (qState === `pending_${currentTeam}`) {
      if (pocketedOwn) {
        qState = `claimed_${currentTeam}`;
        msg = 'Ratu Merah berhasil di-cover (+3 poin)!';
        keepTurn = true;
      } else {
        returnCoinToCenter('queen');
        qState = 'board';
        msg = 'Gagal cover Ratu Merah — Ratu kembali ke tengah.';
        keepTurn = false;
      }
    } else if (pocketedOwn) {
      keepTurn = true;
      msg = 'Koin masuk! Giliran berlanjut.';
    } else {
      keepTurn = false;
      msg = 'Giliran berpindah.';
    }

    queenStateRef.current = qState;

    const whiteLeft = bodiesRef.current.filter((b) => b.kind === 'white' && !b.pocketed).length;
    const blackLeft = bodiesRef.current.filter((b) => b.kind === 'black' && !b.pocketed).length;

    if (whiteLeft === 0 || blackLeft === 0) {
      if (qState === 'pending_1' || qState === 'pending_2') returnCoinToCenter('queen');
      const winnerTeam: 1 | 2 = whiteLeft === 0 ? 1 : 2;
      const myTeam = modeRef.current === 'online' ? getCarromTeam((onlineSess?.seatIdx ?? 0) + 1) : 1;

      if (!rewardRef.current) {
        rewardRef.current = true;
        const humanWon = myTeam === winnerTeam;
        recordGame('carrom', humanWon);
        if (humanWon) {
          addChips(500);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else {
          sfx('lose');
        }
      }

      const winText =
        playerCountRef.current === 4
          ? `Tim ${winnerTeam === 1 ? 'Putih (P1 & P3)' : 'Hitam (P2 & P4)'} menang Karambol!`
          : winnerTeam === 1
            ? `${getPlayerLabel(1)} menang Karambol!`
            : `${getPlayerLabel(2)} menang Karambol!`;

      syncHud(winText, winnerTeam);
      drawBoard();
      if (modeRef.current === 'online' && onlineSess) {
        getSocket().emit('carrom:sync', {
          code: onlineSess.code,
          bodies: bodiesRef.current,
          turn: turnRef.current,
          queenState: qState,
          status: winText,
          winner: winnerTeam,
          playerCount: playerCountRef.current,
        });
      }
      return;
    }

    const totalPlayers = playerCountRef.current;
    const nextPlayer = (keepTurn ? currentPlayer : ((currentPlayer % totalPlayers) + 1)) as 1 | 2 | 3 | 4;
    turnRef.current = nextPlayer;
    placeStrikerForTurn(nextPlayer);

    const fullStatus = `${msg} Giliran ${getPlayerLabel(nextPlayer)}.`;
    syncHud(fullStatus);
    drawBoard();

    if (modeRef.current === 'online' && onlineSess) {
      getSocket().emit('carrom:sync', {
        code: onlineSess.code,
        bodies: bodiesRef.current,
        turn: nextPlayer,
        queenState: qState,
        status: fullStatus,
        winner: null,
        playerCount: playerCountRef.current,
      });
    }
  }, [addChips, drawBoard, getPlayerLabel, placeStrikerForTurn, recordGame, returnCoinToCenter, sfx, syncHud]);

  const startSimulationLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const STEP_MS = 1000 / 60;
    let lastTime = performance.now();
    let accumulator = 0;

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      accumulator += dt;

      let moving = movingRef.current;
      let stepsRun = 0;

      while (accumulator >= STEP_MS && stepsRun < 4) {
        const result = stepPhysics(bodiesRef.current, CARROM_BOUNDS, CARROM_POCKETS, {
          friction: 0.99,
          linearFriction: 0.026,
          wallRestitution: 0.85,
          substeps: 10,
          minSpeed: 0.03,
        });

        if (result.hitPairs.length > 0) sfx('wood');
        if (result.maxWallImpact > 0.14) sfx('cushion');
        if (result.impactPoints.length > 0) {
          for (const im of result.impactPoints) {
            impactsRef.current.push({ ...im, start: now, seed: Math.random() });
          }
          if (result.maxBallImpact > 0.55) {
            shakeRef.current = { intensity: Math.min(2.8, result.maxBallImpact * 2.8), start: now };
          }
        }
        if (result.newlyPocketed.length > 0) {
          pocketedThisTurnRef.current.push(...result.newlyPocketed);
          for (const ev of result.pocketedInto) {
            const cornerShiftX = ev.pocket.x < CARROM_SIZE / 2 ? -9 : 9;
            const cornerShiftY = ev.pocket.y < CARROM_SIZE / 2 ? -9 : 9;
            sinkingRef.current.push({
              x: ev.entryX,
              y: ev.entryY,
              toX: ev.pocket.x + cornerShiftX,
              toY: ev.pocket.y + cornerShiftY,
              radius: ev.body.radius,
              color: ev.body.color,
              start: now,
            });
            pocketPulsesRef.current.push({
              x: ev.pocket.x,
              y: ev.pocket.y,
              radius: ev.pocket.radius,
              start: now,
              color: ev.body.kind === 'queen' ? '#fb7185' : '#fbbf24',
            });
          }
          sfx('pocket');
        }

        const striker = bodiesRef.current.find((b) => b.kind === 'striker');
        if (striker && !striker.pocketed && Math.hypot(striker.vx, striker.vy) > 2.8) {
          trailRef.current.push({ x: striker.x, y: striker.y });
          if (trailRef.current.length > 6) trailRef.current.shift();
        } else if (trailRef.current.length > 0) {
          trailRef.current.shift();
        }

        moving = result.moving;
        accumulator -= STEP_MS;
        stepsRun++;
        if (!moving) break;
      }

      const alpha = moving ? accumulator / STEP_MS : 1;
      drawBoard(alpha);

      if (
        moving ||
        sinkingRef.current.length > 0 ||
        impactsRef.current.length > 0 ||
        pocketPulsesRef.current.length > 0 ||
        shakeRef.current !== null ||
        trailRef.current.length > 0
      ) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        movingRef.current = false;
        finishTurn();
      }
    };

    movingRef.current = true;
    syncHud();
    rafRef.current = requestAnimationFrame(tick);
  }, [drawBoard, finishTurn, sfx, syncHud]);

  const resetGame = useCallback(
    (nextMode?: 'ai' | 'online', nextCount?: 2 | 4) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
      const targetMode = nextMode ?? modeRef.current;
      const targetCount = nextCount ?? playerCountRef.current;

      if (targetMode === 'online' && onlineSessionRef.current && !nextMode) {
        getSocket().emit('carrom:rematch', { code: onlineSessionRef.current.code, playerCount: targetCount });
        return;
      }
      if (nextMode) {
        modeRef.current = nextMode;
        setMode(nextMode);
        if (nextMode !== 'online' && onlineSessionRef.current) {
          leaveOnlineRoom();
          setOnlineSession(null);
        }
      }
      playerCountRef.current = targetCount;

      rewardRef.current = false;
      winnerRef.current = null;
      bodiesRef.current = createCarromBodies();
      turnRef.current = 1;
      movingRef.current = false;
      queenStateRef.current = 'board';
      pocketedThisTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      pocketPulsesRef.current = [];
      shakeRef.current = null;
      trailRef.current = [];
      aiAnimRef.current = null;
      dragRef.current = { mode: 'none', startX: 0, startY: 0, x: 0, y: 0 };
      placeStrikerForTurn(1);
      syncHud(
        targetCount === 4
          ? 'Mode 4P (2v2) siap! Giliran Pemain 1 (Putih).'
          : 'Geser bidak kuning di garis hijau, lalu tarik mundur untuk menembak!',
        null
      );
      drawBoard();
    },
    [drawBoard, placeStrikerForTurn, syncHud]
  );

  // Online socket listeners
  useEffect(() => {
    if (mode !== 'online' || !onlineSession) return;
    const socket = getSocket();

    const onRoomUpdate = (payload: { room: MultiplayerRoomInfo }) => {
      setOnlineSession((prev) => (prev ? { ...prev, room: payload.room } : prev));
      if (payload.room.players.length > 2 && playerCountRef.current !== 4) {
        playerCountRef.current = 4;
        drawBoard();
      }
    };

    const onStriker = ({ x, y }: { x: number; y?: number }) => {
      if (movingRef.current) return;
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.x = x;
      if (typeof y === 'number') striker.y = y;
      striker.prevX = striker.x;
      striker.prevY = striker.y;
      syncHud();
      drawBoard();
    };

    const onShoot = ({ strikerX, strikerY, vx, vy }: { strikerX: number; strikerY?: number; vx: number; vy: number }) => {
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.pocketed = false;
      striker.x = strikerX;
      if (typeof strikerY === 'number') striker.y = strikerY;
      striker.prevX = striker.x;
      striker.prevY = striker.y;
      striker.vx = vx;
      striker.vy = vy;
      sfx('wood');
      startSimulationLoop();
    };

    const onSync = (payload: {
      bodies: PhysicsBody[];
      turn: 1 | 2 | 3 | 4;
      queenState: CarromHud['queenState'];
      status: string;
      winner: 1 | 2 | null;
      playerCount?: 2 | 4;
    }) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      movingRef.current = false;
      if (payload.playerCount) {
        playerCountRef.current = payload.playerCount;
      }
      bodiesRef.current = payload.bodies;
      turnRef.current = payload.turn;
      queenStateRef.current = payload.queenState;
      if (payload.winner !== null && !rewardRef.current) {
        rewardRef.current = true;
        const myTeam = getCarromTeam(onlineSession.seatIdx + 1);
        const won = payload.winner === myTeam;
        recordGame('carrom', won);
        if (won) {
          addChips(500);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else {
          sfx('lose');
        }
      }
      syncHud(payload.status, payload.winner);
      drawBoard();
    };

    const onRematch = (payload?: { playerCount?: 2 | 4 }) => {
      rewardRef.current = false;
      winnerRef.current = null;
      if (payload?.playerCount) {
        playerCountRef.current = payload.playerCount;
      }
      bodiesRef.current = createCarromBodies();
      turnRef.current = 1;
      movingRef.current = false;
      queenStateRef.current = 'board';
      pocketedThisTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      pocketPulsesRef.current = [];
      shakeRef.current = null;
      trailRef.current = [];
      dragRef.current = { mode: 'none', startX: 0, startY: 0, x: 0, y: 0 };
      placeStrikerForTurn(1);
      syncHud('Pertandingan baru dimulai! Giliran Pemain 1 (Putih).', null);
      drawBoard();
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('carrom:striker', onStriker);
    socket.on('carrom:shoot', onShoot);
    socket.on('carrom:sync', onSync);
    socket.on('carrom:rematch', onRematch);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('carrom:striker', onStriker);
      socket.off('carrom:shoot', onShoot);
      socket.off('carrom:sync', onSync);
      socket.off('carrom:rematch', onRematch);
    };
  }, [addChips, drawBoard, mode, onlineSession?.code, placeStrikerForTurn, recordGame, sfx, startSimulationLoop, syncHud]);

  useEffect(() => {
    const loadTex = (src: string, key: 'lightWood' | 'darkWood') => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        patternsRef.current[key] = ctx.createPattern(img, 'repeat');
        drawBoard();
      };
      img.src = src;
    };
    loadTex('/assets/textures/plywood.jpg', 'lightWood');
    loadTex('/assets/textures/dark_wood.jpg', 'darkWood');

    drawBoard();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    };
  }, [drawBoard]);

  // AI Turn Loop (supports 1 AI 1v1 or 3 AI 2v2 across all 4 baselines)
  useEffect(() => {
    if (mode !== 'ai' || hud.winner !== null || hud.isMoving || hud.turn === 1) return;

    let animRaf = 0;
    const activeTurn = hud.turn;
    const count = playerCountRef.current;
    const targetKind: 'white' | 'black' = getCarromTeam(activeTurn) === 1 ? 'white' : 'black';
    const side = getCarromSide(activeTurn, count);

    aiTimerRef.current = window.setTimeout(() => {
      const shot = computeCarromAiShot(bodiesRef.current, targetKind, side);
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.pocketed = false;

      const animStart = performance.now();
      const fromX = striker.x;
      const fromY = striker.y;
      aiAnimRef.current = {
        active: true,
        start: animStart,
        fromX,
        fromY,
        toX: shot.strikerX,
        toY: shot.strikerY,
        vx: shot.vx,
        vy: shot.vy,
      };

      const stepAiAnim = (now: number) => {
        const elapsed = now - animStart;
        if (elapsed < 320) {
          const t = elapsed / 320;
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          striker.x = fromX + (shot.strikerX - fromX) * ease;
          striker.y = fromY + (shot.strikerY - fromY) * ease;
          striker.prevX = striker.x;
          striker.prevY = striker.y;
        } else {
          striker.x = shot.strikerX;
          striker.y = shot.strikerY;
          striker.prevX = striker.x;
          striker.prevY = striker.y;
        }

        drawBoard(1);

        if (elapsed < 620) {
          animRaf = requestAnimationFrame(stepAiAnim);
        } else {
          aiAnimRef.current = null;
          striker.vx = shot.vx;
          striker.vy = shot.vy;
          sfx('wood');
          startSimulationLoop();
        }
      };

      animRaf = requestAnimationFrame(stepAiAnim);
    }, 520);

    return () => {
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
      if (animRaf) cancelAnimationFrame(animRaf);
      aiAnimRef.current = null;
    };
  }, [mode, hud.winner, hud.isMoving, hud.turn, drawBoard, sfx, startSimulationLoop]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * CARROM_SIZE;
    const sy = ((e.clientY - rect.top) / rect.height) * CARROM_SIZE;
    const viewAngle = getViewAngle();
    if (viewAngle === 0) return { x: sx, y: sy };

    const half = CARROM_SIZE / 2;
    const dx = sx - half;
    const dy = sy - half;
    const cos = Math.cos(-viewAngle);
    const sin = Math.sin(-viewAngle);
    return {
      x: half + dx * cos - dy * sin,
      y: half + dx * sin + dy * cos,
    };
  };

  const canHumanInteract =
    !hud.isMoving &&
    hud.winner === null &&
    ((mode === 'ai' && hud.turn === 1) ||
      (mode === 'online' &&
        Boolean(onlineSession && onlineSession.room.players.length >= 2) &&
        hud.turn === (onlineSession?.seatIdx ?? 0) + 1));

  const moveStrikerToT = (nextT: number, forceEmit = false) => {
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker || striker.pocketed) return;
    const side = getCarromSide(turnRef.current, playerCountRef.current);
    const pt = getBaselinePoint(side, nextT);
    if (isStrikerPositionValid(bodiesRef.current, pt.x, pt.y)) {
      striker.x = pt.x;
      striker.y = pt.y;
    } else {
      const valid = findValidStrikerOnSide(bodiesRef.current, side, nextT);
      striker.x = valid.x;
      striker.y = valid.y;
    }
    striker.prevX = striker.x;
    striker.prevY = striker.y;
    if (modeRef.current === 'online' && onlineSessionRef.current) {
      const now = performance.now();
      if (forceEmit || now - lastStrikerEmitRef.current >= 45) {
        lastStrikerEmitRef.current = now;
        getSocket().emit('carrom:striker', {
          code: onlineSessionRef.current.code,
          x: striker.x,
          y: striker.y,
        });
      }
    }
    drawBoard();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canHumanInteract) return;
    const pt = getCanvasPoint(e);
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker || striker.pocketed) return;

    const side = getCarromSide(turnRef.current, playerCountRef.current);
    const bm = getBaselineMetrics(pt, side);
    const distToStriker = Math.hypot(pt.x - striker.x, pt.y - striker.y);

    e.currentTarget.setPointerCapture(e.pointerId);
    if (distToStriker <= STRIKER_RADIUS + 14) {
      dragRef.current = { mode: 'pending', startX: pt.x, startY: pt.y, x: pt.x, y: pt.y };
      setCanvasCursor('grabbing');
    } else if (bm.perpDist <= 26 && bm.withinSpan) {
      dragRef.current = { mode: 'slide', startX: pt.x, startY: pt.y, x: pt.x, y: pt.y };
      setCanvasCursor('grabbing');
      moveStrikerToT(bm.t, true);
      return;
    } else {
      dragRef.current = { mode: 'aim', startX: pt.x, startY: pt.y, x: pt.x, y: pt.y };
      setCanvasCursor('crosshair');
    }
    drawBoard();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    const side = getCarromSide(turnRef.current, playerCountRef.current);

    if (dragRef.current.mode === 'none') {
      if (!canHumanInteract) {
        if (canvasCursor !== 'crosshair') setCanvasCursor('crosshair');
        return;
      }
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      const bm = getBaselineMetrics(pt, side);
      const nearStriker = Boolean(striker && !striker.pocketed && Math.hypot(pt.x - striker.x, pt.y - striker.y) <= STRIKER_RADIUS + 14);
      const nearBaseline = bm.perpDist <= 22 && bm.withinSpan;
      const nextCursor = nearStriker || nearBaseline ? 'grab' : 'crosshair';
      if (canvasCursor !== nextCursor) setCanvasCursor(nextCursor);
      return;
    }

    dragRef.current.x = pt.x;
    dragRef.current.y = pt.y;

    if (dragRef.current.mode === 'pending') {
      const dx = Math.abs(pt.x - dragRef.current.startX);
      const dy = Math.abs(pt.y - dragRef.current.startY);
      const isVertical = side === 'left' || side === 'right';
      const alongDelta = isVertical ? dy : dx;
      const perpDelta = isVertical ? dx : dy;
      if (Math.hypot(dx, dy) >= 7) {
        const bm = getBaselineMetrics(pt, side);
        if (alongDelta >= perpDelta * 1.15 && bm.perpDist <= 36) {
          dragRef.current.mode = 'slide';
          moveStrikerToT(bm.t);
        } else {
          dragRef.current.mode = 'aim';
          setCanvasCursor('crosshair');
          drawBoard();
        }
      }
      return;
    }

    if (dragRef.current.mode === 'slide') {
      moveStrikerToT(getBaselineMetrics(pt, side).t);
      return;
    }

    drawBoard();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.mode === 'none') return;
    const prevMode = dragRef.current.mode;
    const endX = dragRef.current.x;
    const endY = dragRef.current.y;
    dragRef.current = { mode: 'none', startX: 0, startY: 0, x: 0, y: 0 };
    setCanvasCursor('crosshair');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker || !canHumanInteract) {
      drawBoard();
      return;
    }

    if (prevMode === 'slide') {
      if (modeRef.current === 'online' && onlineSessionRef.current) {
        getSocket().emit('carrom:striker', {
          code: onlineSessionRef.current.code,
          x: striker.x,
          y: striker.y,
        });
      }
      drawBoard();
      return;
    }

    if (prevMode === 'pending') {
      drawBoard();
      return;
    }

    const dx = striker.x - endX;
    const dy = striker.y - endY;
    const pull = Math.hypot(dx, dy);

    if (pull > 14) {
      const power = Math.min(pull, 140) * 0.165;
      const vx = (dx / pull) * power;
      const vy = (dy / pull) * power;
      if (modeRef.current === 'online' && onlineSessionRef.current) {
        getSocket().emit('carrom:shoot', {
          code: onlineSessionRef.current.code,
          strikerX: striker.x,
          strikerY: striker.y,
          vx,
          vy,
        });
      } else {
        striker.prevX = striker.x;
        striker.prevY = striker.y;
        striker.vx = vx;
        striker.vy = vy;
        impactsRef.current.push({
          x: striker.x,
          y: striker.y,
          nx: dx / pull,
          ny: dy / pull,
          intensity: Math.min(0.85, (Math.min(pull, 140) / 140) * 0.85),
          kind: 'ball',
          start: performance.now(),
          seed: Math.random(),
        });
        sfx('wood');
        startSimulationLoop();
      }
    } else {
      drawBoard();
    }
  };

  return (
    <GameShell
      title="Karambol Pro"
      subtitle="Papan statis klasik — Mabar Online 2–4P atau vs 1–3 AI"
      onBack={() => {
        leaveOnlineRoom();
        onBack();
      }}
      onRestart={() => resetGame()}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                sfx('click');
                modeRef.current = 'online';
                setMode('online');
                setRoomModalOpen(true);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'online' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Online
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                resetGame('ai', aiCount === 3 ? 4 : 2);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> vs AI
            </button>
          </div>

          {mode === 'ai' && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs">
              <span className="text-slate-400 font-semibold pr-1">Musuh AI:</span>
              {([1, 3] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setAiCount(cnt);
                    resetGame('ai', cnt === 3 ? 4 : 2);
                  }}
                  className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                    aiCount === cnt ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {cnt === 1 ? '1 AI (1v1)' : '3 AI (4P 2v2)'}
                </button>
              ))}
            </div>
          )}

          {mode === 'online' && (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              {onlineSession ? `Room: ${onlineSession.code} (${onlineSession.room.players.length}/4)` : 'Buat / Gabung Room'}
            </button>
          )}
        </div>
      }
      rules={[
        'Papan Karambol tetap statis (tidak berputar setiap giliran). Pada mode 4 Pemain (2v2): P1 (Bawah) & P3 (Atas) = Tim Putih, sedangkan P2 (Kanan) & P4 (Kiri) = Tim Hitam.',
        'Garis yang menyala hijau menunjukkan sisi pemain yang sedang mendapat giliran menembak.',
        'Geser bidak kuning (Striker) langsung di sepanjang garis hijau (atau tap garis hijau) untuk atur posisi, lalu tarik mundur di papan seperti ketapel untuk menembak!',
        'Memasukkan koin tim memberi giliran lanjut. Ratu Merah (+3 poin) harus di-cover dengan memasukkan koin tim.',
        'Menang vs AI atau Online memberikan +500 Chip.',
      ]}
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,480px)_minmax(240px,300px)] lg:grid-cols-[minmax(0,560px)_300px] gap-4 lg:gap-6 items-start justify-center">
        <div className="mx-auto w-full max-w-[560px] md:max-w-[min(100%,560px,calc(100dvh-205px))] space-y-2.5 sm:space-y-3">
          <div className="rounded-2xl overflow-hidden border-2 border-amber-900/60 shadow-2xl bg-amber-950/40">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => {
                if (dragRef.current.mode === 'none') setCanvasCursor('crosshair');
              }}
              className={`w-full aspect-square block touch-none ${
                canvasCursor === 'grabbing'
                  ? 'cursor-grabbing'
                  : canvasCursor === 'grab'
                    ? 'cursor-grab'
                    : 'cursor-crosshair'
              }`}
            />
          </div>

          <p className="rounded-xl border border-slate-800/80 bg-slate-900/70 px-3.5 py-2 text-center text-xs text-slate-300">
            <span className="font-semibold text-amber-300">Geser bidak kuning</span> di garis hijau untuk atur posisi •{' '}
            <span className="font-semibold text-emerald-300">Tarik mundur</span> untuk menembak
          </p>
        </div>

        {/* Scoreboard & Status */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-4">
          <div className="space-y-2.5">
            <div
              className={`rounded-xl border p-3 flex items-center justify-between ${
                getCarromTeam(hud.turn) === 1 ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-400 inline-block" />
                <div>
                  <p className="text-sm font-bold text-white">
                    {hud.playerCount === 4 ? 'Tim Putih (P1 & P3)' : getPlayerLabel(1)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Sisa: {hud.whiteLeft} koin{hud.playerCount === 4 && (hud.turn === 1 || hud.turn === 3) ? ` • Giliran P${hud.turn}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-lg font-extrabold font-mono-num text-white">{hud.score1}</span>
            </div>

            <div
              className={`rounded-xl border p-3 flex items-center justify-between ${
                getCarromTeam(hud.turn) === 2 ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-400 inline-block" />
                <div>
                  <p className="text-sm font-bold text-white">
                    {hud.playerCount === 4 ? 'Tim Hitam (P2 & P4)' : getPlayerLabel(2)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Sisa: {hud.blackLeft} koin{hud.playerCount === 4 && (hud.turn === 2 || hud.turn === 4) ? ` • Giliran P${hud.turn}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-lg font-extrabold font-mono-num text-white">{hud.score2}</span>
            </div>
          </div>

          {hud.playerCount === 4 && (
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              {([1, 2, 3, 4] as const).map((seat) => {
                const active = hud.turn === seat && hud.winner === null;
                return (
                  <div
                    key={seat}
                    className={`rounded-lg border px-2 py-1.5 truncate ${
                      active ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200 font-bold' : 'border-slate-800 bg-slate-950/50 text-slate-400'
                    }`}
                  >
                    P{seat}: {getPlayerLabel(seat).replace(/\s*\((Putih|Hitam)\)/, '')}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</p>
            <p className="text-sm text-slate-200 leading-relaxed">{hud.status}</p>
            <p className="text-xs text-rose-300 pt-1">
              Ratu Merah:{' '}
              {hud.queenState === 'board'
                ? 'Di papan'
                : hud.queenState.startsWith('pending')
                  ? 'Perlu di-cover!'
                  : 'Sudah diklaim (+3)'}
            </p>
          </div>

          {hud.winner !== null && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-center space-y-3">
              <Trophy className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="font-bold text-white">{hud.status}</p>
              <button
                type="button"
                onClick={() => resetGame()}
                className="w-full rounded-xl bg-indigo-600 py-2 text-sm font-bold text-white hover:bg-indigo-500 cursor-pointer"
              >
                Main Lagi
              </button>
            </div>
          )}
        </div>
      </div>
      <OnlineRoomModal
        open={roomModalOpen}
        gameId="carrom"
        gameTitle="Karambol Pro (2–4P)"
        initialJoinCode={initialRoomCode}
        activeSession={onlineSession}
        onConnected={(session) => {
          setOnlineSession(session);
          onlineSessionRef.current = session;
          const cnt = session.room.players.length > 2 ? 4 : 2;
          resetGame('online', cnt);
        }}
        onClose={() => setRoomModalOpen(false)}
      />
      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
