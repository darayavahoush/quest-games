/**
 * Voice Hurdle Race — visual themes per level.
 *
 * Level 1 keeps the original pixel-identical look (Puppy Practice).
 * Levels 2-5 get a distinct world + companion creature so the
 * race feels like a real progression, not a re-skin.
 */

export type CreatureType = 'dog' | 'bunny' | 'fox' | 'dragon' | 'unicorn';

export interface RaceTheme {
  creature: CreatureType;

  sky: {
    top: string;
    mid: string;
    bottom: string;
  };

  mountain: {
    fill: string;
    snow: string;
  };

  hills: string;

  tree: {
    trunk: string;
    top: string;
    highlight: string;
    fruit: string;
  };

  grassDetail: string;

  road: {
    grassEdge: string;
    gradientTop: string;
    gradientMid: string;
    gradientBottom: string;
    highlight: string;
    detail1: string;
    detail2: string;
  };

  flowers: {
    stem: string;
    petalA: string;
    petalB: string;
    center: string;
  };
}

export const THEMES: Record<number, RaceTheme> = {
  // Level 1 — Puppy Practice (original look, untouched)
  1: {
    creature: 'dog',
    sky: { top: '#55c8ff', mid: '#c3efff', bottom: '#f0fbff' },
    mountain: { fill: '#79add1', snow: 'rgba(245,252,255,.75)' },
    hills: '#72d178',
    tree: {
      trunk: '#855126',
      top: '#279b47',
      highlight: '#4fc45d',
      fruit: '#ef4444',
    },
    grassDetail: 'rgba(25,130,55,.45)',
    road: {
      grassEdge: '#48ad49',
      gradientTop: '#e5aa65',
      gradientMid: '#c98447',
      gradientBottom: '#9d542e',
      highlight: 'rgba(255,225,170,.5)',
      detail1: 'rgba(255,230,185,.28)',
      detail2: 'rgba(100,50,25,.12)',
    },
    flowers: {
      stem: '#238c3b',
      petalA: '#f472b6',
      petalB: '#a855f7',
      center: '#fde047',
    },
  },

  // Level 2 — Bunny / Spring Meadow (soft pinks, mint greens)
  2: {
    creature: 'bunny',
    sky: { top: '#a8e6ff', mid: '#d9f5f0', bottom: '#fef6fb' },
    mountain: { fill: '#b9a8d4', snow: 'rgba(255,250,253,.8)' },
    hills: '#a3e6b8',
    tree: {
      trunk: '#8a6a4a',
      top: '#f9a8d4',
      highlight: '#fbcfe8',
      fruit: '#fda4af',
    },
    grassDetail: 'rgba(180,120,170,.4)',
    road: {
      grassEdge: '#7ed99a',
      gradientTop: '#f0c8dc',
      gradientMid: '#dba3c0',
      gradientBottom: '#b97fa0',
      highlight: 'rgba(255,240,250,.5)',
      detail1: 'rgba(255,235,245,.3)',
      detail2: 'rgba(120,60,100,.12)',
    },
    flowers: {
      stem: '#4ade80',
      petalA: '#fbcfe8',
      petalB: '#c4b5fd',
      center: '#fef08a',
    },
  },

  // Level 3 — Fox / Autumn Forest (burnt orange, gold)
  3: {
    creature: 'fox',
    sky: { top: '#ffb066', mid: '#ffd9a0', bottom: '#fff3dc' },
    mountain: { fill: '#c17a4a', snow: 'rgba(255,240,220,.6)' },
    hills: '#b8862f',
    tree: {
      trunk: '#6b3f1f',
      top: '#d97706',
      highlight: '#f59e0b',
      fruit: '#dc2626',
    },
    grassDetail: 'rgba(146,90,30,.45)',
    road: {
      grassEdge: '#a86a2e',
      gradientTop: '#e0a35e',
      gradientMid: '#b8763b',
      gradientBottom: '#8a4f22',
      highlight: 'rgba(255,220,160,.5)',
      detail1: 'rgba(255,210,150,.28)',
      detail2: 'rgba(80,40,15,.15)',
    },
    flowers: {
      stem: '#92400e',
      petalA: '#fbbf24',
      petalB: '#f97316',
      center: '#fef3c7',
    },
  },

  // Level 4 — Baby Dragon / Misty Dusk Mountains (purple-teal, moody)
  4: {
    creature: 'dragon',
    sky: { top: '#4c3a70', mid: '#6b5b8f', bottom: '#9c8fb5' },
    mountain: { fill: '#4a3a5e', snow: 'rgba(200,220,230,.5)' },
    hills: '#2f6b5e',
    tree: {
      trunk: '#3f2a4a',
      top: '#1f7a6e',
      highlight: '#2fae9c',
      fruit: '#a855f7',
    },
    grassDetail: 'rgba(80,150,140,.4)',
    road: {
      grassEdge: '#235c4f',
      gradientTop: '#6b5580',
      gradientMid: '#4a3d63',
      gradientBottom: '#302847',
      highlight: 'rgba(190,170,220,.4)',
      detail1: 'rgba(180,160,210,.25)',
      detail2: 'rgba(30,20,45,.2)',
    },
    flowers: {
      stem: '#2f6b5e',
      petalA: '#a855f7',
      petalB: '#38bdf8',
      center: '#e9d5ff',
    },
  },

  // Level 5 — Unicorn / Dreamy Aurora Meadow (lavender-pink-gold)
  5: {
    creature: 'unicorn',
    sky: { top: '#c4b5fd', mid: '#f9d5e5', bottom: '#fff8e7' },
    mountain: { fill: '#a78bda', snow: 'rgba(255,250,240,.8)' },
    hills: '#f4b8d6',
    tree: {
      trunk: '#7c5a8a',
      top: '#e879f9',
      highlight: '#f0abfc',
      fruit: '#fbbf24',
    },
    grassDetail: 'rgba(200,150,220,.4)',
    road: {
      grassEdge: '#d8a8dd',
      gradientTop: '#fde3f0',
      gradientMid: '#f0c1e0',
      gradientBottom: '#dba0cf',
      highlight: 'rgba(255,250,255,.55)',
      detail1: 'rgba(255,245,255,.3)',
      detail2: 'rgba(140,90,150,.12)',
    },
    flowers: {
      stem: '#c084fc',
      petalA: '#fde047',
      petalB: '#67e8f9',
      center: '#ffffff',
    },
  },
};

export function getTheme(levelId: number): RaceTheme {
  return THEMES[levelId] ?? THEMES[1];
}
