/**
 * Voice Hurdle Race — visual themes per level.
 *
 * Each level is a distinct alien planet with its own companion
 * creature, so progression feels like traveling further into space,
 * not a re-skin of the same world.
 */

export type CreatureType = 'blip' | 'zog' | 'glorb' | 'cosmo' | 'comet';

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
  // Level 1 — Blip / Green Crater Plains (soft lime, friendly)
  1: {
    creature: 'blip',
    sky: { top: '#2a1a5e', mid: '#5b3a9e', bottom: '#a685d6' },
    mountain: { fill: '#4a3577', snow: 'rgba(200,255,210,.55)' },
    hills: '#3d8a5c',
    tree: {
      trunk: '#6b4a8a',
      top: '#5fd48a',
      highlight: '#8ef0ae',
      fruit: '#baff5c',
    },
    grassDetail: 'rgba(90,220,140,.4)',
    road: {
      grassEdge: '#3d8a5c',
      gradientTop: '#8a6ac4',
      gradientMid: '#6a4a9e',
      gradientBottom: '#4a3277',
      highlight: 'rgba(200,255,220,.4)',
      detail1: 'rgba(180,255,200,.25)',
      detail2: 'rgba(30,15,55,.2)',
    },
    flowers: {
      stem: '#3d8a5c',
      petalA: '#baff5c',
      petalB: '#5fd48a',
      center: '#fef9c3',
    },
  },

  // Level 2 — Zog / Chrome Circuit Desert (orange-teal, techy)
  2: {
    creature: 'zog',
    sky: { top: '#7a2e2e', mid: '#c65d3a', bottom: '#ffb066' },
    mountain: { fill: '#5a3a3a', snow: 'rgba(255,220,180,.5)' },
    hills: '#3a5a5a',
    tree: {
      trunk: '#4a3a3a',
      top: '#2fbfae',
      highlight: '#5fe8d6',
      fruit: '#ffcc4a',
    },
    grassDetail: 'rgba(50,190,175,.4)',
    road: {
      grassEdge: '#3a5a5a',
      gradientTop: '#d67a4a',
      gradientMid: '#a8502e',
      gradientBottom: '#6e2f1a',
      highlight: 'rgba(255,210,160,.45)',
      detail1: 'rgba(255,200,150,.28)',
      detail2: 'rgba(40,15,10,.2)',
    },
    flowers: {
      stem: '#2fbfae',
      petalA: '#ffcc4a',
      petalB: '#5fe8d6',
      center: '#fff4d6',
    },
  },

  // Level 3 — Glorb / Bioluminescent Swamp Moon (deep purple, glowy)
  3: {
    creature: 'glorb',
    sky: { top: '#1a0f3d', mid: '#3a1f6e', bottom: '#6b3fa0' },
    mountain: { fill: '#2a1a4a', snow: 'rgba(180,255,240,.4)' },
    hills: '#2f4a3a',
    tree: {
      trunk: '#3a2a52',
      top: '#3fd6a8',
      highlight: '#7fffd4',
      fruit: '#ff6ec7',
    },
    grassDetail: 'rgba(63,214,168,.45)',
    road: {
      grassEdge: '#2f4a3a',
      gradientTop: '#5a3a8a',
      gradientMid: '#3f2566',
      gradientBottom: '#241645',
      highlight: 'rgba(150,255,230,.35)',
      detail1: 'rgba(130,255,220,.22)',
      detail2: 'rgba(15,10,30,.25)',
    },
    flowers: {
      stem: '#3fd6a8',
      petalA: '#ff6ec7',
      petalB: '#7fffd4',
      center: '#e9d5ff',
    },
  },

  // Level 4 — Cosmo / Red Rock Frontier (mars-red, dusty)
  4: {
    creature: 'cosmo',
    sky: { top: '#3a1010', mid: '#7a2e1e', bottom: '#c96b3a' },
    mountain: { fill: '#5a2a1a', snow: 'rgba(255,200,170,.4)' },
    hills: '#6e3520',
    tree: {
      trunk: '#4a2515',
      top: '#8a4a2a',
      highlight: '#c96b3a',
      fruit: '#ffd54a',
    },
    grassDetail: 'rgba(160,80,50,.4)',
    road: {
      grassEdge: '#6e3520',
      gradientTop: '#a85a35',
      gradientMid: '#7a3a1f',
      gradientBottom: '#4a2210',
      highlight: 'rgba(255,190,150,.4)',
      detail1: 'rgba(255,180,140,.25)',
      detail2: 'rgba(30,12,5,.25)',
    },
    flowers: {
      stem: '#8a4a2a',
      petalA: '#ffd54a',
      petalB: '#ff8a5c',
      center: '#fff4d6',
    },
  },

  // Level 5 — Comet / Starfield Finish Line (deep space navy, sparkly)
  5: {
    creature: 'comet',
    sky: { top: '#05061a', mid: '#131b4a', bottom: '#3a3f8a' },
    mountain: { fill: '#1a1f4a', snow: 'rgba(220,230,255,.6)' },
    hills: '#20265a',
    tree: {
      trunk: '#2a2f6a',
      top: '#5a6aff',
      highlight: '#9fb0ff',
      fruit: '#ffe94a',
    },
    grassDetail: 'rgba(150,170,255,.4)',
    road: {
      grassEdge: '#20265a',
      gradientTop: '#4a4f9e',
      gradientMid: '#2f3370',
      gradientBottom: '#181c45',
      highlight: 'rgba(220,230,255,.45)',
      detail1: 'rgba(200,215,255,.3)',
      detail2: 'rgba(10,10,30,.25)',
    },
    flowers: {
      stem: '#5a6aff',
      petalA: '#ffe94a',
      petalB: '#9fb0ff',
      center: '#ffffff',
    },
  },
};

export function getTheme(levelId: number): RaceTheme {
  return THEMES[levelId] ?? THEMES[1];
}
