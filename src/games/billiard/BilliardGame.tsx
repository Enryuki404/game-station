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
import { stepPhysics } from '../../engine/physics2d';
import {
  BALL_RADIUS,
  computePoolAiShot,
  createPoolBalls,
  findSafeCueSpot,
  findSafeFootSpot,
  getBallGroup,
  getCutthroatRange,
  getLowestBallNumber,
  isCuePlacementValid,
  POOL_BOUNDS,
  POOL_H,
  POOL_POCKETS,
  POOL_W,
  RAIL,
  raycastAim,
  type BallGroup,
  type BilliardVariant,
  type PoolBall,
} from './billiardEngine';

interface BilliardGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
  initialOnline?: boolean;
}

interface PoolHud {
  variant: BilliardVariant;
  playerCount: number;
  turn: number; // 1..4
  group1: BallGroup | null;
  group2: BallGroup | null;
  scores: number[];
  lowestBall: number | null;
  ballInHand: boolean;
  isMoving: boolean;
  winner: number | null; // player (1..4) or team (1..2 in 4P 8-Ball)
  status: string;
  pocketedNums: number[];
}

const VARIANT_META: Record<BilliardVariant, { label: string; subtitle: string; rules: string[] }> = {
  '8ball': {
    label: '8-Ball',
    subtitle: '8-Ball Classic (1v1 atau 4P 2v2 Tim) — habiskan Solid/Stripe lalu Bola 8',
    rules: [
      'Bola pertama yang masuk menentukan kelompok tim: Solid (1–7) atau Stripe (9–15).',
      'Pada mode 4 Pemain (2v2), P1 & P3 satu tim melawan P2 & P4.',
      'Setelah seluruh bola kelompok habis, masukkan Bola 8 (hitam) untuk menang!',
      'Menang vs AI atau Online memberikan +600 Chip.',
    ],
  },
  '9ball': {
    label: '9-Ball',
    subtitle: '9-Ball Diamond (2–4 Pemain) — pukul bola terkecil, masukkan Bola 9 untuk menang!',
    rules: [
      'Rack berbentuk berlian (1–9). Di setiap giliran, bola putih wajib menyentuh bola angka terkecil di meja terlebih dahulu.',
      'Bola sah masuk membuat giliran lanjut. Memasukkan Bola 9 secara sah langsung menang!',
      'Jika Foul (scratch atau salah sentuh bola pertama), lawan mendapat Ball-in-Hand dan Bola 9 (jika ikut masuk) ditaruh kembali.',
      'Menang vs AI atau Online memberikan +600 Chip.',
    ],
  },
  '15point': {
    label: '15-Point',
    subtitle: '15-Ball Point FFA (2–4 Pemain) — kumpulkan total poin angka bola tertinggi!',
    rules: [
      'Semua 15 bola boleh ditembak. Setiap bola sah yang masuk memberi poin sesuai angkanya (Bola 1 = 1 poin s/d Bola 15 = 15 poin).',
      'Foul (scratch atau tidak mengenai bola) mengurangi 5 poin (minimal 0) dan memberi Ball-in-Hand ke pemain berikutnya.',
      'Saat ke-15 bola habis, pemain dengan skor tertinggi menang!',
    ],
  },
  cutthroat: {
    label: 'Cutthroat 3P',
    subtitle: 'Cutthroat 3 Pemain — lindungi kelompok bolamu sendiri & habiskan bola lawan!',
    rules: [
      'Dimainkan 3 Pemain: P1 memiliki bola 1–5, P2 memiliki 6–10, dan P3 memiliki 11–15.',
      'Bidik dan masukkan bola milik lawan! Pemain yang seluruh bolanya habis akan tersingkir.',
      'Pemain terakhir yang masih memiliki bola di meja adalah pemenangnya!',
    ],
  },
};

export const BilliardGame: React.FC<BilliardGameProps> = ({ onBack, initialRoomCode, initialOnline }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const startInOnline = Boolean(initialRoomCode || initialOnline);
  const variantRef = useRef<BilliardVariant>('8ball');
  const [variant, setVariant] = useState<BilliardVariant>('8ball');

  const modeRef = useRef<'ai' | 'local' | 'online'>(startInOnline ? 'online' : 'ai');
  const [mode, setMode] = useState<'ai' | 'local' | 'online'>(startInOnline ? 'online' : 'ai');

  const [aiCount, setAiCount] = useState<1 | 2 | 3>(1);
  const playerCountRef = useRef<number>(2);
  const [playerCount, setPlayerCount] = useState<number>(2);

  const ballsRef = useRef<PoolBall[]>(createPoolBalls('8ball'));
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const onlineSessionRef = useRef<OnlineSession | null>(null);
  onlineSessionRef.current = onlineSession;
  const [roomModalOpen, setRoomModalOpen] = useState(startInOnline);
  const lastAimEmitRef = useRef(0);

  const turnRef = useRef<number>(1);
  const group1Ref = useRef<BallGroup | null>(null);
  const group2Ref = useRef<BallGroup | null>(null);
  const scoresRef = useRef<number[]>([0, 0, 0, 0]);
  const ballInHandRef = useRef(false);
  const movingRef = useRef(false);
  const pocketedTurnRef = useRef<PoolBall[]>([]);
  const firstHitRef = useRef<string | undefined>(undefined);
  const lowestBeforeShotRef = useRef<number | null>(1);

  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const sinkingRef = useRef<Array<{ x: number; y: number; toX: number; toY: number; radius: number; color: string; start: number }>>([]);
  const impactsRef = useRef<Array<{ x: number; y: number; intensity: number; start: number }>>([]);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const cueLungeRef = useRef<{ active: boolean; ux: number; uy: number; start: number; pull: number } | null>(null);
  const aiWindupRef = useRef<{ active: boolean; ux: number; uy: number; start: number; powerPx: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const rewardRef = useRef(false);
  const patternsRef = useRef<{ darkWood: CanvasPattern | null; felt: CanvasPattern | null }>({
    darkWood: null,
    felt: null,
  });
  const [confettiKey, setConfettiKey] = useState(0);

  const [hud, setHud] = useState<PoolHud>({
    variant: '8ball',
    playerCount: 2,
    turn: 1,
    group1: null,
    group2: null,
    scores: [0, 0, 0, 0],
    lowestBall: 1,
    ballInHand: false,
    isMoving: false,
    winner: null,
    status: 'Tarik dari bola putih ke belakang untuk break!',
    pocketedNums: [],
  });

  const getPlayerLabel = useCallback((pNum: number): string => {
    if (modeRef.current === 'online') {
      return onlineSessionRef.current?.room.players[pNum - 1]?.name ?? `Pemain ${pNum}`;
    }
    if (modeRef.current === 'ai') {
      if (pNum === 1) return 'Kamu';
      if (variantRef.current === '8ball' && playerCountRef.current === 4 && pNum === 3) return 'Bot Partner';
      return playerCountRef.current === 2 ? 'Bot Billiard' : `Bot ${pNum - 1}`;
    }
    return `Pemain ${pNum}`;
  }, []);

  const syncHud = useCallback((statusOverride?: string, winnerOverride?: number | null) => {
    const pocketedNums = ballsRef.current
      .filter((b) => b.pocketed && b.number !== 0)
      .map((b) => b.number)
      .sort((a, b) => a - b);

    setHud((prev) => ({
      variant: variantRef.current,
      playerCount: playerCountRef.current,
      turn: turnRef.current,
      group1: group1Ref.current,
      group2: group2Ref.current,
      scores: [...scoresRef.current],
      lowestBall: getLowestBallNumber(ballsRef.current),
      ballInHand: ballInHandRef.current,
      isMoving: movingRef.current,
      winner: winnerOverride !== undefined ? winnerOverride : prev.winner,
      status: statusOverride ?? prev.status,
      pocketedNums,
    }));
  }, []);

  const drawTable = useCallback((alpha = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(POOL_W * dpr);
    const targetH = Math.floor(POOL_H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Mahogany rail
    ctx.fillStyle = '#3f1d0e';
    ctx.fillRect(0, 0, POOL_W, POOL_H);
    if (patternsRef.current.darkWood) {
      ctx.save();
      ctx.globalAlpha = 0.52;
      ctx.fillStyle = patternsRef.current.darkWood;
      ctx.fillRect(0, 0, POOL_W, POOL_H);
      ctx.restore();
    }

    // Brass corner accents
    ctx.fillStyle = '#b45309';
    for (const [cx, cy] of [
      [0, 0],
      [POOL_W - 34, 0],
      [0, POOL_H - 34],
      [POOL_W - 34, POOL_H - 34],
    ]) {
      ctx.fillRect(cx, cy, 34, 34);
    }

    // Ivory diamond sights
    ctx.fillStyle = '#fef3c7';
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue;
      const sx = RAIL + ((POOL_W - RAIL * 2) * i) / 8;
      for (const sy of [RAIL * 0.48, POOL_H - RAIL * 0.48]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 1; i <= 3; i++) {
      const sy = RAIL + ((POOL_H - RAIL * 2) * i) / 4;
      for (const sx of [RAIL * 0.48, POOL_W - RAIL * 0.48]) {
        ctx.beginPath();
        ctx.arc(sx, sy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Felt surface
    const grad = ctx.createRadialGradient(POOL_W / 2, POOL_H / 2, 40, POOL_W / 2, POOL_H / 2, 520);
    grad.addColorStop(0, '#147a52');
    grad.addColorStop(1, '#09452e');
    ctx.fillStyle = grad;
    ctx.fillRect(RAIL, RAIL, POOL_W - RAIL * 2, POOL_H - RAIL * 2);
    if (patternsRef.current.felt) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = patternsRef.current.felt;
      ctx.fillRect(RAIL, RAIL, POOL_W - RAIL * 2, POOL_H - RAIL * 2);
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(RAIL, RAIL, POOL_W - RAIL * 2, POOL_H - RAIL * 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(POOL_W * 0.26, RAIL);
    ctx.lineTo(POOL_W * 0.26, POOL_H - RAIL);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(POOL_W * 0.72, POOL_H / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Pockets
    for (const p of POOL_POCKETS) {
      ctx.fillStyle = '#050810';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Sinking animations
    const now = performance.now();
    sinkingRef.current = sinkingRef.current.filter((s) => now - s.start < 240);
    for (const s of sinkingRef.current) {
      const t = (now - s.start) / 240;
      const ease = t * t;
      const sx = s.x + (s.toX - s.x) * ease;
      const sy = s.y + (s.toY - s.y) * ease;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(sx, sy, s.radius * (1 - t * 0.85), 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.restore();
    }

    // Impact ripples
    impactsRef.current = impactsRef.current.filter((im) => now - im.start < 180);
    for (const im of impactsRef.current) {
      const t = (now - im.start) / 180;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.45 * im.intensity;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(im.x, im.y, 4 + t * 18 * im.intensity, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Cue trail
    if (trailRef.current.length > 1) {
      for (let i = 0; i < trailRef.current.length; i++) {
        const pt = trailRef.current[i];
        const alphaTrail = ((i + 1) / trailRef.current.length) * 0.24;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, BALL_RADIUS * (0.4 + 0.4 * (i / trailRef.current.length)), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248, 250, 252, ${alphaTrail})`;
        ctx.fill();
      }
    }

    // Balls
    for (const b of ballsRef.current) {
      if (b.pocketed) continue;
      const px = b.prevX ?? b.x;
      const py = b.prevY ?? b.y;
      const rx = px + (b.x - px) * alpha;
      const ry = py + (b.y - py) * alpha;
      const rollOffX = Math.sin((b.rollX ?? 0) * 0.14) * (b.radius * 0.22);
      const rollOffY = Math.sin((b.rollY ?? 0) * 0.14) * (b.radius * 0.22);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2;

      if (b.number >= 9 && b.number <= 15) {
        ctx.beginPath();
        ctx.arc(rx, ry, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(rx, ry, b.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = b.color;
        ctx.fillRect(rx - b.radius, ry - b.radius * 0.52 + rollOffY * 0.7, b.radius * 2, b.radius * 1.04);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(rx, ry, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      }

      ctx.shadowColor = 'transparent';

      ctx.beginPath();
      ctx.arc(rx - b.radius * 0.3, ry - b.radius * 0.3, b.radius * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fill();

      if (b.number > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(rx, ry, b.radius * 0.94, 0, Math.PI * 2);
        ctx.clip();

        ctx.beginPath();
        ctx.arc(rx + rollOffX * 0.55, ry + rollOffY * 0.55, b.radius * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 8.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.number), rx + rollOffX * 0.55, ry + rollOffY * 0.55 + 0.5);
        ctx.restore();
      }
      ctx.restore();
    }

    const drawCueStick = (cx: number, cy: number, ux: number, uy: number, backOffset: number) => {
      const stickLen = 175;
      const sx1 = cx - ux * backOffset;
      const sy1 = cy - uy * backOffset;
      const smidX = cx - ux * (backOffset + 65);
      const smidY = cy - uy * (backOffset + 65);
      const sx2 = cx - ux * (backOffset + stickLen);
      const sy2 = cy - uy * (backOffset + stickLen);

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(smidX, smidY);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(smidX, smidY);
      ctx.stroke();

      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(cx - ux * (backOffset + 8), cy - uy * (backOffset + 8));
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(cx - ux * (backOffset + 2.5), cy - uy * (backOffset + 2.5));
      ctx.stroke();
    };

    const cue = ballsRef.current.find((b) => b.number === 0);
    if (cue && !cue.pocketed && aiWindupRef.current?.active) {
      const w = aiWindupRef.current;
      const elapsed = now - w.start;
      const pullFrac =
        elapsed < 340
          ? 1 - Math.pow(1 - elapsed / 340, 2)
          : Math.max(0, 1 - (elapsed - 340) / 110);
      const backOff = 15 + w.powerPx * 0.42 * pullFrac;
      const aim = raycastAim(ballsRef.current, cue, w.ux, w.uy);
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cue.x, cue.y);
      ctx.lineTo(aim.hitX, aim.hitY);
      ctx.stroke();
      ctx.restore();
      drawCueStick(cue.x, cue.y, w.ux, w.uy, backOff);
    } else if (cueLungeRef.current?.active && cue) {
      const lunge = cueLungeRef.current;
      const t = (now - lunge.start) / 90;
      if (t >= 1) {
        cueLungeRef.current = null;
      } else {
        const backOff = (18 + lunge.pull * 0.45) * (1 - t) + 12 * t;
        drawCueStick(cue.x, cue.y, lunge.ux, lunge.uy, backOff);
      }
    } else if (dragRef.current.active && cue && !cue.pocketed && !movingRef.current && !ballInHandRef.current) {
      const dx = cue.x - dragRef.current.x;
      const dy = cue.y - dragRef.current.y;
      const pull = Math.hypot(dx, dy);
      if (pull > 10) {
        const clamped = Math.min(pull, 150);
        const ux = dx / pull;
        const uy = dy / pull;
        const aim = raycastAim(ballsRef.current, cue, ux, uy);

        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(aim.hitX, aim.hitY);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(aim.hitX, aim.hitY, BALL_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        if (aim.targetBall) {
          const tx = aim.targetBall.x - aim.hitX;
          const ty = aim.targetBall.y - aim.hitY;
          const td = Math.hypot(tx, ty) || 1;
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(aim.targetBall.x, aim.targetBall.y);
          ctx.lineTo(aim.targetBall.x + (tx / td) * 52, aim.targetBall.y + (ty / td) * 52);
          ctx.stroke();
        }

        drawCueStick(cue.x, cue.y, ux, uy, 18 + clamped * 0.45);

        const pct = Math.round((clamped / 150) * 100);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(cue.x - 24, cue.y - 40, 48, 20, 6);
        ctx.fill();
        ctx.fillStyle = pct > 75 ? '#fb7185' : '#fde047';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, cue.x, cue.y - 30);
      }
    }
  }, []);

  const endWithWinner = useCallback(
    (winner: number, reason: string) => {
      const onlineSess = onlineSessionRef.current;
      const v = variantRef.current;
      const count = playerCountRef.current;
      if (!rewardRef.current) {
        rewardRef.current = true;
        let humanWon = false;
        if (modeRef.current === 'local') {
          humanWon = true;
        } else if (modeRef.current === 'online') {
          const mySeat = (onlineSess?.seatIdx ?? 0) + 1;
          if (v === '8ball' && count === 4) {
            humanWon = winner === (mySeat % 2 === 1 ? 1 : 2);
          } else {
            humanWon = winner === mySeat;
          }
        } else {
          humanWon = winner === 1;
        }

        recordGame('billiard', humanWon);
        if ((modeRef.current === 'ai' || modeRef.current === 'online') && humanWon) {
          addChips(600);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else if (modeRef.current === 'ai' || modeRef.current === 'online') {
          sfx('lose');
        } else {
          setConfettiKey((k) => k + 1);
          sfx('win');
        }
      }
      syncHud(reason, winner);
      drawTable();
      if (modeRef.current === 'online' && onlineSess && turnRef.current === onlineSess.seatIdx + 1) {
        getSocket().emit('billiard:sync', {
          code: onlineSess.code,
          balls: ballsRef.current,
          turn: turnRef.current,
          group1: group1Ref.current,
          group2: group2Ref.current,
          ballInHand: false,
          status: reason,
          winner,
          variant: v,
          scores: scoresRef.current,
          playerCount: count,
        });
      }
    },
    [addChips, drawTable, recordGame, sfx, syncHud]
  );

  const advanceTurn = useCallback((current: number): number => {
    const count = playerCountRef.current;
    if (variantRef.current === 'cutthroat') {
      for (let i = 1; i <= 3; i++) {
        const cand = ((current - 1 + i) % 3) + 1;
        const [lo, hi] = getCutthroatRange(cand);
        if (ballsRef.current.some((b) => !b.pocketed && b.number >= lo && b.number <= hi)) {
          return cand;
        }
      }
    }
    return (current % count) + 1;
  }, []);

  const respottCueBall = useCallback(() => {
    const cueBall = ballsRef.current.find((b) => b.number === 0)!;
    const spot = findSafeCueSpot(ballsRef.current);
    cueBall.pocketed = false;
    cueBall.vx = 0;
    cueBall.vy = 0;
    cueBall.x = spot.x;
    cueBall.y = spot.y;
    cueBall.prevX = spot.x;
    cueBall.prevY = spot.y;
  }, []);

  const finishTurn = useCallback(() => {
    const onlineSess = onlineSessionRef.current;
    if (modeRef.current === 'online' && onlineSess && turnRef.current !== onlineSess.seatIdx + 1) {
      return;
    }

    const v = variantRef.current;
    const count = playerCountRef.current;
    const pocketed = pocketedTurnRef.current;
    pocketedTurnRef.current = [];
    const firstHit = firstHitRef.current;
    firstHitRef.current = undefined;
    const lowestExpected = lowestBeforeShotRef.current;

    const currentPlayer = turnRef.current;
    const scratched = pocketed.some((b) => b.number === 0);
    const objectPocketed = pocketed.filter((b) => b.number > 0);

    // ---- 9-BALL RULES ----
    if (v === '9ball') {
      const firstNum = firstHit ? Number(firstHit.replace('ball-', '')) : null;
      const foul = scratched || !firstHit || (lowestExpected !== null && firstNum !== lowestExpected);
      const ninePocketed = objectPocketed.some((b) => b.number === 9);

      if (ninePocketed && !foul) {
        endWithWinner(currentPlayer, `${getPlayerLabel(currentPlayer)} memasukkan Bola 9 dan MENANG!`);
        return;
      }

      if (ninePocketed && foul) {
        const nine = ballsRef.current.find((b) => b.number === 9);
        if (nine) {
          const fSpot = findSafeFootSpot(ballsRef.current);
          nine.pocketed = false;
          nine.vx = 0;
          nine.vy = 0;
          nine.x = fSpot.x;
          nine.y = fSpot.y;
          nine.prevX = fSpot.x;
          nine.prevY = fSpot.y;
        }
      }

      let nextStatus = '';
      if (foul) {
        sfx('foul');
        respottCueBall();
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        ballInHandRef.current = !(modeRef.current === 'ai' && nextP !== 1);
        nextStatus = scratched
          ? `Foul (Scratch)! ${getPlayerLabel(nextP)} mendapat Ball-in-Hand.`
          : `Foul (Wajib kena Bola ${lowestExpected} dulu)! Giliran ${getPlayerLabel(nextP)}.`;
      } else if (objectPocketed.length > 0) {
        ballInHandRef.current = false;
        nextStatus = `${getPlayerLabel(currentPlayer)} memasukkan bola! Giliran lanjut.`;
      } else {
        ballInHandRef.current = false;
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        nextStatus = `Giliran ${getPlayerLabel(nextP)}.`;
      }

      syncHud(nextStatus);
      drawTable();
      if (modeRef.current === 'online' && onlineSess) {
        getSocket().emit('billiard:sync', {
          code: onlineSess.code,
          balls: ballsRef.current,
          turn: turnRef.current,
          group1: group1Ref.current,
          group2: group2Ref.current,
          ballInHand: ballInHandRef.current,
          status: nextStatus,
          winner: null,
          variant: v,
          scores: scoresRef.current,
          playerCount: count,
        });
      }
      return;
    }

    // ---- 15-BALL POINT FFA RULES ----
    if (v === '15point') {
      const foul = scratched || !firstHit;
      let nextStatus = '';
      if (foul) {
        sfx('foul');
        respottCueBall();
        // Return pocketed balls on a foul so points cannot be farmed unfairly
        for (const b of objectPocketed) {
          const spot = findSafeFootSpot(ballsRef.current);
          b.pocketed = false;
          b.vx = 0;
          b.vy = 0;
          b.x = spot.x;
          b.y = spot.y;
          b.prevX = spot.x;
          b.prevY = spot.y;
        }
        scoresRef.current[currentPlayer - 1] = Math.max(0, scoresRef.current[currentPlayer - 1] - 5);
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        ballInHandRef.current = !(modeRef.current === 'ai' && nextP !== 1);
        nextStatus = `Foul (-5 poin)! ${getPlayerLabel(nextP)} mendapat Ball-in-Hand.`;
      } else if (objectPocketed.length > 0) {
        const gained = objectPocketed.reduce((sum, b) => sum + b.number, 0);
        scoresRef.current[currentPlayer - 1] += gained;
        ballInHandRef.current = false;
        const remaining = ballsRef.current.filter((b) => !b.pocketed && b.number > 0).length;
        if (remaining === 0) {
          let bestIdx = 0;
          for (let i = 1; i < count; i++) {
            if (scoresRef.current[i] > scoresRef.current[bestIdx]) bestIdx = i;
          }
          const winnerP = bestIdx + 1;
          endWithWinner(
            winnerP,
            `${getPlayerLabel(winnerP)} menang 15-Point dengan ${scoresRef.current[bestIdx]} poin!`
          );
          return;
        }
        nextStatus = `${getPlayerLabel(currentPlayer)} +${gained} poin! Giliran lanjut.`;
      } else {
        ballInHandRef.current = false;
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        nextStatus = `Giliran ${getPlayerLabel(nextP)}.`;
      }

      syncHud(nextStatus);
      drawTable();
      if (modeRef.current === 'online' && onlineSess) {
        getSocket().emit('billiard:sync', {
          code: onlineSess.code,
          balls: ballsRef.current,
          turn: turnRef.current,
          group1: null,
          group2: null,
          ballInHand: ballInHandRef.current,
          status: nextStatus,
          winner: null,
          variant: v,
          scores: scoresRef.current,
          playerCount: count,
        });
      }
      return;
    }

    // ---- CUTTHROAT 3P RULES ----
    if (v === 'cutthroat') {
      const foul = scratched || !firstHit;
      const alivePlayers = [1, 2, 3].filter((p) => {
        const [lo, hi] = getCutthroatRange(p);
        return ballsRef.current.some((b) => !b.pocketed && b.number >= lo && b.number <= hi);
      });

      if (alivePlayers.length === 1) {
        const winnerP = alivePlayers[0];
        endWithWinner(winnerP, `${getPlayerLabel(winnerP)} bertahan terakhir dan menang Cutthroat!`);
        return;
      }

      let nextStatus = '';
      if (foul) {
        sfx('foul');
        respottCueBall();
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        ballInHandRef.current = !(modeRef.current === 'ai' && nextP !== 1);
        nextStatus = `Foul! ${getPlayerLabel(nextP)} mendapat Ball-in-Hand.`;
      } else {
        const [myLo, myHi] = getCutthroatRange(currentPlayer);
        const pocketedOpponentBall = objectPocketed.some((b) => b.number < myLo || b.number > myHi);
        ballInHandRef.current = false;
        if (pocketedOpponentBall && alivePlayers.includes(currentPlayer)) {
          nextStatus = `${getPlayerLabel(currentPlayer)} memasukkan bola lawan! Giliran lanjut.`;
        } else {
          const nextP = advanceTurn(currentPlayer);
          turnRef.current = nextP;
          nextStatus = `Giliran ${getPlayerLabel(nextP)}.`;
        }
      }

      syncHud(nextStatus);
      drawTable();
      if (modeRef.current === 'online' && onlineSess) {
        getSocket().emit('billiard:sync', {
          code: onlineSess.code,
          balls: ballsRef.current,
          turn: turnRef.current,
          group1: null,
          group2: null,
          ballInHand: ballInHandRef.current,
          status: nextStatus,
          winner: null,
          variant: v,
          scores: scoresRef.current,
          playerCount: 3,
        });
      }
      return;
    }

    // ---- 8-BALL RULES (2P or 4P 2v2 Teams) ----
    const currentTeam = count === 4 ? (currentPlayer % 2 === 1 ? 1 : 2) : currentPlayer;
    const otherTeam = currentTeam === 1 ? 2 : 1;
    const currentGroup = currentTeam === 1 ? group1Ref.current : group2Ref.current;
    const eightPocketed = pocketed.some((b) => b.number === 8);

    const remainingOwnCount = currentGroup
      ? ballsRef.current.filter((b) => !b.pocketed && getBallGroup(b.number) === currentGroup).length
      : 7;

    if (eightPocketed) {
      const winnerLabel = count === 4 ? `Tim ${otherTeam} (${otherTeam === 1 ? 'P1 & P3' : 'P2 & P4'})` : getPlayerLabel(otherTeam);
      const curLabel = count === 4 ? `Tim ${currentTeam} (${currentTeam === 1 ? 'P1 & P3' : 'P2 & P4'})` : getPlayerLabel(currentPlayer);
      if (!currentGroup || remainingOwnCount > 0 || scratched) {
        endWithWinner(otherTeam, `Bola 8 masuk terlalu cepat / scratch! ${winnerLabel} menang!`);
      } else {
        endWithWinner(currentTeam, `${curLabel} memasukkan Bola 8 dengan sah dan menang!`);
      }
      return;
    }

    const groupBallsPocketed = pocketed.filter((b) => b.number !== 0 && b.number !== 8);
    if (!group1Ref.current && groupBallsPocketed.length > 0 && !scratched) {
      const firstGrp = getBallGroup(groupBallsPocketed[0].number) as BallGroup;
      if (currentTeam === 1) {
        group1Ref.current = firstGrp;
        group2Ref.current = firstGrp === 'solid' ? 'stripe' : 'solid';
      } else {
        group2Ref.current = firstGrp;
        group1Ref.current = firstGrp === 'solid' ? 'stripe' : 'solid';
      }
    }

    let hitFoul = false;
    const activeGrp = currentTeam === 1 ? group1Ref.current : group2Ref.current;
    if (!firstHit) {
      hitFoul = true;
    } else if (activeGrp) {
      const hitNum = Number(firstHit.replace('ball-', ''));
      const hitGrp = getBallGroup(hitNum);
      const stillHasOwn = ballsRef.current.some((b) => !b.pocketed && getBallGroup(b.number) === activeGrp);
      if (stillHasOwn && hitGrp !== activeGrp) {
        hitFoul = true;
      } else if (!stillHasOwn && hitGrp !== 'eight') {
        hitFoul = true;
      }
    }

    let nextStatus = '';
    if (scratched || hitFoul) {
      sfx('foul');
      respottCueBall();
      const nextP = advanceTurn(currentPlayer);
      turnRef.current = nextP;
      ballInHandRef.current = !(modeRef.current === 'ai' && nextP !== 1);
      const who = getPlayerLabel(nextP);
      nextStatus = scratched
        ? `Foul (Scratch)! ${who} mendapat Ball-in-Hand.`
        : `Foul (Salah bola pertama)! Giliran ${who}.`;
      syncHud(nextStatus);
      drawTable();
    } else {
      const updatedGrp = currentTeam === 1 ? group1Ref.current : group2Ref.current;
      const pocketedOwn = groupBallsPocketed.some((b) => !updatedGrp || getBallGroup(b.number) === updatedGrp);

      if (pocketedOwn) {
        nextStatus = `${getPlayerLabel(currentPlayer)} memasukkan bola! Giliran lanjut.`;
      } else {
        const nextP = advanceTurn(currentPlayer);
        turnRef.current = nextP;
        nextStatus = `Giliran ${getPlayerLabel(nextP)}.`;
      }
      syncHud(nextStatus);
      drawTable();
    }

    if (modeRef.current === 'online' && onlineSess) {
      getSocket().emit('billiard:sync', {
        code: onlineSess.code,
        balls: ballsRef.current,
        turn: turnRef.current,
        group1: group1Ref.current,
        group2: group2Ref.current,
        ballInHand: ballInHandRef.current,
        status: nextStatus,
        winner: null,
        variant: v,
        scores: scoresRef.current,
        playerCount: count,
      });
    }
  }, [advanceTurn, drawTable, endWithWinner, getPlayerLabel, respottCueBall, sfx, syncHud]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    lowestBeforeShotRef.current = getLowestBallNumber(ballsRef.current);
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
        const res = stepPhysics(ballsRef.current, POOL_BOUNDS, POOL_POCKETS, {
          friction: 0.992,
          linearFriction: 0.022,
          wallRestitution: 0.84,
          substeps: 8,
          minSpeed: 0.03,
        });

        if (!firstHitRef.current && res.firstHitId) {
          firstHitRef.current = res.firstHitId;
        }
        if (res.hitPairs.length > 0) sfx('clack');
        if (res.impactPoints.length > 0) {
          for (const im of res.impactPoints) {
            impactsRef.current.push({ ...im, start: now });
          }
        }
        if (res.newlyPocketed.length > 0) {
          pocketedTurnRef.current.push(...(res.newlyPocketed as PoolBall[]));
          for (const ev of res.pocketedInto) {
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

        const cue = ballsRef.current.find((b) => b.number === 0);
        if (cue && !cue.pocketed && Math.hypot(cue.vx, cue.vy) > 2.2) {
          trailRef.current.push({ x: cue.x, y: cue.y });
          if (trailRef.current.length > 7) trailRef.current.shift();
        } else if (trailRef.current.length > 0) {
          trailRef.current.shift();
        }

        moving = res.moving;
        accumulator -= STEP_MS;
        stepsRun++;
        if (!moving) break;
      }

      const alpha = moving ? accumulator / STEP_MS : 1;
      drawTable(alpha);

      if (moving || sinkingRef.current.length > 0 || impactsRef.current.length > 0 || trailRef.current.length > 0 || cueLungeRef.current?.active) {
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
  }, [drawTable, finishTurn, sfx, syncHud]);

  const resetGame = useCallback(
    (nextMode?: 'ai' | 'local' | 'online', nextVariant?: BilliardVariant, nextPlayerCount?: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);

      const targetMode = nextMode ?? modeRef.current;
      const targetVariant = nextVariant ?? variantRef.current;
      let targetCount = nextPlayerCount ?? playerCountRef.current;
      if (targetVariant === 'cutthroat') targetCount = 3;
      else if (targetVariant === '8ball' && targetCount !== 2 && targetCount !== 4) targetCount = 2;

      if (targetMode === 'online' && onlineSessionRef.current && !nextMode) {
        getSocket().emit('billiard:rematch', {
          code: onlineSessionRef.current.code,
          variant: targetVariant,
          playerCount: targetCount,
        });
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

      variantRef.current = targetVariant;
      setVariant(targetVariant);
      playerCountRef.current = targetCount;
      setPlayerCount(targetCount);

      rewardRef.current = false;
      ballsRef.current = createPoolBalls(targetVariant);
      turnRef.current = 1;
      group1Ref.current = null;
      group2Ref.current = null;
      scoresRef.current = [0, 0, 0, 0];
      ballInHandRef.current = false;
      movingRef.current = false;
      pocketedTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      trailRef.current = [];
      cueLungeRef.current = null;
      aiWindupRef.current = null;
      firstHitRef.current = undefined;
      lowestBeforeShotRef.current = getLowestBallNumber(ballsRef.current);
      dragRef.current = { active: false, x: 0, y: 0 };
      syncHud(`Meja ${VARIANT_META[targetVariant].label} siap! Tarik dari bola putih untuk break!`, null);
      drawTable();
    },
    [drawTable, syncHud]
  );

  // Online socket listeners
  useEffect(() => {
    if (mode !== 'online' || !onlineSession) return;
    const socket = getSocket();

    const onRoomUpdate = (payload: { room: MultiplayerRoomInfo }) => {
      setOnlineSession((prev) => (prev ? { ...prev, room: payload.room } : prev));
      const joined = payload.room.players.length;
      if (variantRef.current === 'cutthroat') {
        playerCountRef.current = 3;
        setPlayerCount(3);
      } else if (variantRef.current === '8ball') {
        const nextC = joined > 2 ? 4 : 2;
        playerCountRef.current = nextC;
        setPlayerCount(nextC);
      } else {
        const nextC = Math.max(2, Math.min(4, joined));
        playerCountRef.current = nextC;
        setPlayerCount(nextC);
      }
      syncHud();
    };

    const onAim = (payload: { active: boolean; x: number; y: number }) => {
      if (movingRef.current) return;
      dragRef.current = payload;
      drawTable();
    };

    const onPlaceCue = (payload: { x: number; y: number; confirm?: boolean }) => {
      const cue = ballsRef.current.find((b) => b.number === 0);
      if (!cue) return;
      cue.x = payload.x;
      cue.y = payload.y;
      cue.prevX = payload.x;
      cue.prevY = payload.y;
      if (payload.confirm) ballInHandRef.current = false;
      syncHud();
      drawTable();
    };

    const onShoot = ({ vx, vy }: { vx: number; vy: number }) => {
      const cue = ballsRef.current.find((b) => b.number === 0);
      if (!cue) return;
      dragRef.current.active = false;
      cue.prevX = cue.x;
      cue.prevY = cue.y;
      cue.vx = vx;
      cue.vy = vy;
      sfx('clack');
      startLoop();
    };

    const onSync = (payload: {
      balls: PoolBall[];
      turn: number;
      group1: BallGroup | null;
      group2: BallGroup | null;
      ballInHand: boolean;
      status: string;
      winner: number | null;
      variant?: BilliardVariant;
      scores?: number[];
      playerCount?: number;
    }) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      movingRef.current = false;
      if (payload.variant) {
        variantRef.current = payload.variant;
        setVariant(payload.variant);
      }
      if (payload.playerCount) {
        playerCountRef.current = payload.playerCount;
        setPlayerCount(payload.playerCount);
      }
      if (payload.scores) scoresRef.current = payload.scores;

      ballsRef.current = payload.balls;
      turnRef.current = payload.turn;
      group1Ref.current = payload.group1;
      group2Ref.current = payload.group2;
      ballInHandRef.current = payload.ballInHand;
      if (payload.winner !== null && !rewardRef.current) {
        rewardRef.current = true;
        const mySeat = onlineSession.seatIdx + 1;
        const vNow = payload.variant ?? variantRef.current;
        const cNow = payload.playerCount ?? playerCountRef.current;
        const won = vNow === '8ball' && cNow === 4 ? payload.winner === (mySeat % 2 === 1 ? 1 : 2) : payload.winner === mySeat;
        recordGame('billiard', won);
        if (won) {
          addChips(600);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else {
          sfx('lose');
        }
      }
      syncHud(payload.status, payload.winner);
      drawTable();
    };

    const onRematch = (payload?: { variant?: BilliardVariant; playerCount?: number }) => {
      rewardRef.current = false;
      const targetVar = payload?.variant ?? variantRef.current;
      variantRef.current = targetVar;
      setVariant(targetVar);

      let targetCnt = payload?.playerCount ?? (onlineSessionRef.current?.room.players.length ?? 2);
      if (targetVar === 'cutthroat') targetCnt = 3;
      else if (targetVar === '8ball') targetCnt = targetCnt > 2 ? 4 : 2;
      else targetCnt = Math.max(2, Math.min(4, targetCnt));

      playerCountRef.current = targetCnt;
      setPlayerCount(targetCnt);

      ballsRef.current = createPoolBalls(targetVar);
      turnRef.current = 1;
      group1Ref.current = null;
      group2Ref.current = null;
      scoresRef.current = [0, 0, 0, 0];
      ballInHandRef.current = false;
      movingRef.current = false;
      pocketedTurnRef.current = [];
      sinkingRef.current = [];
      impactsRef.current = [];
      trailRef.current = [];
      dragRef.current = { active: false, x: 0, y: 0 };
      syncHud(`Meja ${VARIANT_META[targetVar].label} dimulai! Giliran ${getPlayerLabel(1)}.`, null);
      drawTable();
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('billiard:aim', onAim);
    socket.on('billiard:placeCue', onPlaceCue);
    socket.on('billiard:shoot', onShoot);
    socket.on('billiard:sync', onSync);
    socket.on('billiard:rematch', onRematch);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('billiard:aim', onAim);
      socket.off('billiard:placeCue', onPlaceCue);
      socket.off('billiard:shoot', onShoot);
      socket.off('billiard:sync', onSync);
      socket.off('billiard:rematch', onRematch);
    };
  }, [addChips, drawTable, getPlayerLabel, mode, onlineSession?.code, recordGame, sfx, startLoop, syncHud]);

  useEffect(() => {
    const loadTex = (src: string, key: 'darkWood' | 'felt') => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        patternsRef.current[key] = ctx.createPattern(img, 'repeat');
        drawTable();
      };
      img.src = src;
    };
    loadTex('/assets/textures/dark_wood.jpg', 'darkWood');
    loadTex('/assets/textures/felt_weave.jpg', 'felt');

    drawTable();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
    };
  }, [drawTable]);

  // AI Turn for P2/P3/P4 across all variants
  useEffect(() => {
    if (mode !== 'ai' || hud.winner !== null || hud.isMoving || hud.turn === 1) return;

    let animRaf = 0;
    const activeTurn = hud.turn;
    const assignedGroup =
      variantRef.current === '8ball'
        ? activeTurn % 2 === 1
          ? group1Ref.current
          : group2Ref.current
        : null;

    aiTimerRef.current = window.setTimeout(() => {
      const vec = computePoolAiShot(ballsRef.current, variantRef.current, {
        assignedGroup,
        playerNum: activeTurn,
      });
      const cue = ballsRef.current.find((b) => b.number === 0);
      if (!cue) return;
      const spd = Math.hypot(vec.vx, vec.vy) || 1;
      const ux = vec.vx / spd;
      const uy = vec.vy / spd;
      const powerPx = Math.min(140, spd / 0.16);
      const start = performance.now();

      aiWindupRef.current = { active: true, ux, uy, start, powerPx };

      const stepWindup = (now: number) => {
        const elapsed = now - start;
        drawTable(1);
        if (elapsed < 460) {
          animRaf = requestAnimationFrame(stepWindup);
        } else {
          aiWindupRef.current = null;
          cue.prevX = cue.x;
          cue.prevY = cue.y;
          cue.vx = vec.vx;
          cue.vy = vec.vy;
          sfx('clack');
          startLoop();
        }
      };

      animRaf = requestAnimationFrame(stepWindup);
    }, 560);

    return () => {
      if (aiTimerRef.current !== null) window.clearTimeout(aiTimerRef.current);
      if (animRaf) cancelAnimationFrame(animRaf);
      aiWindupRef.current = null;
    };
  }, [mode, hud.winner, hud.isMoving, hud.turn, drawTable, sfx, startLoop]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * POOL_W,
      y: ((e.clientY - rect.top) / rect.height) * POOL_H,
    };
  };

  const canInteract =
    !hud.isMoving &&
    hud.winner === null &&
    (mode === 'local' ||
      (mode === 'ai' && hud.turn === 1) ||
      (mode === 'online' &&
        Boolean(onlineSession && onlineSession.room.players.length >= 2) &&
        hud.turn === (onlineSession?.seatIdx ?? 0) + 1));

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canInteract) return;
    const pt = getPoint(e);
    const cue = ballsRef.current.find((b) => b.number === 0)!;

    if (ballInHandRef.current) {
      if (isCuePlacementValid(ballsRef.current, pt.x, pt.y)) {
        cue.x = pt.x;
        cue.y = pt.y;
        cue.prevX = pt.x;
        cue.prevY = pt.y;
        ballInHandRef.current = false;
        if (modeRef.current === 'online' && onlineSessionRef.current) {
          getSocket().emit('billiard:placeCue', {
            code: onlineSessionRef.current.code,
            x: pt.x,
            y: pt.y,
            confirm: true,
          });
        }
        sfx('click');
        syncHud('Bola putih ditempatkan. Sekarang tarik untuk membidik!');
        drawTable();
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, x: pt.x, y: pt.y };
    drawTable();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ballInHandRef.current && canInteract) {
      const pt = getPoint(e);
      if (isCuePlacementValid(ballsRef.current, pt.x, pt.y)) {
        const cue = ballsRef.current.find((b) => b.number === 0)!;
        cue.x = pt.x;
        cue.y = pt.y;
        cue.prevX = pt.x;
        cue.prevY = pt.y;
        if (modeRef.current === 'online' && onlineSessionRef.current && performance.now() - lastAimEmitRef.current > 45) {
          lastAimEmitRef.current = performance.now();
          getSocket().emit('billiard:placeCue', { code: onlineSessionRef.current.code, x: pt.x, y: pt.y });
        }
        drawTable();
      }
      return;
    }

    if (!dragRef.current.active) return;
    const pt = getPoint(e);
    dragRef.current.x = pt.x;
    dragRef.current.y = pt.y;
    if (modeRef.current === 'online' && onlineSessionRef.current && performance.now() - lastAimEmitRef.current > 45) {
      lastAimEmitRef.current = performance.now();
      getSocket().emit('billiard:aim', { code: onlineSessionRef.current.code, active: true, x: pt.x, y: pt.y });
    }
    drawTable();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (modeRef.current === 'online' && onlineSessionRef.current) {
      getSocket().emit('billiard:aim', { code: onlineSessionRef.current.code, active: false, x: 0, y: 0 });
    }

    const cue = ballsRef.current.find((b) => b.number === 0)!;
    const dx = cue.x - dragRef.current.x;
    const dy = cue.y - dragRef.current.y;
    const pull = Math.hypot(dx, dy);

    if (pull > 12 && canInteract) {
      const clamped = Math.min(pull, 150);
      const speed = clamped * 0.16;
      const ux = dx / pull;
      const uy = dy / pull;
      if (modeRef.current === 'online' && onlineSessionRef.current) {
        getSocket().emit('billiard:shoot', {
          code: onlineSessionRef.current.code,
          vx: ux * speed,
          vy: uy * speed,
        });
      } else {
        cue.prevX = cue.x;
        cue.prevY = cue.y;
        cue.vx = ux * speed;
        cue.vy = uy * speed;
        cueLungeRef.current = { active: true, ux, uy, start: performance.now(), pull: clamped };
        sfx('clack');
        startLoop();
      }
    } else {
      drawTable();
    }
  };

  const groupLabel = (grp: BallGroup | null) =>
    grp === 'solid' ? 'Solid (1–7)' : grp === 'stripe' ? 'Stripe (9–15)' : 'Terbuka';

  const handleVariantChange = (nextVar: BilliardVariant) => {
    sfx('click');
    if (mode === 'online' && onlineSession) {
      if (onlineSession.room.hostId !== onlineSession.playerId) return;
      const nextCnt =
        nextVar === 'cutthroat'
          ? 3
          : nextVar === '8ball'
            ? onlineSession.room.players.length > 2
              ? 4
              : 2
            : Math.max(2, onlineSession.room.players.length);
      getSocket().emit('billiard:rematch', {
        code: onlineSession.code,
        variant: nextVar,
        playerCount: nextCnt,
      });
      return;
    }

    let nextCnt = playerCount;
    if (nextVar === 'cutthroat') nextCnt = 3;
    else if (nextVar === '8ball') nextCnt = mode === 'ai' ? (aiCount === 3 ? 4 : 2) : nextCnt === 4 ? 4 : 2;
    else if (mode === 'ai') nextCnt = aiCount + 1;

    resetGame(undefined, nextVar, nextCnt);
  };

  const isHostOrOffline =
    mode !== 'online' || !onlineSession || onlineSession.room.hostId === onlineSession.playerId;

  return (
    <GameShell
      title="Billiard Pro"
      subtitle={VARIANT_META[variant].subtitle}
      onBack={() => {
        leaveOnlineRoom();
        onBack();
      }}
      onRestart={() => resetGame()}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          {/* Pool Variant Selector */}
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
            {(['8ball', '9ball', '15point', 'cutthroat'] as const).map((vKey) => (
              <button
                key={vKey}
                type="button"
                disabled={!isHostOrOffline}
                onClick={() => handleVariantChange(vKey)}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition disabled:opacity-60 ${
                  variant === vKey ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {VARIANT_META[vKey].label}
              </button>
            ))}
          </div>

          {/* Mode Selector */}
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                sfx('click');
                const cnt = variant === 'cutthroat' ? 3 : variant === '8ball' ? (aiCount === 3 ? 4 : 2) : aiCount + 1;
                resetGame('ai', variant, cnt);
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
                resetGame('local', variant, variant === 'cutthroat' ? 3 : playerCount);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'local' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Lokal
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

          {/* AI Opponent Count Picker */}
          {mode === 'ai' && variant !== 'cutthroat' && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs">
              <span className="text-slate-400 font-semibold pr-1">Musuh AI:</span>
              {(variant === '8ball' ? ([1, 3] as const) : ([1, 2, 3] as const)).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setAiCount(cnt);
                    resetGame('ai', variant, cnt + 1);
                  }}
                  className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                    aiCount === cnt ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {variant === '8ball' ? (cnt === 1 ? '1 AI (1v1)' : '3 AI (2v2)') : `${cnt} AI`}
                </button>
              ))}
            </div>
          )}

          {/* Local Player Count Picker */}
          {mode === 'local' && variant !== 'cutthroat' && (
            <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
              {(variant === '8ball' ? ([2, 4] as const) : ([2, 3, 4] as const)).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    sfx('click');
                    resetGame('local', variant, cnt);
                  }}
                  className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                    playerCount === cnt ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {cnt === 4 && variant === '8ball' ? '4P (2v2)' : `${cnt}P`}
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
        'Klik/sentuh meja lalu tarik ke belakang untuk mengarahkan stik biliar & mengatur kekuatan pukulan.',
        ...VARIANT_META[variant].rules,
      ]}
    >
      <div className="space-y-4">
        {/* Player / Team Scoreboard Cards */}
        <div
          className={`grid gap-2.5 ${
            hud.playerCount === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : hud.playerCount === 3
                ? 'grid-cols-1 sm:grid-cols-3'
                : 'grid-cols-2 sm:grid-cols-4'
          }`}
        >
          {Array.from({ length: hud.playerCount }).map((_, idx) => {
            const pNum = idx + 1;
            const active = hud.turn === pNum && hud.winner === null;
            let metaText = '';
            if (hud.variant === '8ball') {
              const teamIdx = hud.playerCount === 4 ? (pNum % 2 === 1 ? 1 : 2) : pNum;
              const grp = teamIdx === 1 ? hud.group1 : hud.group2;
              metaText = `${hud.playerCount === 4 ? `Tim ${teamIdx} • ` : ''}${groupLabel(grp)}`;
            } else if (hud.variant === '9ball') {
              metaText = hud.lowestBall ? `Target: Bola ${hud.lowestBall}` : 'Selesai';
            } else if (hud.variant === '15point') {
              metaText = `${hud.scores[idx] ?? 0} Poin`;
            } else {
              const [lo, hi] = getCutthroatRange(pNum);
              const left = ballsRef.current.filter((b) => !b.pocketed && b.number >= lo && b.number <= hi).length;
              metaText = left === 0 ? `Bola ${lo}–${hi} (Tersingkir)` : `Bola ${lo}–${hi} (Sisa ${left})`;
            }

            return (
              <div
                key={pNum}
                className={`rounded-2xl border p-3 transition ${
                  active ? 'border-emerald-400/70 bg-emerald-500/12 shadow-lg shadow-emerald-500/10' : 'border-slate-800 bg-slate-900/75'
                }`}
              >
                <p className="text-xs text-slate-400 truncate">
                  P{pNum} • {getPlayerLabel(pNum)}
                </p>
                <p className="text-sm font-bold text-white mt-0.5 truncate">{metaText}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/75 px-4 py-2 text-center">
          <p className="text-xs sm:text-sm font-medium text-emerald-300">{hud.status}</p>
        </div>

        <div className="max-w-5xl mx-auto rounded-2xl overflow-hidden border-2 border-amber-950 shadow-2xl">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full aspect-[880/480] block touch-none cursor-crosshair"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/75 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">Bola Masuk:</span>
            {hud.pocketedNums.length === 0 ? (
              <span className="text-xs text-slate-500">Belum ada</span>
            ) : (
              hud.pocketedNums.map((num) => (
                <span
                  key={num}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-600 text-[11px] font-bold text-white font-mono-num"
                >
                  {num}
                </span>
              ))
            )}
          </div>

          {hud.winner !== null && (
            <button
              type="button"
              onClick={() => resetGame()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer"
            >
              <Trophy className="w-4 h-4" /> Main Lagi
            </button>
          )}
        </div>
      </div>
      <OnlineRoomModal
        open={roomModalOpen}
        gameId="billiard"
        gameTitle="Billiard Pro (2–4P)"
        initialJoinCode={initialRoomCode}
        activeSession={onlineSession}
        onConnected={(session) => {
          setOnlineSession(session);
          onlineSessionRef.current = session;
          const cnt =
            variantRef.current === 'cutthroat'
              ? 3
              : variantRef.current === '8ball'
                ? session.room.players.length > 2
                  ? 4
                  : 2
                : Math.max(2, session.room.players.length);
          resetGame('online', variantRef.current, cnt);
        }}
        onClose={() => setRoomModalOpen(false)}
      />
      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
