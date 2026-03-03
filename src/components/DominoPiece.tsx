import React from 'react';
import { motion } from 'framer-motion';
import { Domino } from '../types';

interface DominoPieceProps {
  domino: Domino;
  onClick?: () => void;
  disabled?: boolean;
  isVertical?: boolean;
  isFaceDown?: boolean;
  className?: string;
  isPlayable?: boolean;
  highlightSide?: 'left' | 'right' | 'both' | null;
}

const Dot = ({ position }: { position: number }) => (
  <div className="w-1.5 h-1.5 rounded-full bg-stone-900 shadow-inner" />
);

const Dots = ({ value }: { value: number }) => {
  const dotPositions = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  const positions = dotPositions[value as keyof typeof dotPositions] || [];

  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 place-items-center">
      {[...Array(9)].map((_, i) => (
        <div key={i} className="w-1 h-1 sm:w-1.5 sm:h-1.5 md:w-2 md:h-2 flex items-center justify-center">
          {positions.includes(i) && <Dot position={i} />}
        </div>
      ))}
    </div>
  );
};

export const DominoPiece: React.FC<DominoPieceProps> = ({
  domino,
  onClick,
  disabled,
  isVertical = true,
  isFaceDown = false,
  className = "",
  isPlayable = false,
  highlightSide = null,
}) => {
  const [v1, v2] = domino;

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      whileHover={!disabled && !isFaceDown ? {
        scale: 1.05,
        y: -5,
        rotate: isVertical ? 2 : 1,
        zIndex: 50,
        boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.5)"
      } : {}}
      whileTap={!disabled && !isFaceDown ? { scale: 0.95 } : {}}
      onClick={!disabled ? onClick : undefined}
      className={`
        relative rounded-md md:rounded-lg cursor-pointer select-none flex-shrink-0
        ${isVertical ? 'w-8 h-16 sm:w-10 sm:h-20 md:w-12 md:h-24' : 'w-16 h-8 sm:w-20 h-10 md:w-24 md:h-12'}
        ${isFaceDown
          ? 'bg-gradient-to-br from-stone-300 via-stone-400 to-stone-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_16px_rgba(0,0,0,0.4)]'
          : 'bg-gradient-to-br from-white via-white to-stone-200 shadow-[inset_0_1px_1px_white,0_8px_16px_rgba(0,0,0,0.3)]'}
        border border-stone-300/50
        transition-all duration-300
        ${className}
      `}
    >
      {isFaceDown ? (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          <div className="w-full h-full opacity-5 flex flex-wrap gap-1 p-1">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 bg-stone-900 rounded-full" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-stone-500/20 rounded-full flex items-center justify-center">
              <div className="w-4 h-4 bg-stone-500/20 rounded-full" />
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} h-full w-full items-center justify-around p-1.5`}>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center"
          >
            <Dots value={v1} />
          </motion.div>
          <div className={`${isVertical ? 'w-full h-0.5' : 'h-full w-0.5'} bg-stone-300/80 rounded-full mx-1`} />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center"
          >
            <Dots value={v2} />
          </motion.div>
        </div>
      )}

      {/* Playable indicators */}
      {highlightSide === 'left' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1.2 }}
          className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-500 rounded-full shadow-[0_0_20px_rgba(16,185,129,1)] z-10 flex items-center justify-center text-white text-[10px] font-bold"
        >
          L
        </motion.div>
      )}
      {highlightSide === 'right' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1.2 }}
          className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-500 rounded-full shadow-[0_0_20px_rgba(16,185,129,1)] z-10 flex items-center justify-center text-white text-[10px] font-bold"
        >
          R
        </motion.div>
      )}
    </motion.div>
  );
};
