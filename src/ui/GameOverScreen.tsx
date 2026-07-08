/**
 * Terminal screen shown once state.gameOver is set (see engine/morale.ts's
 * checkGameOver). Blocks the rest of the UI entirely — there's no "keep
 * playing a dead colony," only founding a new one via the same resetGame()
 * the Settings reset button uses.
 */
import { useGameStore } from '../state/store';
import { formatDuration } from './format';
import type { DefeatReason } from '../engine/types';

const REASON_TITLE: Record<DefeatReason, string> = {
  population: 'Your Colony Has Fallen',
  morale: 'Your Colony Has Fallen',
  starvation: 'Your Colony Has Fallen',
};

const REASON_MESSAGE: Record<DefeatReason, string> = {
  population: 'The last of your villagers packed up and left. With no one left to tend it, Hearthold is abandoned.',
  morale: "Hope ran out before the harvest did. Your people's spirit collapsed, and the colony fell apart around them.",
  starvation: 'The granaries stayed empty too long. Hearthold starved.',
};

export function GameOverScreen() {
  const game = useGameStore((s) => s.game);
  const resetGame = useGameStore((s) => s.resetGame);
  const gameOver = game.gameOver;
  if (!gameOver) return null;

  const survivedSeconds = Math.max(0, (gameOver.at - game.createdAt) / 1000);

  return (
    <div className="game-over" role="alertdialog" aria-label="Game over">
      <div className="game-over-title">{REASON_TITLE[gameOver.reason]}</div>
      <p className="game-over-message">{REASON_MESSAGE[gameOver.reason]}</p>
      <p className="game-over-stats">
        Survived {formatDuration(survivedSeconds)} · reached day {game.survival.dayCount}
      </p>
      <button className="game-over-button" onClick={() => resetGame()}>
        Found a New Colony
      </button>
    </div>
  );
}
