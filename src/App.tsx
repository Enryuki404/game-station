import React, { useEffect, useState } from 'react';
import { GameStationProvider } from './context/GameStationContext';
import { Navbar } from './components/Navbar';
import { Lobby } from './components/Lobby';
import { UnoGame } from './games/uno/UnoGame';
import { ChessGame } from './games/chess/ChessGame';
import { CarromGame } from './games/carrom/CarromGame';
import { BilliardGame } from './games/billiard/BilliardGame';
import { BlackjackGame } from './games/blackjack/BlackjackGame';
import { PokerGame } from './games/poker/PokerGame';
import { leaveOnlineRoom } from './lib/multiplayer';
import type { GameId } from './types/game';

const VALID_GAMES: GameId[] = ['uno', 'chess', 'carrom', 'billiard', 'blackjack', 'poker'];

function parseInitialParams(): { game: GameId | null; room: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('game') as GameId | null;
    const r = params.get('room');
    if (g && VALID_GAMES.includes(g)) {
      return { game: g, room: r ? r.trim().toUpperCase() : null };
    }
  } catch {
    // Ignore invalid URL
  }
  return { game: null, room: null };
}

const GameStationApp: React.FC = () => {
  const initial = parseInitialParams();
  const [activeGame, setActiveGame] = useState<GameId | null>(initial.game);
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(initial.room);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeGame]);

  const goHome = () => {
    leaveOnlineRoom();
    setPendingRoomCode(null);
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setActiveGame(null);
  };

  const handleSelectGame = (id: GameId) => {
    setPendingRoomCode(null);
    setActiveGame(id);
  };

  const handleOpenRoom = (id: GameId, code: string) => {
    setPendingRoomCode(code.trim().toUpperCase());
    setActiveGame(id);
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Ambient background aurora */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/4 w-[460px] h-[460px] rounded-full bg-indigo-600/10 blur-[110px] animate-ambient-drift" />
        <div
          className="absolute -bottom-32 right-1/5 w-[420px] h-[420px] rounded-full bg-emerald-500/10 blur-[110px] animate-ambient-drift"
          style={{ animationDelay: '-7s' }}
        />
      </div>

      <Navbar activeGame={activeGame} onSelectHome={goHome} />

      <div key={activeGame ?? 'lobby'} className="flex-1 animate-view-enter">
        {activeGame === null && (
          <Lobby onSelectGame={handleSelectGame} onOpenRoom={handleOpenRoom} />
        )}
        {activeGame === 'uno' && <UnoGame onBack={goHome} initialRoomCode={pendingRoomCode} />}
        {activeGame === 'chess' && <ChessGame onBack={goHome} initialRoomCode={pendingRoomCode} />}
        {activeGame === 'carrom' && <CarromGame onBack={goHome} initialRoomCode={pendingRoomCode} />}
        {activeGame === 'billiard' && <BilliardGame onBack={goHome} initialRoomCode={pendingRoomCode} />}
        {activeGame === 'blackjack' && <BlackjackGame onBack={goHome} />}
        {activeGame === 'poker' && <PokerGame onBack={goHome} />}
      </div>
    </div>
  );
};

export function App() {
  return (
    <GameStationProvider>
      <GameStationApp />
    </GameStationProvider>
  );
}

export default App;
