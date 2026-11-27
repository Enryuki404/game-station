import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Globe, Trophy, Users } from 'lucide-react';
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
import { stepPhysics, type PhysicsBody } from '../../engine/physics2d';
import {
  BASELINE_BOTTOM_Y,
  BASELINE_MAX_X,
  BASELINE_MIN_X,
  BASELINE_TOP_Y,
  CARROM_BORDER,
  CARROM_BOUNDS,
  CARROM_POCKETS,
  CARROM_SIZE,
  COIN_RADIUS,
  computeCarromAiShot,
  createCarromBodies,
  findValidStrikerX,
  isStrikerPositionValid,
} from './carromEngine';

interface CarromGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
}

interface CarromHud {
  turn: 1 | 2;
  whiteLeft: number;
  blackLeft: number;
  queenState: 'board' | 'pending_1' | 'pending_2' | 'claimed_1' | 'claimed_2';
  score1: number;
  score2: number;
  status: string;
  winner: 1 | 2 | null;
  strikerX: number;
  isMoving: boolean;
}

export const CarromGame: React.FC<CarromGameProps> = ({ onBack, initialRoomCode }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<PhysicsBody[]>(createCarromBodies());
  const modeRef = useRef<'ai' | 'local' | 'online'>(initialRoomCode ? 'online' : 'ai');
  const [mode, setMode] = useState<'ai' | 'local' | 'online'>(initialRoomCode ? 'online' : 'ai');
  const autoFlipRef = useRef(true);
  const [autoFlip, setAutoFlip] = useState(true);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const onlineSessionRef = useRef<OnlineSession | null>(null);
  onlineSessionRef.current = onlineSession;
  const [roomModalOpen, setRoomModalOpen] = useState(Boolean(initialRoomCode));

  const turnRef = useRef<1 | 2>(1);
  const isFlippedView = () => {
    if (modeRef.current === 'online') return (onlineSessionRef.current?.seatIdx ?? 0) === 1;
    return modeRef.current === 'local' && autoFlipRef.current && turnRef.current === 2;
  };
  const movingRef = useRef(false);
  const queenStateRef = useRef<'board' | 'pending_1' | 'pending_2' | 'claimed_1' | 'claimed_2'>('board');
  const pocketedThisTurnRef = useRef<PhysicsBody[]>([]);
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const sinkingRef = useRef<Array<{ x: number; y: number; toX: number; toY: number; radius: number; color: string; start: number }>>([]);
  const impactsRef = useRef<Array<{ x: number; y: number; intensity: number; start: number }>>([]);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const aiAnimRef = useRef<{
    active: boolean;
    start: number;
    fromX: number;
    toX: number;
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

  const [hud, setHud] = useState<CarromHud>({
    turn: 1,
    whiteLeft: 9,
    blackLeft: 9,
    queenState: 'board',
    score1: 0,
    score2: 0,
    status: 'Geser striker lalu tarik ke belakang untuk menembak!',
    winner: null,
    strikerX: CARROM_SIZE / 2,
    isMoving: false,
  });

  const syncHud = useCallback((statusOverride?: string, winnerOverride?: 1 | 2 | null) => {
    const bodies = bodiesRef.current;
    const whiteLeft = bodies.filter((b) => b.kind === 'white' && !b.pocketed).length;
    const blackLeft = bodies.filter((b) => b.kind === 'black' && !b.pocketed).length;
    const striker = bodies.find((b) => b.kind === 'striker');
    const qState = queenStateRef.current;

    const score1 = 9 - whiteLeft + (qState === 'claimed_1' ? 3 : 0);
    const score2 = 9 - blackLeft + (qState === 'claimed_2' ? 3 : 0);

    setHud((prev) => ({
      turn: turnRef.current,
      whiteLeft,
      blackLeft,
      queenState: qState,
      score1,
      score2,
      status: statusOverride ?? prev.status,
      winner: winnerOverride !== undefined ? winnerOverride : prev.winner,
      strikerX: striker ? striker.x : CARROM_SIZE / 2,
      isMoving: movingRef.current,
    }));
  }, []);

  const placeStrikerForTurn = useCallback((player: 1 | 2) => {
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker) return;
    const y = player === 1 ? BASELINE_BOTTOM_Y : BASELINE_TOP_Y;
    striker.pocketed = false;
    striker.vx = 0;
    striker.vy = 0;
    striker.y = y;
    striker.x = findValidStrikerX(bodiesRef.current, CARROM_SIZE / 2, y);
    striker.prevX = striker.x;
    striker.prevY = striker.y;
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
    const viewFlipped = isFlippedView();
    ctx.save();
    if (viewFlipped) {
      ctx.translate(CARROM_SIZE, CARROM_SIZE);
      ctx.rotate(Math.PI);
    }

    // Outer wooden border with dark rosewood texture
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

    // Playing surface with light birch plywood texture
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

    // Baselines
    const drawBaseline = (y: number) => {
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

    drawBaseline(BASELINE_BOTTOM_Y);
    drawBaseline(BASELINE_TOP_Y);

    // Center circle & compass lotus star
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

    // 8-point compass star
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
    const arrowOffsets = [
      [120, 120, 225, 225],
      [520, 120, 415, 225],
      [120, 520, 225, 415],
      [520, 520, 415, 415],
    ];
    for (const [x1, y1, x2, y2] of arrowOffsets) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Pockets
    for (const p of CARROM_POCKETS) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Sinking coin animations pulling smoothly into pocket center
    const now = performance.now();
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

    // Impact ripple rings on coin clashes
    impactsRef.current = impactsRef.current.filter((im) => now - im.start < 190);
    for (const im of impactsRef.current) {
      const t = (now - im.start) / 190;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.45 * im.intensity;
      ctx.strokeStyle = '#fffbeb';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 4 + t * 18 * im.intensity, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Striker high-speed motion trail
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

    // Coins & Striker (sub-frame interpolated)
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

      // Inner decorative ring
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

    // Smooth AI pull-back guide or human drag aiming guide
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
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
    } else if (dragRef.current.active && striker && !striker.pocketed && !movingRef.current) {
      const dx = striker.x - dragRef.current.x;
      const dy = striker.y - dragRef.current.y;
      const pull = Math.hypot(dx, dy);
      if (pull > 12) {
        const clampedPull = Math.min(pull, 140);
        const ux = dx / pull;
        const uy = dy / pull;

        // Pull-back tension line
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x - ux * clampedPull, striker.y - uy * clampedPull);
        ctx.stroke();

        // Dotted forward aim path
        ctx.save();
        ctx.setLineDash([7, 7]);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(striker.x + ux * (110 + clampedPull * 1.4), striker.y + uy * (110 + clampedPull * 1.4));
        ctx.stroke();
        ctx.restore();

        // Power percentage badge (counter-rotated when board is rotated 180° for P2)
        const pct = Math.round((clampedPull / 140) * 100);
        ctx.save();
        if (viewFlipped) {
          ctx.translate(striker.x, striker.y - 31);
          ctx.rotate(Math.PI);
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
  }, []);

  const finishTurn = useCallback(() => {
    const onlineSess = onlineSessionRef.current;
    if (modeRef.current === 'online' && onlineSess && turnRef.current !== onlineSess.seatIdx + 1) {
      return;
    }

    const pocketed = pocketedThisTurnRef.current;
    pocketedThisTurnRef.current = [];
    const currentPlayer = turnRef.current;
    const ownKind: 'white' | 'black' = currentPlayer === 1 ? 'white' : 'black';

    const strikerFoul = pocketed.some((b) => b.kind === 'striker');
    const pocketedOwn = pocketed.some((b) => b.kind === ownKind);
    const pocketedQueen = pocketed.some((b) => b.kind === 'queen');

    let qState = queenStateRef.current;
    let keepTurn = false;
    let msg = '';

    if (strikerFoul) {
      sfx('foul');
      returnCoinToCenter(ownKind);
      if (qState === `pending_${currentPlayer}`) {
        returnCoinToCenter('queen');
        qState = 'board';
      }
      msg = `Foul! Striker masuk lubang — 1 koin dikembalikan.`;
      keepTurn = false;
    } else {
      if (pocketedQueen) {
        if (pocketedOwn) {
          qState = `claimed_${currentPlayer}`;
          msg = 'Mantap! Ratu Merah langsung ter-cover (+3 poin)!';
          keepTurn = true;
        } else {
          qState = `pending_${currentPlayer}`;
          msg = 'Ratu Merah masuk! Masukkan koinmu sendiri sekarang untuk meng-cover.';
          keepTurn = true;
        }
      } else if (qState === `pending_${currentPlayer}`) {
        if (pocketedOwn) {
          qState = `claimed_${currentPlayer}`;
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
    }

    queenStateRef.current = qState;

    const whiteLeft = bodiesRef.current.filter((b) => b.kind === 'white' && !b.pocketed).length;
    const blackLeft = bodiesRef.current.filter((b) => b.kind === 'black' && !b.pocketed).length;

    if (whiteLeft === 0 || blackLeft === 0) {
      if (qState === 'pending_1') returnCoinToCenter('queen');
      if (qState === 'pending_2') returnCoinToCenter('queen');
      const winner: 1 | 2 = whiteLeft === 0 ? 1 : 2;
      if (!rewardRef.current) {
        rewardRef.current = true;
        const humanWon =
          modeRef.current === 'local' ||
          (modeRef.current === 'online'
            ? winner === (onlineSess?.seatIdx ?? 0) + 1
            : winner === 1);
        recordGame('carrom', humanWon);
        if ((modeRef.current === 'ai' || modeRef.current === 'online') && humanWon) {
          addChips(500);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else if (modeRef.current === 'ai' || modeRef.current === 'online') {
          sfx('lose');
        } else {
          setConfettiKey((k) => k + 1);
          sfx('win');
        }
      }
      const p1Name = onlineSess?.room.players[0]?.name ?? 'Putih';
      const p2Name = onlineSess?.room.players[1]?.name ?? 'Hitam';
      const winText =
        modeRef.current === 'online'
          ? `${winner === 1 ? p1Name : p2Name} menang Karambol!`
          : winner === 1
            ? 'Putih menang Karambol!'
            : modeRef.current === 'ai'
              ? 'Bot Hitam menang Karambol!'
              : 'Hitam menang Karambol!';
      syncHud(winText, winner);
      drawBoard();
      if (modeRef.current === 'online' && onlineSess) {
        getSocket().emit('carrom:sync', {
          code: onlineSess.code,
          bodies: bodiesRef.current,
          turn: turnRef.current,
          queenState: qState,
          status: winText,
          winner,
        });
      }
      return;
    }

    const nextPlayer: 1 | 2 = keepTurn ? currentPlayer : currentPlayer === 1 ? 2 : 1;
    turnRef.current = nextPlayer;
    placeStrikerForTurn(nextPlayer);

    const p1Name = onlineSess?.room.players[0]?.name ?? 'Pemain 1';
    const p2Name = onlineSess?.room.players[1]?.name ?? 'Pemain 2';
    const turnLabel =
      modeRef.current === 'online'
        ? `Giliran ${nextPlayer === 1 ? p1Name : p2Name}`
        : nextPlayer === 1
          ? 'Giliran Putih (Kamu)'
          : modeRef.current === 'ai'
            ? 'Giliran Bot Hitam...'
            : 'Giliran Hitam (P2)';
    const fullStatus = `${msg} ${turnLabel}`;
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
      });
    }
  }, [addChips, drawBoard, placeStrikerForTurn, recordGame, returnCoinToCenter, sfx, syncHud]);

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
          substeps: 8,
          minSpeed: 0.03,
        });

        if (result.hitPairs.length > 0) sfx('wood');
        if (result.impactPoints.length > 0) {
          for (const im of result.impactPoints) {
            impactsRef.current.push({ ...im, start: now });
          }
        }
        if (result.newlyPocketed.length > 0) {
          pocketedThisTurnRef.current.push(...result.newlyPocketed);
          for (const ev of result.pocketedInto) {
            sinkingRef.current.push({
              x: ev.entryX,
              y: ev.entryY,
              toX: ev.pocket.x,
              toY: ev.pocket.y,
              radius: ev.body.radius,
              color: ev.body.color,
              start: now,
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

      if (moving || sinkingRef.current.length > 0 || impactsRef.current.length > 0 || trailRef.current.length > 0) {
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
    (nextMode?: 'ai' | 'local' | 'online') => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
      const targetMode = nextMode ?? modeRef.current;
      if (targetMode === 'online' && onlineSessionRef.current && !nextMode) {
        getSocket().emit('carrom:rematch', { code: onlineSessionRef.current.code });
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
      rewardRef.current = false;
      bodiesRef.current = createCarromBodies();
      turnRef.current = 1;
      movingRef.current = false;
      queenStateRef.current = 'board';
      pocketedThisTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      trailRef.current = [];
      aiAnimRef.current = null;
      dragRef.current = { active: false, x: 0, y: 0 };
      placeStrikerForTurn(1);
      syncHud('Geser striker lalu tarik ke belakang untuk menembak!', null);
      drawBoard();
    },
    [drawBoard, placeStrikerForTurn, syncHud]
  );

  // Online socket listeners for Karambol
  useEffect(() => {
    if (mode !== 'online' || !onlineSession) return;
    const socket = getSocket();

    const onRoomUpdate = (payload: { room: MultiplayerRoomInfo }) => {
      setOnlineSession((prev) => (prev ? { ...prev, room: payload.room } : prev));
    };

    const onStriker = ({ x }: { x: number }) => {
      if (movingRef.current) return;
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.x = x;
      striker.prevX = x;
      syncHud();
      drawBoard();
    };

    const onShoot = ({ strikerX, vx, vy }: { strikerX: number; vx: number; vy: number }) => {
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.pocketed = false;
      striker.x = strikerX;
      striker.prevX = strikerX;
      striker.prevY = striker.y;
      striker.vx = vx;
      striker.vy = vy;
      sfx('wood');
      startSimulationLoop();
    };

    const onSync = (payload: {
      bodies: PhysicsBody[];
      turn: 1 | 2;
      queenState: CarromHud['queenState'];
      status: string;
      winner: 1 | 2 | null;
    }) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      movingRef.current = false;
      bodiesRef.current = payload.bodies;
      turnRef.current = payload.turn;
      queenStateRef.current = payload.queenState;
      if (payload.winner !== null && !rewardRef.current) {
        rewardRef.current = true;
        const won = payload.winner === onlineSession.seatIdx + 1;
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

    const onRematch = () => {
      rewardRef.current = false;
      bodiesRef.current = createCarromBodies();
      turnRef.current = 1;
      movingRef.current = false;
      queenStateRef.current = 'board';
      pocketedThisTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      trailRef.current = [];
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

  // AI Turn trigger with smooth striker baseline slide + pull-back wind-up
  useEffect(() => {
    if (mode !== 'ai' || hud.winner !== null || hud.isMoving || hud.turn !== 2) return;

    let animRaf = 0;
    aiTimerRef.current = window.setTimeout(() => {
      const shot = computeCarromAiShot(bodiesRef.current, 'black');
      const striker = bodiesRef.current.find((b) => b.kind === 'striker');
      if (!striker) return;
      striker.pocketed = false;
      striker.y = BASELINE_TOP_Y;

      const animStart = performance.now();
      const fromX = striker.x;
      aiAnimRef.current = {
        active: true,
        start: animStart,
        fromX,
        toX: shot.strikerX,
        vx: shot.vx,
        vy: shot.vy,
      };

      const stepAiAnim = (now: number) => {
        const elapsed = now - animStart;
        if (elapsed < 320) {
          const t = elapsed / 320;
          const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          striker.x = fromX + (shot.strikerX - fromX) * ease;
          striker.prevX = striker.x;
          striker.prevY = striker.y;
        } else {
          striker.x = shot.strikerX;
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
    const x = ((e.clientX - rect.left) / rect.width) * CARROM_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * CARROM_SIZE;
    return isFlippedView() ? { x: CARROM_SIZE - x, y: CARROM_SIZE - y } : { x, y };
  };

  const canHumanInteract =
    !hud.isMoving &&
    hud.winner === null &&
    (mode === 'local' ||
      (mode === 'ai' && hud.turn === 1) ||
      (mode === 'online' &&
        Boolean(onlineSession && onlineSession.room.players.length >= 2) &&
        hud.turn === (onlineSession?.seatIdx ?? 0) + 1));

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canHumanInteract) return;
    const pt = getCanvasPoint(e);
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, x: pt.x, y: pt.y };
    drawBoard();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const pt = getCanvasPoint(e);
    dragRef.current.x = pt.x;
    dragRef.current.y = pt.y;
    drawBoard();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }

    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker || !canHumanInteract) {
      drawBoard();
      return;
    }

    const dx = striker.x - dragRef.current.x;
    const dy = striker.y - dragRef.current.y;
    const pull = Math.hypot(dx, dy);

    if (pull > 14) {
      const power = Math.min(pull, 140) * 0.165;
      const vx = (dx / pull) * power;
      const vy = (dy / pull) * power;
      if (modeRef.current === 'online' && onlineSessionRef.current) {
        getSocket().emit('carrom:shoot', {
          code: onlineSessionRef.current.code,
          strikerX: striker.x,
          vx,
          vy,
        });
      } else {
        striker.prevX = striker.x;
        striker.prevY = striker.y;
        striker.vx = vx;
        striker.vy = vy;
        sfx('wood');
        startSimulationLoop();
      }
    } else {
      drawBoard();
    }
  };

  const handleSliderChange = (nextX: number) => {
    if (!canHumanInteract) return;
    const striker = bodiesRef.current.find((b) => b.kind === 'striker');
    if (!striker) return;
    const y = hud.turn === 1 ? BASELINE_BOTTOM_Y : BASELINE_TOP_Y;
    if (isStrikerPositionValid(bodiesRef.current, nextX, y)) {
      striker.x = nextX;
    } else {
      striker.x = findValidStrikerX(bodiesRef.current, nextX, y);
    }
    striker.prevX = striker.x;
    striker.prevY = striker.y;
    if (modeRef.current === 'online' && onlineSessionRef.current) {
      getSocket().emit('carrom:striker', { code: onlineSessionRef.current.code, x: striker.x });
    }
    syncHud();
    drawBoard();
  };

  const isSliderInverted =
    (mode === 'local' && autoFlip && hud.turn === 2) ||
    (mode === 'online' && onlineSession?.seatIdx === 1);

  return (
    <GameShell
      title="Karambol Pro"
      subtitle="Simulasi fisika papan kayu — lawan AI, 2P Lokal, atau Mabar Online"
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
                resetGame('ai');
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> vs AI
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                resetGame('local');
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'local' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> 2P Lokal
            </button>
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
          </div>
          {mode === 'online' && (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              {onlineSession ? `Room: ${onlineSession.code} (${onlineSession.room.players.length}/2)` : 'Buat / Gabung Room'}
            </button>
          )}
          {mode === 'local' && (
            <button
              type="button"
              onClick={() => {
                sfx('click');
                const next = !autoFlip;
                autoFlipRef.current = next;
                setAutoFlip(next);
                drawBoard();
              }}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition ${
                autoFlip
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}
            >
              Auto-Putar: {autoFlip ? 'Aktif' : 'Mati'}
            </button>
          )}
        </div>
      }
      rules={[
        'Pemain 1 (Putih) bermain dari garis bawah; Pemain 2 / Bot (Hitam) dari garis atas.',
        'Gunakan slider di bawah papan untuk menggeser posisi Striker di garis awal.',
        'Klik/sentuh papan lalu tarik mundur (seperti ketapel) untuk membidik dan mengatur kekuatan tembakan, lalu lepaskan!',
        'Memasukkan koin sendiri memberi giliran tambahan. Memasukkan Ratu Merah harus di-cover dengan memasukkan koin sendiri.',
        'Memasukkan Striker adalah Foul: giliran berpindah dan 1 koin milikmu dikembalikan ke tengah.',
        'Menang vs AI memberikan +500 Chip.',
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_300px] gap-6 items-start justify-center">
        <div className="mx-auto w-full max-w-[560px] space-y-3">
          <div className="rounded-2xl overflow-hidden border-2 border-amber-900/60 shadow-2xl bg-amber-950/40">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full aspect-square block touch-none cursor-crosshair"
            />
          </div>

          {/* Striker position slider */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 flex items-center gap-4">
            <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">Posisi Striker</span>
            <input
              type="range"
              aria-label="Posisi Striker"
              min={BASELINE_MIN_X}
              max={BASELINE_MAX_X}
              step={2}
              disabled={!canHumanInteract}
              value={isSliderInverted ? CARROM_SIZE - hud.strikerX : hud.strikerX}
              onChange={(e) => {
                const raw = Number(e.target.value);
                handleSliderChange(isSliderInverted ? CARROM_SIZE - raw : raw);
              }}
              className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
            />
          </div>
        </div>

        {/* Scoreboard & Status */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-4">
          <div className="space-y-2.5">
            <div
              className={`rounded-xl border p-3 flex items-center justify-between ${
                hud.turn === 1 ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-slate-100 border border-slate-400 inline-block" />
                <div>
                  <p className="text-sm font-bold text-white">
                    {mode === 'online'
                      ? `${onlineSession?.room.players[0]?.name ?? 'Menunggu P1'} (Putih)`
                      : mode === 'ai'
                        ? 'Kamu (Putih)'
                        : 'Pemain 1 (Putih)'}
                  </p>
                  <p className="text-xs text-slate-400">Sisa: {hud.whiteLeft} koin</p>
                </div>
              </div>
              <span className="text-lg font-extrabold font-mono-num text-white">{hud.score1}</span>
            </div>

            <div
              className={`rounded-xl border p-3 flex items-center justify-between ${
                hud.turn === 2 ? 'border-amber-400/60 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-400 inline-block" />
                <div>
                  <p className="text-sm font-bold text-white">
                    {mode === 'online'
                      ? `${onlineSession?.room.players[1]?.name ?? 'Menunggu P2'} (Hitam)`
                      : mode === 'ai'
                        ? 'Bot (Hitam)'
                        : 'Pemain 2 (Hitam)'}
                  </p>
                  <p className="text-xs text-slate-400">Sisa: {hud.blackLeft} koin</p>
                </div>
              </div>
              <span className="text-lg font-extrabold font-mono-num text-white">{hud.score2}</span>
            </div>
          </div>

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
        gameTitle="Karambol Pro"
        initialJoinCode={initialRoomCode}
        activeSession={onlineSession}
        onConnected={(session) => {
          setOnlineSession(session);
          onlineSessionRef.current = session;
          resetGame('online');
        }}
        onClose={() => setRoomModalOpen(false)}
      />
      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
