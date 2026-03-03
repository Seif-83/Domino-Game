/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  RotateCcw,
  User,
  Cpu,
  Layers,
  Info,
  Play,
  Users,
  ArrowLeft,
  Copy,
  Check,
  Sparkles,
  Gamepad2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Domino, GameState, createDeck, shuffle, INITIAL_HAND_SIZE, GameMode, WINNING_SCORE } from './types';
import { DominoPiece } from './components/DominoPiece';

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    playerHand: [],
    opponentHand: 0,
    boneyard: [],
    board: [],
    turn: 'player',
    status: 'menu',
    lastMove: null,
    mode: 'AI',
    matchScore: { player: 0, opponent: 0 },
    round: 1,
    consecutivePasses: 0,
    lastWinner: null,
    isConnected: false
  });

  const [selectedDomino, setSelectedDomino] = useState<{ index: number, domino: Domino } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [roomInput, setRoomInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll to bottom of board
  const boardScrollingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (boardScrollingRef.current) {
      boardScrollingRef.current.scrollTo({
        top: boardScrollingRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [gameState.board.length]);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Opening Move Logic
  const determineStarter = (pHand: Domino[], oHand: Domino[]) => {
    let maxDouble = -1;
    let starter: 'player' | 'opponent' = 'player';

    pHand.forEach(d => {
      if (d[0] === d[1] && d[0] > maxDouble) {
        maxDouble = d[0];
        starter = 'player';
      }
    });

    oHand.forEach(d => {
      if (d[0] === d[1] && d[0] > maxDouble) {
        maxDouble = d[0];
        starter = 'opponent';
      }
    });

    if (maxDouble === -1) {
      const pSum = pHand.reduce((a, b) => a + b[0] + b[1], 0);
      const oSum = oHand.reduce((a, b) => a + b[0] + b[1], 0);
      starter = pSum >= oSum ? 'player' : 'opponent';
    }

    return starter;
  };

  // Initialize AI Game
  const initAIGame = useCallback(() => {
    const deck = shuffle(createDeck());
    const playerHand = deck.splice(0, INITIAL_HAND_SIZE);
    const aiHand = deck.splice(0, INITIAL_HAND_SIZE);
    const boneyard = deck;

    const turn = gameState.round === 1 || !gameState.lastWinner
      ? determineStarter(playerHand, aiHand)
      : (gameState.lastWinner === 'opponent' ? 'opponent' : 'player');

    setGameState(prev => ({
      ...prev,
      playerHand,
      opponentHand: aiHand,
      boneyard,
      board: [],
      turn,
      status: 'playing',
      lastMove: null,
      mode: 'AI',
      consecutivePasses: 0
    }));
    setSelectedDomino(null);
  }, [gameState.round, gameState.lastWinner, determineStarter]);

  // Initialize PVP Game
  const joinPVPRoom = (roomId: string, name: string) => {
    if (!socketRef.current) {
      socketRef.current = io();
    }

    const socket = socketRef.current;

    // Immediate feedback
    setGameState(prev => ({
      ...prev,
      status: 'waiting',
      mode: 'PVP',
      roomId,
      opponentName: 'Connecting...',
      isConnected: false,
      connectionError: undefined
    }));

    // Register listeners BEFORE emitting join-room to avoid race conditions
    socket.off('room-update');
    socket.off('start-game');
    socket.off('opponent-move');
    socket.off('state-synced');
    socket.off('player-left');
    socket.off('error');
    socket.off('connect');
    socket.off('connect_error');

    socket.on('connect', () => {
      console.log("Connected to game server:", socket.id);
      setGameState(prev => ({ ...prev, isConnected: true, connectionError: undefined }));
    });

    socket.on('connect_error', (err) => {
      console.error("Connection error:", err);
      setGameState(prev => ({
        ...prev,
        isConnected: false,
        connectionError: "Cannot reach server. Note: Vercel does not support PVP servers."
      }));
    });

    socket.on('room-update', ({ players }) => {
      const isHost = players[0].id === socket.id;
      const opponent = players.find((p: any) => p.id !== socket.id);

      setGameState(prev => ({
        ...prev,
        status: players.length === 2 ? (prev.status === 'waiting' ? 'waiting' : prev.status) : 'waiting',
        isHost,
        myId: socket.id,
        roomId,
        opponentName: opponent?.name || 'Waiting for friend...'
      }));
    });

    socket.emit('join-room', { roomId, playerName: name });

    socket.on('start-game', ({ hostId }) => {
      const isHost = hostId === socket.id;
      if (isHost) {
        const deck = shuffle(createDeck());
        const p1Hand = deck.splice(0, INITIAL_HAND_SIZE);
        const p2Hand = deck.splice(0, INITIAL_HAND_SIZE);
        const boneyard = deck;

        const initialState = {
          playerHand: p1Hand,
          opponentHand: p2Hand.length,
          boneyard,
          board: [],
          turn: 'player' as const,
          status: 'playing' as const,
          mode: 'PVP' as const,
          isHost: true,
          roomId
        };

        socket.emit('sync-state', {
          roomId,
          state: {
            ...initialState,
            playerHand: p2Hand,
            opponentHand: p1Hand.length,
            turn: 'opponent'
          }
        });

        setGameState(prev => ({ ...prev, ...initialState }));
      }
    });

    socket.on('opponent-move', (move) => {
      handleMove(move.domino, move.side, false);
    });

    socket.on('state-synced', (state) => {
      setGameState(prev => ({ ...prev, ...state }));
      triggerShake();
    });

    socket.on('player-left', () => {
      setGameState(prev => ({ ...prev, status: 'waiting', opponentName: 'Friend left' }));
    });

    socket.on('error', (msg) => {
      alert(msg);
      setGameState(prev => ({ ...prev, status: 'menu' }));
    });
  };

  // Game Logic Helpers
  const getEndsForBoard = useCallback((board: Domino[]) => {
    if (board.length === 0) return null;
    const first = board[0];
    const last = board[board.length - 1];

    if (board.length === 1) {
      return { left: first[0], right: first[1] };
    }

    const second = board[1];
    const left = (first[0] === second[0] || first[0] === second[1]) ? first[1] : first[0];

    const secondToLast = board[board.length - 2];
    const right = (last[0] === secondToLast[0] || last[0] === secondToLast[1]) ? last[1] : last[0];

    return { left, right };
  }, []);

  const getBoardEnds = useMemo(() => getEndsForBoard(gameState.board), [gameState.board, getEndsForBoard]);

  const isPlayableOnBoard = useCallback((domino: Domino, board: Domino[]) => {
    if (board.length === 0) return true;
    const ends = getEndsForBoard(board);
    if (!ends) return true;
    return domino[0] === ends.left || domino[1] === ends.left ||
      domino[0] === ends.right || domino[1] === ends.right;
  }, [getEndsForBoard]);

  const isPlayable = useCallback((domino: Domino) => isPlayableOnBoard(domino, gameState.board), [gameState.board, isPlayableOnBoard]);

  const getPlayableSides = useCallback((domino: Domino) => {
    if (gameState.board.length === 0) return ['left', 'right'];
    const ends = getBoardEnds;
    if (!ends) return [];
    const sides: ('left' | 'right')[] = [];
    if (domino[0] === ends.left || domino[1] === ends.left) sides.push('left');
    if (domino[0] === ends.right || domino[1] === ends.right) sides.push('right');
    return sides;
  }, [getBoardEnds]);

  const snakeLayout = useMemo(() => {
    const board = gameState.board;
    if (board.length === 0) return [];

    const padding = 40;
    const availableWidth = Math.min(containerWidth - padding * 2, 1000);
    const pieceSize = containerWidth < 640 ? 50 : 80; // Sizing based on screen
    const gap = 8;

    let layouts: { x: number; y: number; rotate: number; isVertical: boolean }[] = [];
    let curX = 20;
    let curY = 60;
    let direction: 'right' | 'left' = 'right';
    const rowHeight = pieceSize + gap * 4;

    board.forEach((domino, i) => {
      const isDouble = domino[0] === domino[1];
      const isVertical = isDouble; // Classic domino: doubles are vertical

      // Calculate dimensions for layout purposes
      const w = isVertical ? pieceSize / 2 : pieceSize;

      // If we're at the edge, wrap to next row
      if (direction === 'right' && curX + w > availableWidth) {
        curY += rowHeight;
        direction = 'left';
      } else if (direction === 'left' && curX - w < 0) {
        curY += rowHeight;
        direction = 'right';
      }

      layouts.push({
        x: curX,
        y: curY,
        rotate: direction === 'left' && !isDouble ? 180 : 0,
        isVertical
      });

      // Advance curX for next piece
      const step = w + gap;
      curX += direction === 'right' ? step : -step;
    });

    return layouts;
  }, [gameState.board, containerWidth]);

  const handleRoundEnd = (winner: 'player' | 'opponent' | 'draw', pHand: Domino[], oHand: Domino[] | number) => {
    let points = 0;
    if (winner === 'player') {
      points = Array.isArray(oHand) ? oHand.reduce((acc, d) => acc + d[0] + d[1], 0) : (oHand as number) * 7;
    } else if (winner === 'opponent') {
      points = pHand.reduce((acc, d) => acc + d[0] + d[1], 0);
    } else if (winner === 'draw') {
      // Smallest hand sum wins
      const pSum = pHand.reduce((acc, d) => acc + d[0] + d[1], 0);
      const oSum = Array.isArray(oHand) ? oHand.reduce((acc, d) => acc + d[0] + d[1], 0) : (oHand as number) * 7;

      if (pSum < oSum) {
        winner = 'player';
        points = oSum;
      } else if (oSum < pSum) {
        winner = 'opponent';
        points = pSum;
      } else {
        winner = 'draw';
        points = 0;
      }
    }

    setGameState(prev => {
      const nextScore = {
        player: prev.matchScore.player + (winner === 'player' ? points : 0),
        opponent: prev.matchScore.opponent + (winner === 'opponent' ? points : 0)
      };

      // Check for match winner
      const matchWinner = nextScore.player >= WINNING_SCORE ? 'player' : (nextScore.opponent >= WINNING_SCORE ? 'opponent' : null);

      const nextStatus = matchWinner
        ? (matchWinner === 'player' ? 'won' : 'lost')
        : (winner === 'player' ? 'won' : (winner === 'opponent' ? 'lost' : 'draw'));

      const nextRound = prev.round + 1;

      if (prev.mode === 'PVP' && socketRef.current) {
        socketRef.current.emit('sync-state', {
          roomId: prev.roomId,
          state: {
            ...prev,
            matchScore: { player: nextScore.opponent, opponent: nextScore.player },
            status: winner === 'player' ? 'lost' : (winner === 'opponent' ? 'won' : 'draw'),
            round: nextRound,
            consecutivePasses: 0
          }
        });
      }

      return {
        ...prev,
        matchScore: nextScore,
        status: nextStatus,
        round: nextRound,
        lastWinner: winner === 'draw' ? null : winner
      };
    });
  };

  const checkStalemate = (pHand: Domino[], oHand: Domino[] | number, boneyard: Domino[], board: Domino[]) => {
    const pCanPlay = pHand.some(d => isPlayableOnBoard(d, board));
    let oCanPlay = false;
    if (Array.isArray(oHand)) {
      oCanPlay = oHand.some(d => isPlayableOnBoard(d, board));
    } else {
      // In PVP, we assume they can play unless we track consecutive passes
      // But we check boneyard too
      oCanPlay = true;
    }

    const boneyardHasPlayable = boneyard.some(d => isPlayableOnBoard(d, board));

    // If NO ONE can play and boneyard has no playable piece, it's a "قفلة" (block)
    return !pCanPlay && !oCanPlay && !boneyardHasPlayable;
  };

  // Actions
  const handleMove = (domino: Domino, side: 'left' | 'right', isMe: boolean) => {
    const newBoard = [...gameState.board];
    const ends = getBoardEnds;
    let finalDomino: Domino = [...domino];

    if (newBoard.length === 0) {
      // First move of the match enforcement (Egyptian rules)
      if (gameState.round === 1) {
        const pHand = isMe ? gameState.playerHand : (Array.isArray(gameState.opponentHand) ? gameState.opponentHand : []);
        const oHand = !isMe ? gameState.playerHand : (Array.isArray(gameState.opponentHand) ? gameState.opponentHand : []);

        let maxDoubleInHands = -1;
        [...gameState.playerHand, ...(Array.isArray(gameState.opponentHand) ? gameState.opponentHand : [])].forEach(d => {
          if (d[0] === d[1] && d[0] > maxDoubleInHands) maxDoubleInHands = d[0];
        });

        if (finalDomino[0] !== finalDomino[1] || finalDomino[0] !== maxDoubleInHands) {
          // NOT allowed to play anything other than the highest double in the first round's first move
          console.warn("Egyptian Rule: Must start with the highest double!");
          triggerShake();
          return;
        }
      }
      newBoard.push(finalDomino);
    } else if (side === 'left') {
      if (finalDomino[1] !== ends!.left) {
        finalDomino = [finalDomino[1], finalDomino[0]];
      }
      newBoard.unshift(finalDomino);
    } else {
      if (finalDomino[0] !== ends!.right) {
        finalDomino = [finalDomino[1], finalDomino[0]];
      }
      newBoard.push(finalDomino);
    }

    const nextTurn = isMe ? 'opponent' : 'player';
    let newHand = [...gameState.playerHand];
    let newOpponentHand = gameState.opponentHand;

    if (isMe) {
      newHand = newHand.filter(d => !((d[0] === domino[0] && d[1] === domino[1]) || (d[0] === domino[1] && d[1] === domino[0])));
      if (gameState.mode === 'PVP' && socketRef.current) {
        socketRef.current.emit('game-move', {
          roomId: gameState.roomId,
          move: { domino, side }
        });
      }
    } else {
      if (Array.isArray(newOpponentHand)) {
        newOpponentHand = newOpponentHand.filter(d => !((d[0] === domino[0] && d[1] === domino[1]) || (d[0] === domino[1] && d[1] === domino[0])));
      } else {
        newOpponentHand = (newOpponentHand as number) - 1;
      }
    }

    const isRoundOver = (isMe && newHand.length === 0) ||
      (!isMe && (Array.isArray(newOpponentHand) ? newOpponentHand.length === 0 : newOpponentHand === 0)) ||
      checkStalemate(newHand, newOpponentHand, gameState.boneyard, newBoard) ||
      gameState.consecutivePasses >= 2;

    const winner = (isMe && newHand.length === 0) ? 'player' :
      (!isMe && (Array.isArray(newOpponentHand) ? newOpponentHand.length === 0 : newOpponentHand === 0)) ? 'opponent' :
        'draw';

    // Update board state immediately so the piece appears
    setGameState(prev => ({
      ...prev,
      playerHand: newHand,
      opponentHand: newOpponentHand,
      board: newBoard,
      turn: isRoundOver ? prev.turn : nextTurn, // Keep turn indicator on current player if round ends
      lastMove: { player: isMe ? 'me' : 'opponent', domino: finalDomino, side },
      consecutivePasses: isRoundOver ? prev.consecutivePasses : 0
    }));

    if (isRoundOver) {
      setTimeout(() => handleRoundEnd(winner, newHand, newOpponentHand), 1500);
    } else {
      triggerShake();
    }
    setSelectedDomino(null);
  };

  const drawFromBoneyard = (isMe: boolean) => {
    if (gameState.boneyard.length === 0) return;

    const newBoneyard = [...gameState.boneyard];
    const drawn = newBoneyard.pop()!;

    if (isMe) {
      const newHand = [...gameState.playerHand, drawn];
      const nextState = {
        ...gameState,
        playerHand: newHand,
        boneyard: newBoneyard
      };
      setGameState(nextState);

      if (gameState.mode === 'PVP' && socketRef.current) {
        socketRef.current.emit('sync-state', {
          roomId: gameState.roomId,
          state: {
            ...nextState,
            playerHand: Array.isArray(gameState.opponentHand) ? gameState.opponentHand : [], // Swap for opponent
            opponentHand: newHand.length,
            turn: gameState.turn === 'player' ? 'opponent' : 'player' // Keep turn consistent
          }
        });
      }
    } else {
      if (gameState.mode === 'AI') {
        const newOpponentHand = [...(gameState.opponentHand as Domino[]), drawn];
        setGameState(prev => ({
          ...prev,
          opponentHand: newOpponentHand,
          boneyard: newBoneyard
        }));
      }
    }
  };

  const handlePass = (isMe: boolean) => {
    const nextTurn = isMe ? 'opponent' : 'player';
    const newConsecutivePasses = gameState.consecutivePasses + 1;

    if (newConsecutivePasses >= 2) {
      setGameState(prev => ({ ...prev, consecutivePasses: newConsecutivePasses }));
      setTimeout(() => handleRoundEnd('draw', gameState.playerHand, gameState.opponentHand), 1500);
      return;
    }

    setGameState(prev => ({
      ...prev,
      turn: nextTurn,
      consecutivePasses: newConsecutivePasses
    }));

    if (isMe && gameState.mode === 'PVP' && socketRef.current) {
      socketRef.current.emit('sync-state', {
        roomId: gameState.roomId,
        state: {
          ...gameState,
          turn: nextTurn,
          consecutivePasses: newConsecutivePasses
        }
      });
    }
  };

  // AI Logic
  useEffect(() => {
    if (gameState.mode === 'AI' && gameState.turn === 'opponent' && gameState.status === 'playing') {
      const timer = setTimeout(() => {
        const aiHand = gameState.opponentHand as Domino[];
        const playable = aiHand.filter(d => isPlayable(d));

        if (playable.length > 0) {
          let domino = playable[Math.floor(Math.random() * playable.length)];

          // AI enforcement for Egyptian Rules (Round 1, First Move)
          if (gameState.round === 1 && gameState.board.length === 0) {
            let maxDoubleInHands = -1;
            [...gameState.playerHand, ...aiHand].forEach(d => {
              if (d[0] === d[1] && d[0] > maxDoubleInHands) maxDoubleInHands = d[0];
            });
            if (maxDoubleInHands !== -1) {
              const bestDouble = aiHand.find(d => d[0] === d[1] && d[0] === maxDoubleInHands);
              if (bestDouble) domino = bestDouble;
            }
          }

          const sides = getPlayableSides(domino);
          const side = sides[Math.floor(Math.random() * sides.length)];
          handleMove(domino, side, false);
        } else if (gameState.boneyard.length > 0) {
          drawFromBoneyard(false);
        } else {
          handlePass(false);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.turn, gameState.status, gameState.mode, gameState.opponentHand, isPlayable, getPlayableSides]);

  // Copy Room ID
  const copyRoomId = () => {
    if (gameState.roomId) {
      navigator.clipboard.writeText(gameState.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (gameState.status === 'menu') {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center felt-table p-4 overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-8 md:mb-16 relative flex-shrink-0"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-12 -left-12 w-32 h-32 md:w-48 md:h-48 bg-emerald-500/10 rounded-full blur-3xl"
          />
          <div className="w-20 h-20 md:w-28 md:h-28 bg-emerald-500 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_20px_50px_rgba(16,185,129,0.4)] flex items-center justify-center mx-auto mb-6 md:mb-8 rotate-12 relative z-10">
            <Gamepad2 className="text-white w-10 h-10 md:w-14 md:h-14" />
          </div>
          <h1 className="text-4xl md:text-7xl font-display font-black tracking-tighter text-white mb-2 md:mb-4 drop-shadow-2xl">DOMINO MASTER</h1>
          <div className="flex items-center justify-center gap-2 md:gap-4">
            <div className="h-px w-8 md:w-12 bg-emerald-500/50" />
            <p className="text-emerald-400 font-bold tracking-[0.2em] md:tracking-[0.3em] uppercase text-[10px] md:text-xs">The Ultimate Strategy Experience</p>
            <div className="h-px w-8 md:w-12 bg-emerald-500/50" />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-5xl w-full px-2 md:px-4 flex-shrink-0">
          {/* AI Mode */}
          <motion.button
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={initAIGame}
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] text-left overflow-hidden transition-all hover:bg-white/10 hover:border-emerald-500/50 min-h-[160px] md:min-h-0"
          >
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Cpu className="w-24 h-24 md:w-48 md:h-48" />
            </div>
            <div className="w-10 h-10 md:w-14 md:h-14 bg-emerald-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-8 group-hover:bg-emerald-500 transition-all duration-500">
              <Cpu className="text-emerald-500 group-hover:text-white w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h3 className="text-xl md:text-3xl font-display font-bold text-white mb-2 md:mb-3">Practice vs AI</h3>
            <p className="text-stone-400 text-xs md:text-sm leading-relaxed">Sharpen your skills against our master computer opponent in a solo match.</p>
          </motion.button>

          {/* PVP Mode */}
          <motion.div
            whileHover={{ scale: 1.02, y: -5 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] text-left hover:border-blue-500/50 transition-all min-h-[280px] md:min-h-0"
          >
            <div className="w-10 h-10 md:w-14 md:h-14 bg-blue-500/20 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-8">
              <Users className="text-blue-500 w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h3 className="text-xl md:text-3xl font-display font-bold text-white mb-4 md:mb-6">Play with Friends</h3>

            <div className="space-y-3 md:space-y-4">
              <input
                type="text"
                placeholder="Your Name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-stone-600"
              />
              <div className="flex gap-2 md:gap-3">
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-stone-600"
                />
                <button
                  disabled={!nameInput || !roomInput}
                  onClick={() => joinPVPRoom(roomInput, nameInput)}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-base transition-all shadow-lg"
                >
                  JOIN
                </button>
              </div>
              <button
                disabled={!nameInput}
                onClick={() => joinPVPRoom(Math.random().toString(36).substring(7).toUpperCase(), nameInput)}
                className="w-full bg-white text-stone-900 hover:bg-stone-200 disabled:opacity-30 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-base transition-all shadow-xl"
              >
                CREATE NEW ROOM
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (gameState.status === 'waiting') {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center felt-table p-4 overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 p-8 md:p-16 rounded-[2.5rem] md:rounded-[4rem] max-w-lg w-full text-center shadow-2xl relative overflow-hidden flex-shrink-0"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 md:h-2 bg-blue-500/20">
            <motion.div
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-1/3 h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
            />
          </div>

          <div className="w-16 h-16 md:w-24 md:h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-10 relative">
            <Users className="text-blue-500 w-8 h-8 md:w-12 md:h-12" />
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-blue-500 rounded-full"
            />
          </div>

          <h2 className="text-2xl md:text-4xl font-display font-black text-white mb-2 md:mb-4">
            {gameState.connectionError ? 'Server Error' : 'Waiting for Friend'}
          </h2>
          <p className={`mb-8 md:mb-12 font-medium text-sm md:text-base ${gameState.connectionError ? 'text-red-400' : 'text-stone-400'}`}>
            {gameState.connectionError || 'Share this code to start the match.'}
          </p>
          {gameState.status === 'waiting' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={`w-2 h-2 rounded-full ${gameState.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                {gameState.isConnected ? 'Server Connected' : 'Disconnected'}
              </span>
            </div>
          )}

          <div className="bg-black/60 rounded-2xl md:rounded-3xl p-4 md:p-8 mb-8 md:mb-12 flex items-center justify-between border border-white/5 group">
            <span className="text-3xl md:text-5xl font-display font-black tracking-[0.2em] text-white">{gameState.roomId}</span>
            <button
              onClick={copyRoomId}
              className="p-3 md:p-4 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all text-stone-400 hover:text-white active:scale-90"
            >
              {copied ? <Check className="text-emerald-500 w-5 h-5 md:w-6 md:h-6" /> : <Copy className="w-5 h-5 md:w-6 md:h-6" />}
            </button>
          </div>

          <button
            onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
            className="text-stone-500 hover:text-white transition-colors flex items-center gap-2 md:gap-3 mx-auto font-bold uppercase tracking-widest text-[10px] md:text-xs"
          >
            <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" />
            Cancel Match
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      animate={isShaking ? { x: [-5, 5, -5, 5, 0] } : {}}
      className="h-screen w-screen flex flex-col felt-table overflow-hidden relative"
    >
      {/* Header */}
      <header className="p-4 md:p-6 flex flex-col gap-4 bg-black/40 backdrop-blur-xl border-b border-white/5 z-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4 md:gap-6">
            <button
              onClick={() => setGameState(prev => ({ ...prev, status: 'menu' }))}
              className="p-2 md:p-3 hover:bg-white/5 rounded-2xl transition-all text-stone-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg md:text-2xl font-display font-black tracking-tight text-white leading-none mb-1">Domino Master</h1>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-500 text-[8px] md:text-[9px] font-black uppercase rounded border border-emerald-500/30">
                  {gameState.mode}
                </span>
                {gameState.mode === 'PVP' && (
                  <span className="text-[8px] md:text-[9px] font-black text-stone-500 uppercase tracking-widest">#{gameState.roomId}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-8">
            <div className="flex items-center gap-2 md:gap-4 bg-white/5 px-3 md:px-6 py-1.5 md:py-3 rounded-xl md:rounded-2xl border border-white/5 relative overflow-hidden group">
              <div
                className="absolute inset-0 bg-emerald-500/10 transition-all duration-1000"
                style={{ width: `${(gameState.matchScore.player / WINNING_SCORE) * 100}%` }}
              />
              <Trophy className="w-4 h-4 md:w-5 md:h-5 text-yellow-500 relative z-10" />
              <div className="flex flex-col relative z-10">
                <span className="text-[7px] md:text-[9px] uppercase font-black text-stone-500 leading-none">Your Score</span>
                <span className="text-sm md:text-lg font-black text-white leading-none">{gameState.matchScore.player}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 bg-white/5 px-3 md:px-6 py-1.5 md:py-3 rounded-xl md:rounded-2xl border border-white/5 relative overflow-hidden group">
              <div
                className="absolute inset-0 bg-red-500/10 transition-all duration-1000"
                style={{ width: `${(gameState.matchScore.opponent / WINNING_SCORE) * 100}%` }}
              />
              <Cpu className="w-4 h-4 md:w-5 md:h-5 text-blue-500 relative z-10" />
              <div className="flex flex-col relative z-10">
                <span className="text-[7px] md:text-[9px] uppercase font-black text-stone-500 leading-none">Opponent</span>
                <span className="text-sm md:text-lg font-black text-white leading-none">{gameState.matchScore.opponent}</span>
              </div>
            </div>

            <button
              onClick={() => setShowInstructions(true)}
              className="p-2 md:p-3 hover:bg-white/5 rounded-2xl transition-all text-stone-400 hover:text-white"
            >
              <Info className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="w-full h-1.5 md:h-2 bg-white/5 rounded-full overflow-hidden flex gap-1 p-0.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(gameState.matchScore.player / WINNING_SCORE) * 100}%` }}
            className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          />
          <div className="flex-1" />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(gameState.matchScore.opponent / WINNING_SCORE) * 100}%` }}
            className="h-full bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          />
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Floating Background Pips */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="floating-pip text-white/10"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              fontSize: `${Math.random() * 40 + 20}px`,
              animationDelay: `${Math.random() * 10}s`,
              transform: `rotate(${Math.random() * 360}deg)`
            }}
          >
            :::
          </div>
        ))}

        {/* Opponent Info (Top Floating) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xs px-4">
          <motion.div
            animate={gameState.turn === 'opponent' ? { scale: 1.05, y: 5 } : { scale: 1, y: 0 }}
            className={`flex items-center justify-between gap-4 px-4 py-2 rounded-2xl border transition-all duration-500 ${gameState.turn === 'opponent' ? 'bg-blue-500/20 border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.2)]' : 'bg-black/40 border-white/5 backdrop-blur-md'
              }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors relative ${gameState.turn === 'opponent' ? 'bg-blue-500' : 'bg-stone-800'}`}>
                {gameState.turn === 'opponent' && (
                  <motion.div
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-blue-500 rounded-xl"
                  />
                )}
                {gameState.mode === 'AI' ? <Cpu className="w-4 h-4 text-white relative z-10" /> : <User className="w-4 h-4 text-white relative z-10" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] uppercase font-black text-stone-500 leading-none mb-1">Opponent</span>
                <span className="text-xs font-black text-white truncate max-w-[100px]">{gameState.mode === 'AI' ? 'Grandmaster AI' : gameState.opponentName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-lg">
              <Layers className="w-3 h-3 text-stone-500" />
              <span className="text-sm font-black text-white">
                {Array.isArray(gameState.opponentHand) ? gameState.opponentHand.length : gameState.opponentHand}
              </span>
            </div>
          </motion.div>
        </div>

        <div className="flex-1 w-full relative overflow-y-auto no-scrollbar py-20 px-4" ref={boardScrollingRef}>
          <div className="relative mx-auto transition-all duration-700 ease-in-out" style={{ maxWidth: '1000px', height: `${(snakeLayout[snakeLayout.length - 1]?.y || 0) + 200}px` }}>
            <AnimatePresence mode="popLayout">
              {gameState.board.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="w-32 h-24 sm:w-48 sm:h-32 md:w-80 md:h-48 border-4 border-dashed border-white/5 rounded-[1.5rem] md:rounded-[3rem] flex flex-col items-center justify-center text-white/10 font-display font-black text-lg md:text-3xl uppercase tracking-[0.2em] md:tracking-[0.3em] gap-2 md:gap-4 text-center"
                  >
                    <Sparkles className="w-6 h-6 md:w-12 md:h-12 text-emerald-500/50" />
                    START GAME
                  </motion.div>
                </div>
              ) : (
                gameState.board.map((domino, i) => {
                  const layout = snakeLayout[i];
                  if (!layout) return null;
                  return (
                    <motion.div
                      key={`${domino[0]}-${domino[1]}-${i}`}
                      layout
                      initial={{ scale: 0.4, opacity: 0, x: layout.x, y: layout.y - 20 }}
                      animate={{ scale: 1, opacity: 1, x: layout.x, y: layout.y, rotate: layout.rotate }}
                      transition={{
                        type: 'spring',
                        damping: 20,
                        stiffness: 150,
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.4 }
                      }}
                      className="absolute left-0 top-0"
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      <DominoPiece
                        domino={domino}
                        isVertical={layout.isVertical}
                        disabled
                        className="scale-[0.55] sm:scale-[0.75] md:scale-[0.9] lg:scale-100 shadow-2xl"
                      />
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Player Controls (Bottom Floating) */}
        <div className="absolute bottom-0 left-0 w-full p-2 sm:p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4 z-40">
          {/* Player Info Pill */}
          <motion.div
            animate={gameState.turn === 'player' ? { scale: 1.05, y: -2 } : { scale: 1, y: 0 }}
            className={`flex items-center gap-2 md:gap-4 px-4 md:px-6 py-1.5 md:py-2 rounded-xl md:rounded-2xl border transition-all duration-500 ${gameState.turn === 'player' ? 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'bg-black/40 border-white/5 backdrop-blur-md'
              }`}
          >
            <div className={`w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center transition-colors ${gameState.turn === 'player' ? 'bg-emerald-500' : 'bg-stone-800'}`}>
              <User className="w-3 h-3 md:w-4 md:h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[7px] md:text-[8px] uppercase font-black text-stone-500 leading-none mb-0.5 md:mb-1">You</span>
              <span className="text-[10px] md:text-xs font-black text-white">Domino Master</span>
            </div>
            {gameState.turn === 'player' && !gameState.playerHand.some(d => isPlayable(d)) && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (gameState.boneyard.length > 0) {
                    drawFromBoneyard(true);
                  } else {
                    handlePass(true);
                  }
                }}
                className="ml-1 md:ml-2 bg-emerald-500 hover:bg-emerald-600 text-white px-3 md:px-4 py-1 md:py-1.5 rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 md:gap-2"
              >
                {gameState.boneyard.length > 0 ? (
                  <>
                    <Layers className="w-2.5 h-2.5 md:w-3 md:h-3" />
                    Draw
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-2.5 h-2.5 md:w-3 md:h-3" />
                    Pass
                  </>
                )}
              </motion.button>
            )}
          </motion.div>

          {/* Player Hand */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } }
            }}
            className="w-full max-w-4xl bg-black/60 backdrop-blur-2xl rounded-[1.5rem] md:rounded-[3rem] border border-white/10 shadow-2xl p-3 md:p-8 flex flex-wrap gap-2 md:gap-4 justify-center relative max-h-[28vh] md:max-h-none overflow-y-auto no-scrollbar"
          >
            {gameState.playerHand.map((domino, i) => {
              const playable = isPlayable(domino);
              const isSelected = selectedDomino?.index === i;
              const sides = getPlayableSides(domino);

              return (
                <motion.div
                  key={`${domino[0]}-${domino[1]}-${i}`}
                  layout
                  variants={{
                    hidden: { y: 20, opacity: 0 },
                    visible: { y: 0, opacity: 1 }
                  }}
                  whileHover={playable ? { y: -10, scale: 1.05 } : {}}
                  whileTap={playable ? { scale: 0.95 } : {}}
                  className="relative"
                >
                  <DominoPiece
                    domino={domino}
                    isPlayable={playable && gameState.turn === 'player'}
                    onClick={() => {
                      if (gameState.turn !== 'player' || !playable) return;

                      if (gameState.board.length === 0) {
                        handleMove(domino, 'right', true);
                      } else if (sides.length === 1) {
                        handleMove(domino, sides[0], true);
                      } else {
                        setSelectedDomino(isSelected ? null : { index: i, domino });
                      }
                    }}
                    className={`${isSelected ? 'ring-2 md:ring-4 ring-white z-50' : ''} scale-[0.6] sm:scale-[0.85] lg:scale-100 transition-all duration-300 ${playable ? 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'opacity-60 saturate-50'}`}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </main>

      {/* Selection Overlay (Fixed) */}
      <AnimatePresence>
        {selectedDomino && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
            onClick={() => setSelectedDomino(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 50, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 50, opacity: 0 }}
              className="bg-stone-900 border border-white/10 p-6 md:p-10 rounded-[2.5rem] md:rounded-[4rem] max-w-sm w-full shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col items-center gap-6 md:gap-8"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center gap-3 md:gap-4">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-500/20 rounded-2xl md:rounded-3xl flex items-center justify-center">
                  <Sparkles className="text-emerald-500 w-6 h-6 md:w-8 md:h-8" />
                </div>
                <h3 className="text-xl md:text-2xl font-display font-black text-white text-center leading-tight">CHOOSE YOUR MOVE</h3>
                <p className="text-stone-400 text-xs md:text-sm font-medium text-center">This piece can be played on either end of the board.</p>
              </div>

              <div className="flex flex-col w-full gap-2 md:gap-3">
                <button
                  onClick={() => handleMove(selectedDomino.domino, 'left', true)}
                  className="w-full bg-white text-stone-900 hover:bg-emerald-500 hover:text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl text-sm md:text-base transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
                >
                  PLAY ON LEFT END
                </button>
                <button
                  onClick={() => handleMove(selectedDomino.domino, 'right', true)}
                  className="w-full bg-white text-stone-900 hover:bg-emerald-500 hover:text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl text-sm md:text-base transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
                >
                  PLAY ON RIGHT END
                </button>
              </div>

              <button
                onClick={() => setSelectedDomino(null)}
                className="text-stone-500 hover:text-white font-bold uppercase text-[10px] md:text-xs tracking-[0.2em] transition-colors"
              >
                Cancel Move
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Modal */}
      <AnimatePresence>
        {['won', 'lost', 'draw'].includes(gameState.status) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div
              initial={{ scale: 0.7, y: 100, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              className="bg-stone-900 border border-white/10 p-16 rounded-[4rem] max-w-lg w-full text-center shadow-[0_0_150px_rgba(0,0,0,0.8)] relative overflow-hidden"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute -top-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px]"
              />

              <div className={`w-32 h-32 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 relative z-10 ${gameState.status === 'won' ? 'bg-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.4)]' : 'bg-stone-700 shadow-2xl'
                }`}>
                <Trophy className={`w-16 h-16 ${gameState.status === 'won' ? 'text-white' : 'text-stone-400'}`} />
              </div>

              <h2 className="text-6xl font-display font-black mb-6 tracking-tighter text-white">
                {gameState.status === 'won' ? 'VICTORY' :
                  gameState.status === 'lost' ? 'DEFEAT' : 'STALEMATE'}
              </h2>

              <p className="text-stone-400 mb-12 text-xl font-medium leading-relaxed">
                {gameState.status === 'won' ? 'You dominated the board! A true masterclass in strategy and foresight.' :
                  gameState.status === 'lost' ? 'A valiant effort. The opponent was just one step ahead this time.' :
                    'A perfect match of wits. Neither side could find the final opening.'}
              </p>

              <div className="flex flex-col gap-4 w-full relative z-10">
                {(gameState.matchScore.player < WINNING_SCORE && gameState.matchScore.opponent < WINNING_SCORE) ? (
                  <button
                    onClick={initAIGame}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 md:py-6 rounded-2xl md:rounded-3xl transition-all shadow-lg flex items-center justify-center gap-4 text-xl md:text-2xl active:scale-95"
                  >
                    <RotateCcw className="w-6 h-6 md:w-8 md:h-8" />
                    NEXT ROUND
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setGameState(prev => ({
                        ...prev,
                        matchScore: { player: 0, opponent: 0 },
                        round: 1,
                        lastWinner: null
                      }));
                      initAIGame();
                    }}
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-black py-4 md:py-6 rounded-2xl md:rounded-3xl transition-all shadow-lg flex items-center justify-center gap-4 text-xl md:text-2xl active:scale-95"
                  >
                    <Trophy className="w-6 h-6 md:w-8 md:h-8" />
                    NEW MATCH
                  </button>
                )}

                <button
                  onClick={() => {
                    if (socketRef.current) socketRef.current.disconnect();
                    socketRef.current = null;
                    setGameState({
                      playerHand: [],
                      opponentHand: 0,
                      boneyard: [],
                      board: [],
                      turn: 'player',
                      status: 'menu',
                      lastMove: null,
                      mode: 'AI',
                      matchScore: { player: 0, opponent: 0 },
                      round: 1,
                      consecutivePasses: 0,
                      lastWinner: null
                    });
                  }}
                  className="w-full bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white font-bold py-3 md:py-4 rounded-xl md:rounded-2xl transition-all flex items-center justify-center gap-3 text-sm active:scale-95"
                >
                  <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
                  QUIT TO MENU
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions Modal */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInstructions(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              onClick={e => e.stopPropagation()}
              className="bg-stone-900 border border-white/10 p-12 rounded-[4rem] max-w-2xl w-full shadow-2xl"
            >
              <h2 className="text-4xl font-display font-black mb-10 flex items-center gap-4 text-white">
                <Info className="text-emerald-500 w-10 h-10" />
                MASTER THE RULES
              </h2>

              <div className="space-y-8 text-stone-300 font-medium">
                <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0 font-black text-lg">1</div>
                  <p className="text-xl leading-snug">Start with 7 pieces. Be the first to empty your hand to claim ultimate victory.</p>
                </div>
                <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0 font-black text-lg">2</div>
                  <p className="text-xl leading-snug">Match the numbers on your domino to the open ends of the board. Strategy is key.</p>
                </div>
                <div className="flex gap-6">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center flex-shrink-0 font-black text-lg">3</div>
                  <p className="text-xl leading-snug">If you're stuck, draw from the boneyard. If it's empty, you must pass your turn.</p>
                </div>
              </div>

              <button
                onClick={() => setShowInstructions(false)}
                className="mt-16 w-full bg-white text-stone-900 font-black py-5 rounded-3xl hover:bg-stone-200 transition-all text-xl shadow-xl"
              >
                I'M READY
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Turn Indicator Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={gameState.turn}
            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
            animate={{ opacity: 0.03, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 2, rotate: 10 }}
            transition={{ duration: 1.5, ease: "anticipate" }}
            className="text-[25vw] font-display font-black uppercase tracking-[0.2em] text-white whitespace-nowrap"
          >
            {gameState.turn === 'player' ? 'YOUR TURN' : "OPPONENT"}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
