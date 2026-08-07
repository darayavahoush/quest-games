/**
 * Level Selection Page for Voice Hurdle Race
 * Displays all levels with unlock status and star ratings in a premium consistent design
 */

import { useEffect, useState } from 'react';
import { LEVELS, LevelProgress, getLevelProgress } from './levels';
import { Badge, StarRating, Button } from '../components/ui';
import { Sidebar } from '../components/ui';
import { KID_SIDEBAR_ITEMS } from '../lib/kidSidebarItems';
import { useAuth } from '../context/AuthContext';

interface LevelSelectionProps {
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
}

const CARD_THEMES = [
  { from: '#1e3a8a', border: '#60A5FA', glow: 'rgba(96,165,250,0.15)', emoji: '🐶' },
  { from: '#065f46', border: '#A8FF6F', glow: 'rgba(168,255,111,0.15)', emoji: '🏃' },
  { from: '#7c2d12', border: '#FAC775', glow: 'rgba(250,199,117,0.15)', emoji: '🏁' },
  { from: '#581c87', border: '#F472B6', glow: 'rgba(244,114,182,0.15)', emoji: '🏆' },
];

export default function LevelSelection({ onSelectLevel, onBack }: LevelSelectionProps) {
  const [levelProgress, setLevelProgress] = useState<LevelProgress[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    setLevelProgress(getLevelProgress());
  }, []);

  const totalStars = levelProgress.reduce((sum, p) => sum + (p.stars || 0), 0);
  const maxStars = LEVELS.length * 3;

  const { patient, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <Sidebar role="kid" items={KID_SIDEBAR_ITEMS} name={patient?.first_name} onLogout={logout} />
      <div className="flex-1 text-white flex flex-col font-sans overflow-y-auto" style={{
        background: 'radial-gradient(ellipse at 50% -10%, #1e3a8a 0%, #0d0d1a 60%)'
      }}>

      {/* Stats strip — total stars is unique to this page, not shown in GameNavbar */}
      <div className="flex items-center justify-center gap-2 px-6 py-2.5 border-b border-white/5 bg-black/10">
        <span className="text-brand-amber font-bold text-sm">⭐ {totalStars} / {maxStars}</span>
        {totalStars === maxStars && (
          <span className="text-[10px] bg-brand-amber/20 text-brand-amber px-2 py-0.5 rounded-full font-bold">Perfect!</span>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 w-full flex-1">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl font-black text-white">
            Choose a <span className="text-brand-green">Race Level!</span>
          </h1>
          <p className="text-white/40 mt-2 text-sm">Use your voice to jump and clear obstacles 🏁</p>
        </div>

        {/* Level grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LEVELS.map((level, idx) => {
            const progress = levelProgress.find(p => p.levelId === level.id) || {
              stars: 0,
              unlocked: idx === 0, // Fallback unlock first level
              completed: false
            };

            const unlocked = progress.unlocked;
            const theme = CARD_THEMES[idx % CARD_THEMES.length];
            const isHover = hoveredId === level.id;

            return (
              <button
                key={level.id}
                onClick={() => unlocked && onSelectLevel(level.id)}
                onMouseEnter={() => setHoveredId(level.id)}
                onMouseLeave={() => setHoveredId(null)}
                disabled={!unlocked}
                className="relative text-left rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  background: `linear-gradient(135deg, ${theme.from}, #12122A)`,
                  border: `2px solid ${unlocked ? theme.border : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isHover && unlocked ? `0 0 30px ${theme.glow}` : 'none',
                  transform: isHover && unlocked ? 'scale(1.03)' : 'scale(1)',
                  opacity: unlocked ? 1 : 0.5,
                }}
              >
                {/* Locked overlay */}
                {!unlocked && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
                    <span className="text-4xl mb-2">🔒</span>
                    <span className="text-white/50 text-xs font-semibold">
                      Complete Level {idx} first
                    </span>
                  </div>
                )}

                <div className="p-5 flex flex-col h-full justify-between">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-5xl">{theme.emoji}</span>
                    <div className="flex flex-col items-end gap-1">
                      <Badge color="green">{level.duration}s Race</Badge>
                    </div>
                  </div>

                  {/* Level details */}
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-white text-lg leading-tight mb-1">
                      Level {level.id}: {level.name}
                    </h3>
                    <p className="text-white/40 text-xs mb-4">{level.description}</p>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-white/50 border-t border-white/5 pt-3 mb-4">
                      <div className="flex items-center gap-1.5">
                        <span>🚧</span> Hurdles: <strong className="text-white">{level.numHurdles}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>⏱️</span> Spacing: <strong className="text-white">{level.hurdleSpacing}px</strong>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <span>🎵</span> Pitch: <strong className="text-white">{level.targetPitch}Hz</strong>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <span>🔊</span> Loud: <strong className="text-white">{level.targetLoudness}dB</strong>
                      </div>
                    </div>
                  </div>

                  {/* Rating / Actions footer */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <div className="flex gap-0.5">
                      <StarRating stars={progress.stars} max={3} size="sm" />
                    </div>
                    {unlocked && (
                      <span className="text-xs font-bold transition-all duration-200"
                            style={{ color: isHover ? theme.border : 'rgba(255,255,255,0.3)' }}>
                        {progress.completed ? 'Play again →' : 'Start Race →'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom Back Button */}
        <div className="flex justify-center mt-10">
          <Button variant="ghost" size="md" onClick={onBack}>
            ← Back to Portal Select
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
