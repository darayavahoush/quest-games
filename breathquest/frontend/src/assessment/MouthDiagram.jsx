/* SVG Sagittal (side-view) Mouth Diagrams — light theme version */
import { T } from "./constants";

export function MouthDiagram({ svgKey }) {
  const Outline = () => (
    <g>
      <path d="M 20 10 Q 20 160 60 175 Q 100 185 130 175 Q 155 160 155 130 Q 155 80 130 40 Q 110 10 80 8 Q 50 6 20 10 Z"
        fill="#fef3e8" stroke="#e0c8b0" strokeWidth="1.5"/>
      <path d="M 42 55 Q 70 48 105 52 Q 120 54 128 62"
        stroke="#c4a080" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M 128 62 Q 138 72 135 88 Q 132 98 125 100"
        stroke="#c4a080" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <rect x="38" y="58" width="18" height="9" rx="2" fill="#e8ddd0" opacity="0.8"/>
      <rect x="38" y="95" width="18" height="9" rx="2" fill="#e8ddd0" opacity="0.8"/>
      <path d="M 22 72 Q 32 64 42 68 Q 38 76 22 72 Z" fill="#e8a090" opacity="0.7"/>
      <path d="M 22 92 Q 32 100 42 96 Q 38 88 22 92 Z" fill="#e8a090" opacity="0.7"/>
      <path d="M 125 100 Q 140 115 138 145 Q 136 160 128 170"
        stroke="#e0c8b0" strokeWidth="1.5" fill="none"/>
      <path d="M 20 10 Q 15 35 20 55 Q 26 58 32 54 Q 28 40 30 20"
        fill="#fef3e8" stroke="#e0c8b0" strokeWidth="1"/>
    </g>
  );

  const tongues = {
    low_flat:     <path d="M 40 120 Q 70 118 100 115 Q 120 113 130 118 Q 125 130 100 132 Q 70 133 40 130 Z" fill="#e87070" opacity="0.85"/>,
    mid_neutral:  <path d="M 40 115 Q 70 108 100 106 Q 120 105 130 112 Q 125 124 100 126 Q 70 128 40 124 Z" fill="#e87070" opacity="0.85"/>,
    high_front:   <path d="M 40 108 Q 60 96 80 92 Q 90 91 95 96 Q 100 104 110 110 Q 120 114 128 116 Q 124 128 100 128 Q 70 128 40 122 Z" fill="#e87070" opacity="0.85"/>,
    high_back:    <path d="M 40 118 Q 70 116 95 112 Q 112 104 125 98 Q 132 106 128 118 Q 120 128 95 130 Q 70 132 40 128 Z" fill="#e87070" opacity="0.85"/>,
    mid_front:    <path d="M 40 112 Q 60 104 80 100 Q 95 99 105 106 Q 115 112 125 114 Q 122 126 95 128 Q 70 130 40 122 Z" fill="#e87070" opacity="0.85"/>,
    mid_back:     <path d="M 40 116 Q 70 114 95 110 Q 112 106 122 100 Q 130 108 128 120 Q 124 130 95 132 Q 68 132 40 126 Z" fill="#e87070" opacity="0.85"/>,
    tip_alveolar: <path d="M 40 116 Q 68 112 88 108 Q 96 100 92 88 Q 96 82 100 90 Q 102 100 108 108 Q 120 112 128 114 Q 124 126 95 128 Q 68 130 40 124 Z" fill="#e87070" opacity="0.85"/>,
    tip_dental:   <path d="M 40 112 Q 65 106 82 98 Q 88 88 90 82 Q 93 78 95 84 Q 94 94 90 100 Q 100 104 115 110 Q 124 114 128 116 Q 124 128 95 128 Q 68 130 40 122 Z" fill="#e87070" opacity="0.85"/>,
    back_raised:  <path d="M 40 118 Q 70 116 95 114 Q 108 110 118 100 Q 126 90 130 94 Q 134 100 130 110 Q 126 122 100 128 Q 70 132 40 126 Z" fill="#e87070" opacity="0.85"/>,
    retroflex:    <path d="M 40 118 Q 65 114 82 110 Q 88 104 86 92 Q 90 84 96 90 Q 98 98 94 108 Q 108 112 122 114 Q 126 126 95 130 Q 68 132 40 126 Z" fill="#e87070" opacity="0.85"/>,
    lateral:      <path d="M 40 112 Q 64 106 82 100 Q 90 90 92 84 Q 96 80 99 86 Q 100 96 96 104 Q 108 108 122 112 Q 126 124 95 128 Q 68 130 40 122 Z" fill="#e87070" opacity="0.85"/>,
    near_ridge:   <path d="M 40 115 Q 65 108 84 100 Q 92 93 93 90 Q 96 86 99 90 Q 99 96 96 102 Q 108 108 122 112 Q 126 124 95 128 Q 68 130 40 122 Z" fill="#e87070" opacity="0.85"/>,
    postalveolar: <path d="M 40 116 Q 65 110 84 104 Q 95 98 100 94 Q 106 90 110 96 Q 110 104 108 110 Q 118 112 126 114 Q 124 126 95 130 Q 68 132 40 124 Z" fill="#e87070" opacity="0.85"/>,
    palatal:      <path d="M 40 112 Q 58 102 74 94 Q 86 87 92 90 Q 98 96 100 104 Q 110 110 122 112 Q 124 124 95 128 Q 68 130 40 120 Z" fill="#e87070" opacity="0.85"/>,
  };

  const lipsClosed = <path d="M 14 80 Q 22 76 32 80 Q 22 84 14 80 Z" fill="#d87070" opacity="0.9"/>;
  const lipsRound = <ellipse cx="22" cy="80" rx="10" ry="7" fill="none" stroke={T.accent} strokeWidth="2"/>;
  const AirArrow = ({ d, label }) => (
    <g>
      <path d={d} stroke="#3b82f6" strokeWidth="1.8" fill="none" strokeDasharray="4,2" markerEnd="url(#arr)" opacity="0.7"/>
      {label && <text x="18" y="28" fill="#3b82f6" fontSize="8" opacity="0.7">{label}</text>}
    </g>
  );
  const ContactDot = ({ cx, cy }) => (
    <circle cx={cx} cy={cy} r="5" fill={T.accent} opacity="0.9">
      <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" repeatCount="indefinite"/>
    </circle>
  );

  const configs = {
    front_open:    { tongue:tongues.low_flat, lips:null, air:<AirArrow d="M 16 55 Q 12 40 16 25 Q 18 18 22 15" label="air out"/>, dot:null },
    back_open:     { tongue:tongues.low_flat, lips:null, air:<AirArrow d="M 16 55 Q 12 40 16 25"/>, dot:null },
    front_high:    { tongue:tongues.high_front, lips:null, air:<AirArrow d="M 16 55 Q 12 38 16 22"/>, dot:null },
    back_high:     { tongue:tongues.high_back, lips:lipsRound, air:<AirArrow d="M 16 55 Q 12 38 16 22"/>, dot:null },
    front_mid:     { tongue:tongues.mid_front, lips:null, air:null, dot:null },
    mid_mid:       { tongue:tongues.mid_neutral, lips:null, air:null, dot:null },
    mid_low:       { tongue:tongues.mid_neutral, lips:null, air:null, dot:null },
    back_low:      { tongue:tongues.mid_back, lips:lipsRound, air:null, dot:null },
    bilabial_stop: { tongue:tongues.mid_neutral, lips:lipsClosed, air:null, dot:null },
    alveolar_stop: { tongue:tongues.tip_alveolar, lips:null, air:null, dot:<ContactDot cx={92} cy={86}/> },
    velar_stop:    { tongue:tongues.back_raised, lips:null, air:null, dot:<ContactDot cx={124} cy={96}/> },
    labiodental:   { tongue:tongues.mid_neutral, lips:null, air:<AirArrow d="M 34 72 Q 28 60 20 48 Q 16 36 16 22"/>, dot:null },
    dental:        { tongue:tongues.tip_dental, lips:null, air:<AirArrow d="M 36 70 Q 26 52 18 34 Q 16 26 16 20"/>, dot:null },
    alveolar_fric: { tongue:tongues.near_ridge, lips:null, air:<AirArrow d="M 80 86 Q 60 72 40 58 Q 28 46 18 30"/>, dot:null },
    postalveolar:  { tongue:tongues.postalveolar, lips:lipsRound, air:<AirArrow d="M 95 90 Q 72 72 50 56 Q 34 44 20 28"/>, dot:null },
    glottal:       { tongue:tongues.mid_neutral, lips:null, air:<AirArrow d="M 130 130 Q 120 100 80 70 Q 50 50 22 28"/>, dot:null },
    bilabial_nasal:{ tongue:tongues.mid_neutral, lips:lipsClosed, air:<AirArrow d="M 22 30 Q 18 22 16 12" label="→ nose"/>, dot:null },
    alveolar_nasal:{ tongue:tongues.tip_alveolar, lips:null, air:<AirArrow d="M 22 30 Q 18 22 16 12"/>, dot:<ContactDot cx={92} cy={86}/> },
    velar_nasal:   { tongue:tongues.back_raised, lips:null, air:<AirArrow d="M 22 30 Q 18 22 16 12"/>, dot:<ContactDot cx={124} cy={96}/> },
    alveolar_lateral:{ tongue:tongues.lateral, lips:null, air:null, dot:<ContactDot cx={92} cy={82}/> },
    retroflex:     { tongue:tongues.retroflex, lips:lipsRound, air:null, dot:null },
    palatal:       { tongue:tongues.palatal, lips:null, air:null, dot:null },
    neutral:       { tongue:tongues.mid_neutral, lips:null, air:null, dot:null },
  };

  const cfg = configs[svgKey] || configs.neutral;
  return (
    <svg width="175" height="185" viewBox="0 0 175 185" style={{ display:"block" }}>
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 Z" fill="#3b82f6" opacity="0.7"/>
        </marker>
      </defs>
      <Outline />
      {cfg.tongue}
      {cfg.lips}
      {cfg.air}
      {cfg.dot}
      <text x="88" y="181" textAnchor="middle" fill={T.textMuted} fontSize="8" fontFamily="monospace">side view</text>
    </svg>
  );
}
