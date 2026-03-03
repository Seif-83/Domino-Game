export type Domino = [number, number];

export type GameMode = 'AI' | 'PVP';

export type GameState = {
  playerHand: Domino[];
  opponentHand: Domino[] | number; // In PVP, this is the count of opponent's dominoes
  boneyard: Domino[];
  board: Domino[];
  turn: 'player' | 'opponent';
  status: 'playing' | 'won' | 'lost' | 'draw' | 'waiting' | 'menu';
  lastMove: { player: string, domino: Domino, side: 'left' | 'right' } | null;
  mode: GameMode;
  isHost?: boolean;
  myId?: string;
  roomId?: string;
  opponentName?: string;
  matchScore: { player: number, opponent: number };
  round: number;
  consecutivePasses: number;
  lastWinner: 'player' | 'opponent' | 'draw' | null;
  isConnected?: boolean;
  connectionError?: string;
};

export const INITIAL_HAND_SIZE = 7;
export const WINNING_SCORE = 150;

export function createDeck(): Domino[] {
  const deck: Domino[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push([i, j]);
    }
  }
  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
