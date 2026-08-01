import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { AudioProcessor } from './audio/AudioProcessor';
import { PitchDetector } from './audio/PitchDetector';
import { LoudnessDetector } from './audio/LoudnessDetector';

import {
  GameEngine,
  GameState,
  Hurdle,
} from './engine/GameEngine';

import {
  LOUDNESS_RANGES,
  PITCH_RANGES,
} from './constants';

import {
  LEVELS,
  LevelConfig,
  calculateStars,
  updateLevelProgress,
} from './levels';

import LevelSelection from './LevelSelection';
import { voiceHurdleRaceApi } from '../api/voiceHurdleRaceApi';
import { useAuth } from '../context/AuthContext';

import {
  RaceTheme,
  CreatureType,
  getTheme,
} from './raceThemes';


/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function VoiceHurdleRace() {
  const [
    showLevelSelection,
    setShowLevelSelection,
  ] = useState(true);

  const [
    selectedLevel,
    setSelectedLevel,
  ] = useState<LevelConfig | null>(
    null
  );

  const [
    gameState,
    setGameState,
  ] = useState<GameState | null>(
    null
  );

  const [
    audioInitialized,
    setAudioInitialized,
  ] = useState(false);

  const [
    isStarted,
    setIsStarted,
  ] = useState(false);

  const [
    isGameOver,
    setIsGameOver,
  ] = useState(false);

  const [
    isStarting,
    setIsStarting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  // ProtectedKid (see App.jsx) already guarantees isKid is true before this
  // component ever mounts, so patient is read straight from context rather
  // than mirrored into local state via an internal login screen.
  const { patient } = useAuth();
  const navigate = useNavigate();


  /* ============================================================
     REFS
  ============================================================ */

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const animationRef =
    useRef<number | null>(
      null
    );

  const audioProcessorRef =
    useRef<AudioProcessor | null>(
      null
    );

  const pitchDetectorRef =
    useRef<PitchDetector | null>(
      null
    );

  const loudnessDetectorRef =
    useRef<LoudnessDetector | null>(
      null
    );

  const gameEngineRef =
    useRef<GameEngine | null>(
      null
    );


  /* ============================================================
     START RACE
     Microphone permission + race start happen from ONE button.
  ============================================================ */

  const initializeAudioAndStart =
    async () => {
      if (isStarting) {
        return;
      }

      try {
        setIsStarting(true);
        setError(null);

        let processor =
          audioProcessorRef.current;

        /*
         * Only create the microphone pipeline
         * the first time.
         */
        if (!processor) {
          processor =
            new AudioProcessor();

          await processor.initialize();

          await processor.resume();

          const audioData =
            processor.getAudioData();

          if (!audioData) {
            throw new Error(
              'Microphone audio is unavailable.'
            );
          }

          audioProcessorRef.current =
            processor;

          pitchDetectorRef.current =
            new PitchDetector(
              audioData.sampleRate
            );

          loudnessDetectorRef.current =
            new LoudnessDetector();

          setAudioInitialized(true);
        } else {
          await processor.resume();
        }

        /*
         * Start immediately.
         *
         * We pass true because React's
         * audioInitialized state update is async.
         */
        startGame();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not access microphone.'
        );
      } finally {
        setIsStarting(false);
      }
    };


  /* ============================================================
     START GAME
  ============================================================ */

  const startGame = () => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      setError(
        'Game canvas is unavailable.'
      );

      return;
    }

    /*
     * Cancel an old loop if one exists.
     */
    if (
      animationRef.current !== null
    ) {
      cancelAnimationFrame(
        animationRef.current
      );

      animationRef.current =
        null;
    }

    gameEngineRef.current?.stop();

    const engine =
      new GameEngine(
        canvas.width,
        canvas.height
      );

    if (selectedLevel) {
      engine.setLevelConfig(
        selectedLevel
      );
    }

    engine.start();

    gameEngineRef.current =
      engine;

    const initialState =
      engine.getState();

    setGameState(
      initialState
    );

    setIsStarted(true);

    setIsGameOver(false);


    /* ----------------------------------------------------------
       MAIN GAME LOOP
    ---------------------------------------------------------- */

    const gameLoop = (
      currentTime: number
    ) => {
      const currentEngine =
        gameEngineRef.current;

      const currentCanvas =
        canvasRef.current;

      if (
        !currentEngine ||
        !currentCanvas
      ) {
        return;
      }


      /* --------------------------------------------------------
         AUDIO
      -------------------------------------------------------- */

      const audioData =
        audioProcessorRef.current
          ?.getAudioData();

      let pitch:
        number | null = null;

      let loudness:
        number | null = null;

      if (
        audioData &&
        pitchDetectorRef.current &&
        loudnessDetectorRef.current
      ) {
        pitch =
          pitchDetectorRef.current
            .detectPitch(
              audioData.timeDomain
            );

        loudness =
          loudnessDetectorRef.current
            .getLoudness(
              audioData.timeDomain
            );
      }


      /* --------------------------------------------------------
         ENGINE
      -------------------------------------------------------- */

      currentEngine.update(
        currentTime,
        pitch,
        loudness
      );

      const state =
        currentEngine.getState();

      setGameState(
        state
      );


      /* --------------------------------------------------------
         DRAW
      -------------------------------------------------------- */

      renderGame(
        currentCanvas,
        state,
        selectedLevel?.id ?? 1
      );


      /* --------------------------------------------------------
         GAME OVER
      -------------------------------------------------------- */

      if (
        currentEngine.isGameOver()
      ) {
        setIsStarted(false);

        setIsGameOver(true);

        animationRef.current =
          null;

        if (selectedLevel && patient) {
          const accuracy =
            (
              state.pitchAccuracy +
              state.loudnessAccuracy
            ) / 2;

          const stars =
            calculateStars(
              state.score,
              accuracy,
              state.timeRemaining
            );

          updateLevelProgress(
            selectedLevel.id,
            stars
          );

          // Save session to backend — patient identity comes from the
          // auth token (get_current_patient), not the request body.
          voiceHurdleRaceApi.createVoiceHurdleRaceSession({
            level_id: selectedLevel.id,
            level_name: selectedLevel.name,
            score: state.score,
            time_remaining: state.timeRemaining,
            pitch_accuracy: state.pitchAccuracy,
            loudness_accuracy: state.loudnessAccuracy,
            stars: stars,
          }).catch(err => {
            console.error('Failed to save session:', err);
          });
        }

        return;
      }

      animationRef.current =
        requestAnimationFrame(
          gameLoop
        );
    };

    animationRef.current =
      requestAnimationFrame(
        gameLoop
      );
  };


  /* ============================================================
     LEVEL HANDLING
  ============================================================ */

  const handleSelectLevel = (
    levelId: number
  ) => {
    const level =
      LEVELS.find(
        (item) =>
          item.id === levelId
      );

    if (!level) {
      return;
    }

    setSelectedLevel(
      level
    );

    setShowLevelSelection(
      false
    );

    setGameState(null);

    setIsGameOver(false);

    setIsStarted(false);

    setError(null);
  };


  const handleBackToLevels =
    () => {
      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );

        animationRef.current =
          null;
      }

      gameEngineRef.current?.stop();

      setShowLevelSelection(
        true
      );

      setSelectedLevel(null);

      setIsStarted(false);

      setIsGameOver(false);

      setGameState(null);

      setError(null);
    };


  const handlePlayAgain =
    () => {
      setIsGameOver(false);

      setGameState(null);

      setError(null);

      /*
       * Microphone is already enabled,
       * so replay can start immediately.
       */
      window.setTimeout(
        () => {
          startGame();
        },
        0
      );
    };


  /* ============================================================
     BACK TO GAME PICKER
     Plain navigation, not a logout — LevelSelection's own "Switch
     player" button already calls logout() itself before invoking this;
     the "← Back to Portal Select" button should just navigate, not end
     the kid's session.
  ============================================================ */

  const handleBackToPicker = () => {
    navigate('/play');
  };


  /* ============================================================
     CLEANUP
  ============================================================ */

  useEffect(() => {
    return () => {
      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      gameEngineRef.current?.stop();

      audioProcessorRef.current?.stop();
    };
  }, []);


  /* ============================================================
     LEVEL SELECTION
  ============================================================ */

  if (showLevelSelection) {
    return (
      <LevelSelection
        onSelectLevel={
          handleSelectLevel
        }
        onBack={handleBackToPicker}
      />
    );
  }


  /* ============================================================
     PAGE
  ============================================================ */

  return (
    <div
      style={{
        minHeight: '100vh',

        boxSizing:
          'border-box',

        padding:
          '18px',

        overflowX:
          'hidden',

        background:
          'linear-gradient(180deg,#fef9e8 0%,#f4efff 48%,#e9f9ff 100%)',

        fontFamily:
          '"Trebuchet MS", Arial, sans-serif',
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        style={{
          width: '100%',

          maxWidth: 1100,

          margin:
            '0 auto 16px',

          display: 'flex',

          alignItems:
            'center',

          justifyContent:
            'space-between',

          gap: 12,
        }}
      >
        <button
          onClick={
            handleBackToLevels
          }
          style={
            secondaryButton
          }
        >
          ← Levels
        </button>

        <div
          style={{
            textAlign:
              'center',
          }}
        >
          <h1
            style={{
              margin: 0,

              fontSize:
                'clamp(24px,3vw,38px)',

              color:
                '#5b21b6',

              textShadow:
                '0 2px 0 white',
            }}
          >
            🐶 Puppy Voice Race
          </h1>

          <div
            style={{
              marginTop: 3,

              color:
                '#7c3aed',

              fontWeight: 900,

              fontSize: 14,
            }}
          >
            {selectedLevel?.name}
          </div>
        </div>

        <div
          style={{
            minWidth: 95,

            textAlign:
              'right',

            fontSize: 27,
          }}
        >
          ⭐ 🏁
        </div>
      </div>


      {/* ======================================================
          READY / MICROPHONE
      ====================================================== */}

      {!isStarted &&
        !isGameOver && (
          <StartPanel
            title="Ready to Race?"
            description={
              '🔊 Louder voice = faster puppy\n🎵 Higher pitch = jump'
            }
            buttonText={
              isStarting
                ? '🎤 Getting Ready...'
                : audioInitialized
                  ? '🚀 Start Race'
                  : '🎤 Enable Microphone & Start Race'
            }
            onClick={
              audioInitialized
                ? startGame
                : initializeAudioAndStart
            }
            error={error}
            disabled={
              isStarting
            }
          />
        )}


      {/* ======================================================
          GAME
      ====================================================== */}

      {isStarted && (
        <>
          {/* HUD */}

          <div
            style={{
              maxWidth: 1100,

              margin:
                '0 auto 12px',

              display: 'grid',

              gridTemplateColumns:
                'repeat(4,minmax(0,1fr))',

              gap: 10,
            }}
          >
            <Hud
              label="SCORE"
              value={`⭐ ${Math.floor(
                gameState?.score ??
                  0
              )}`}
            />

            <Hud
              label="TIME"
              value={`⏱️ ${Math.ceil(
                gameState
                  ?.timeRemaining ??
                  0
              )}s`}
            />

            <Hud
              label="CLEARED"
              value={`🚧 ${
                gameState
                  ?.hurdlesCleared ??
                0
              } / ${
                selectedLevel
                  ?.numHurdles ??
                3
              }`}
            />

            <Hud
              label="HITS"
              value={`💥 ${
                gameState
                  ?.hurdlesHit ??
                0
              }`}
            />
          </div>


          {/* GAME WORLD */}

          <div
            style={{
              maxWidth: 1100,

              margin:
                '0 auto',

              position:
                'relative',

              borderRadius: 28,

              overflow:
                'hidden',

              border:
                '5px solid #fff',

              boxShadow:
                '0 18px 50px rgba(64,40,100,.22)',
            }}
          >
            <canvas
              ref={
                canvasRef
              }
              width={1100}
              height={500}
              style={{
                display:
                  'block',

                width:
                  '100%',

                height:
                  'auto',
              }}
            />

            {/* TOP LEFT STATUS */}

            <div
              style={{
                position:
                  'absolute',

                top: 15,

                left: 15,

                padding:
                  '8px 15px',

                borderRadius:
                  999,

                background:
                  'rgba(255,255,255,.88)',

                boxShadow:
                  '0 4px 14px rgba(0,0,0,.12)',

                fontWeight: 900,

                color:
                  '#5b3418',
              }}
            >
              {speedLabel(
                gameState
                  ?.speedLevel ??
                  'stopped'
              )}
            </div>

            {/* JUMP INDICATOR */}

            {gameState
              ?.isJumping && (
              <div
                style={{
                  position:
                    'absolute',

                  top: 15,

                  right: 15,

                  padding:
                    '8px 16px',

                  borderRadius:
                    999,

                  background:
                    '#fff7bf',

                  border:
                    '3px solid #f59e0b',

                  fontWeight:
                    900,

                  color:
                    '#92400e',

                  boxShadow:
                    '0 4px 14px rgba(0,0,0,.12)',
                }}
              >
                🎵 JUMP!
              </div>
            )}
          </div>


          {/* VOICE CONTROLS */}

          <div
            style={{
              maxWidth: 1100,

              margin:
                '15px auto 0',

              display: 'grid',

              gridTemplateColumns:
                'repeat(2,minmax(0,1fr))',

              gap: 15,
            }}
          >
            <VoiceMeter
              title="🔊 YOUR VOICE"
              subtitle="Louder = Faster"
              value={
                gameState
                  ?.currentLoudness ??
                null
              }
              min={
                LOUDNESS_RANGES.LOW
              }
              max={
                LOUDNESS_RANGES.HIGH
              }
              suffix="dB"
              status={
                speedLabel(
                  gameState
                    ?.speedLevel ??
                    'stopped'
                )
              }
              leftLabel="SOFT"
              rightLabel="LOUD"
            />

            <VoiceMeter
              title="🎵 YOUR PITCH"
              subtitle="Higher = Jump"
              value={
                gameState
                  ?.currentPitch ??
                null
              }
              min={
                PITCH_RANGES.LOW
              }
              max={
                PITCH_RANGES.HIGH
              }
              suffix="Hz"
              status={
                gameState
                  ?.isJumping
                  ? '🐶 JUMP!'
                  : '↑ PITCH HIGHER'
              }
              leftLabel="LOW"
              rightLabel="HIGH"
            />
          </div>
        </>
      )}


      {/* ======================================================
          HIDDEN CANVAS
          Required so startGame has a canvas before game starts.
      ====================================================== */}

      {!isStarted && (
        <canvas
          ref={
            canvasRef
          }
          width={1100}
          height={500}
          style={{
            display:
              'none',
          }}
        />
      )}


      {/* ======================================================
          GAME OVER
      ====================================================== */}

      {isGameOver &&
        gameState && (
          <GameOver
            state={
              gameState
            }
            level={
              selectedLevel
            }
            onAgain={
              handlePlayAgain
            }
            onLevels={
              handleBackToLevels
            }
          />
        )}
    </div>
  );
}


/* ============================================================
   GAME RENDERER
============================================================ */

function renderGame(
  canvas: HTMLCanvasElement,
  state: GameState,
  levelId: number
) {
  const ctx =
    canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  const theme =
    getTheme(levelId);

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.save();

  /*
   * Camera shake when hurdle is hit.
   */
  if (
    state.isStumbling
  ) {
    const shakeX =
      Math.sin(
        performance.now() /
          20
      ) * 7;

    const shakeY =
      Math.cos(
        performance.now() /
          27
      ) * 3;

    ctx.translate(
      shakeX,
      shakeY
    );
  }

  drawSky(
    ctx,
    canvas,
    theme
  );

  drawMountains(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawHills(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawTrees(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawGrassDetails(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawRoad(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawRoadsideFlowers(
    ctx,
    canvas,
    state.distanceTravelled,
    theme
  );

  drawFinishProgress(
    ctx,
    canvas,
    state
  );

  state.hurdles.forEach(
    (hurdle) => {
      drawHurdle(
        ctx,
        hurdle
      );
    }
  );

  drawSpeedParticles(
    ctx,
    state
  );

  drawCreature(
    ctx,
    state,
    theme.creature
  );

  drawGameEffects(
    ctx,
    canvas,
    state
  );

  ctx.restore();
}


/* ============================================================
   SKY
============================================================ */

function drawSky(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  theme: RaceTheme
) {
  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      canvas.height
    );

  gradient.addColorStop(
    0,
    theme.sky.top
  );

  gradient.addColorStop(
    0.58,
    theme.sky.mid
  );

  gradient.addColorStop(
    1,
    theme.sky.bottom
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );


  /* SUN GLOW */

  const sunGlow =
    ctx.createRadialGradient(
      900,
      85,
      5,
      900,
      85,
      70
    );

  sunGlow.addColorStop(
    0,
    'rgba(255,245,140,.95)'
  );

  sunGlow.addColorStop(
    1,
    'rgba(255,245,140,0)'
  );

  ctx.fillStyle =
    sunGlow;

  ctx.beginPath();

  ctx.arc(
    900,
    85,
    70,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SUN */

  ctx.fillStyle =
    '#ffd54a';

  ctx.beginPath();

  ctx.arc(
    900,
    85,
    39,
    0,
    Math.PI * 2
  );

  ctx.fill();


  drawCloud(
    ctx,
    120,
    75,
    1
  );

  drawCloud(
    ctx,
    520,
    115,
    0.78
  );

  drawCloud(
    ctx,
    970,
    165,
    0.62
  );
}


/* ============================================================
   CLOUD
============================================================ */

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();

  ctx.translate(
    x,
    y
  );

  ctx.scale(
    scale,
    scale
  );

  ctx.fillStyle =
    'rgba(255,255,255,.9)';

  ctx.beginPath();

  ctx.arc(
    0,
    15,
    25,
    0,
    Math.PI * 2
  );

  ctx.arc(
    28,
    0,
    35,
    0,
    Math.PI * 2
  );

  ctx.arc(
    62,
    15,
    27,
    0,
    Math.PI * 2
  );

  ctx.arc(
    31,
    21,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();
}


/* ============================================================
   MOUNTAINS
============================================================ */

function drawMountains(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const offset =
    -(
      distance *
      0.035
    ) % 1100;

  for (
    let repeat = -1;
    repeat <= 1;
    repeat++
  ) {
    const x =
      offset +
      repeat * 1100;

    ctx.fillStyle =
      theme.mountain.fill;

    ctx.beginPath();

    ctx.moveTo(
      x,
      280
    );

    ctx.lineTo(
      x + 175,
      105
    );

    ctx.lineTo(
      x + 350,
      280
    );

    ctx.lineTo(
      x + 530,
      135
    );

    ctx.lineTo(
      x + 710,
      280
    );

    ctx.lineTo(
      x + 890,
      120
    );

    ctx.lineTo(
      x + 1100,
      280
    );

    ctx.closePath();

    ctx.fill();


    /* SNOW CAPS */

    ctx.fillStyle =
      theme.mountain.snow;

    ctx.beginPath();

    ctx.moveTo(
      x + 135,
      145
    );

    ctx.lineTo(
      x + 175,
      105
    );

    ctx.lineTo(
      x + 215,
      145
    );

    ctx.lineTo(
      x + 193,
      138
    );

    ctx.lineTo(
      x + 175,
      154
    );

    ctx.lineTo(
      x + 157,
      138
    );

    ctx.closePath();

    ctx.fill();
  }
}


/* ============================================================
   HILLS
============================================================ */

function drawHills(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const offset =
    -(
      distance *
      0.08
    ) % 1100;

  for (
    let repeat = -1;
    repeat <= 1;
    repeat++
  ) {
    const x =
      offset +
      repeat * 1100;

    ctx.fillStyle =
      theme.hills;

    ctx.beginPath();

    ctx.moveTo(
      x,
      270
    );

    ctx.quadraticCurveTo(
      x + 170,
      185,
      x + 360,
      270
    );

    ctx.quadraticCurveTo(
      x + 560,
      180,
      x + 735,
      270
    );

    ctx.quadraticCurveTo(
      x + 930,
      190,
      x + 1100,
      260
    );

    ctx.lineTo(
      x + 1100,
      canvas.height
    );

    ctx.lineTo(
      x,
      canvas.height
    );

    ctx.closePath();

    ctx.fill();
  }
}


/* ============================================================
   TREES
============================================================ */

function drawTrees(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const spacing =
    245;

  const offset =
    -(
      distance *
      0.2
    ) % spacing;

  for (
    let x = offset;
    x <
    canvas.width +
      spacing;
    x += spacing
  ) {
    drawTree(
      ctx,
      x,
      300,
      theme
    );
  }
}


function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: RaceTheme
) {
  /* SHADOW */

  ctx.fillStyle =
    'rgba(25,90,30,.16)';

  ctx.beginPath();

  ctx.ellipse(
    x + 32,
    y + 4,
    48,
    11,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* TRUNK */

  ctx.fillStyle =
    theme.tree.trunk;

  roundRect(
    ctx,
    x + 25,
    y - 70,
    16,
    75,
    6
  );

  ctx.fill();


  /* TREE TOP */

  ctx.fillStyle =
    theme.tree.top;

  ctx.beginPath();

  ctx.arc(
    x + 32,
    y - 88,
    40,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.fillStyle =
    theme.tree.highlight;

  ctx.beginPath();

  ctx.arc(
    x + 7,
    y - 77,
    25,
    0,
    Math.PI * 2
  );

  ctx.arc(
    x + 58,
    y - 75,
    27,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* FRUIT */

  ctx.fillStyle =
    theme.tree.fruit;

  ctx.beginPath();

  ctx.arc(
    x + 17,
    y - 94,
    4,
    0,
    Math.PI * 2
  );

  ctx.arc(
    x + 47,
    y - 73,
    4,
    0,
    Math.PI * 2
  );

  ctx.fill();
}


/* ============================================================
   GRASS DETAILS
============================================================ */

function drawGrassDetails(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const spacing =
    75;

  const offset =
    -(
      distance *
      0.4
    ) % spacing;

  ctx.strokeStyle =
    theme.grassDetail;

  ctx.lineWidth = 3;

  for (
    let x = offset;
    x <
    canvas.width +
      spacing;
    x += spacing
  ) {
    const y =
      canvas.height -
      178;

    ctx.beginPath();

    ctx.moveTo(
      x,
      y
    );

    ctx.lineTo(
      x - 7,
      y - 15
    );

    ctx.moveTo(
      x,
      y
    );

    ctx.lineTo(
      x + 7,
      y - 18
    );

    ctx.stroke();
  }
}


/* ============================================================
   ROAD
============================================================ */

function drawRoad(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const roadTop =
    canvas.height - 165;


  /* GRASS EDGE */

  ctx.fillStyle =
    theme.road.grassEdge;

  ctx.fillRect(
    0,
    roadTop - 22,
    canvas.width,
    28
  );


  /* ROAD */

  const roadGradient =
    ctx.createLinearGradient(
      0,
      roadTop,
      0,
      canvas.height
    );

  roadGradient.addColorStop(
    0,
    theme.road.gradientTop
  );

  roadGradient.addColorStop(
    0.5,
    theme.road.gradientMid
  );

  roadGradient.addColorStop(
    1,
    theme.road.gradientBottom
  );

  ctx.fillStyle =
    roadGradient;

  ctx.fillRect(
    0,
    roadTop,
    canvas.width,
    canvas.height -
      roadTop
  );


  /* ROAD TOP HIGHLIGHT */

  ctx.fillStyle =
    theme.road.highlight;

  ctx.fillRect(
    0,
    roadTop,
    canvas.width,
    5
  );


  /* MOVING ROAD DETAILS */

  const spacing =
    125;

  const offset =
    -(distance % spacing);

  for (
    let x = offset;
    x <
    canvas.width +
      spacing;
    x += spacing
  ) {
    ctx.fillStyle =
      theme.road.detail1;

    ctx.beginPath();

    ctx.ellipse(
      x,
      roadTop + 112,
      34,
      7,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();


    ctx.fillStyle =
      theme.road.detail2;

    ctx.beginPath();

    ctx.ellipse(
      x + 48,
      roadTop + 65,
      14,
      4,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}


/* ============================================================
   FLOWERS
============================================================ */

function drawRoadsideFlowers(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  theme: RaceTheme
) {
  const spacing =
    155;

  const offset =
    -(
      distance *
      0.55
    ) % spacing;

  for (
    let x = offset;
    x <
    canvas.width +
      spacing;
    x += spacing
  ) {
    const y =
      canvas.height -
      178;

    ctx.strokeStyle =
      theme.flowers.stem;

    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.moveTo(
      x,
      y + 25
    );

    ctx.lineTo(
      x,
      y
    );

    ctx.stroke();


    const flowerColour =
      Math.floor(
        x / spacing
      ) % 2 === 0
        ? theme.flowers.petalA
        : theme.flowers.petalB;

    ctx.fillStyle =
      flowerColour;

    for (
      let i = 0;
      i < 5;
      i++
    ) {
      const angle =
        (
          Math.PI *
          2 *
          i
        ) / 5;

      ctx.beginPath();

      ctx.arc(
        x +
          Math.cos(
            angle
          ) *
            6,
        y +
          Math.sin(
            angle
          ) *
            6,
        5,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.fillStyle =
      theme.flowers.center;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      4,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}


/* ============================================================
   FINISH PROGRESS
============================================================ */

function drawFinishProgress(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState
) {
  /*
   * Small visual progress line in the
   * game world.
   */

  const total =
    Math.max(
      1,
      state.hurdlesCleared +
        state.hurdlesHit +
        state.hurdles.length
    );

  const progress =
    state.hurdlesCleared /
    Math.max(
      3,
      total
    );

  const width =
    230;

  const x =
    canvas.width -
    width -
    25;

  const y =
    canvas.height -
    25;

  ctx.fillStyle =
    'rgba(255,255,255,.75)';

  roundRect(
    ctx,
    x,
    y,
    width,
    12,
    10
  );

  ctx.fill();

  ctx.fillStyle =
    '#22c55e';

  roundRect(
    ctx,
    x,
    y,
    width *
      Math.min(
        1,
        progress
      ),
    12,
    10
  );

  ctx.fill();
}


/* ============================================================
   HURDLE
============================================================ */

function drawHurdle(
  ctx: CanvasRenderingContext2D,
  hurdle: Hurdle
) {
  const width =
    Math.max(
      100,
      hurdle.width + 45
    );

  const height =
    hurdle.height;

  let rotation = 0;

  let drop = 0;

  let alpha = 1;


  /* HIT/FALL ANIMATION */

  if (
    hurdle.isHit &&
    hurdle.hitTime !== null
  ) {
    const elapsed =
      performance.now() -
      hurdle.hitTime;

    const progress =
      Math.min(
        1,
        elapsed / 600
      );

    rotation =
      progress * 1.12;

    drop =
      progress * 18;

    alpha =
      Math.max(
        0.55,
        1 -
          progress * 0.35
      );
  }


  ctx.save();

  ctx.globalAlpha =
    alpha;

  /*
   * Bottom centre becomes rotation point.
   */

  ctx.translate(
    hurdle.x +
      width / 2,
    hurdle.y + drop
  );

  ctx.rotate(
    rotation
  );

  ctx.translate(
    -width / 2,
    -height
  );


  /* GROUND SHADOW */

  ctx.fillStyle =
    'rgba(80,40,20,.2)';

  ctx.beginPath();

  ctx.ellipse(
    width / 2,
    height + 7,
    width / 2,
    9,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* LEGS */

  ctx.fillStyle =
    '#fff4d7';

  roundRect(
    ctx,
    9,
    14,
    15,
    height,
    5
  );

  ctx.fill();

  roundRect(
    ctx,
    width - 24,
    14,
    15,
    height,
    5
  );

  ctx.fill();


  /* LEG SHADOW */

  ctx.fillStyle =
    '#d9c9a5';

  ctx.fillRect(
    14,
    48,
    5,
    Math.max(
      10,
      height - 35
    )
  );

  ctx.fillRect(
    width - 19,
    48,
    5,
    Math.max(
      10,
      height - 35
    )
  );


  /* TOP BAR */

  ctx.fillStyle =
    '#ef4444';

  roundRect(
    ctx,
    0,
    0,
    width,
    22,
    7
  );

  ctx.fill();


  /* LOWER BAR */

  ctx.fillStyle =
    '#ef4444';

  roundRect(
    ctx,
    4,
    34,
    width - 8,
    17,
    6
  );

  ctx.fill();


  /* WHITE STRIPES */

  ctx.fillStyle =
    '#fff9e9';

  ctx.fillRect(
    21,
    1,
    22,
    20
  );

  ctx.fillRect(
    66,
    1,
    22,
    20
  );

  ctx.fillRect(
    28,
    35,
    21,
    15
  );

  ctx.fillRect(
    72,
    35,
    20,
    15
  );


  ctx.restore();
}


/* ============================================================
   DOG
============================================================ */

function drawDog(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  const x =
    state.puppyX;

  const y =
    state.puppyY;


  /* ----------------------------------------------------------
     RUN ANIMATION
  ---------------------------------------------------------- */

  const moving =
    state.puppySpeed > 0 &&
    !state.isJumping &&
    !state.isStumbling;

  const bounce =
    moving
      ? Math.sin(
          performance.now() /
            Math.max(
              50,
              145 -
                state.puppySpeed *
                  0.23
            )
        ) * 5
      : 0;

  const drawY =
    y + bounce;


  /* ----------------------------------------------------------
     STUMBLE
  ---------------------------------------------------------- */

  const stumbleProgress =
    state.isStumbling
      ? Math.min(
          1,
          (
            performance.now() -
            state.stumbleStartedAt
          ) / 650
        )
      : 0;

  const stumbleRotation =
    state.isStumbling
      ? Math.sin(
          stumbleProgress *
            Math.PI
        ) * 0.32
      : 0;


  /* SHADOW DOES NOT ROTATE */

  ctx.fillStyle =
    'rgba(60,35,20,.22)';

  ctx.beginPath();

  ctx.ellipse(
    x + 58,
    415,
    state.isJumping
      ? 28
      : 50,
    state.isJumping
      ? 6
      : 10,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.save();

  ctx.translate(
    x + 58,
    drawY - 45
  );

  ctx.rotate(
    stumbleRotation
  );

  ctx.translate(
    -(x + 58),
    -(drawY - 45)
  );


  /*
   * Slight squash/stretch.
   */

  if (
    state.isJumping
  ) {
    ctx.translate(
      x + 55,
      drawY - 40
    );

    ctx.scale(
      0.96,
      1.06
    );

    ctx.translate(
      -(x + 55),
      -(drawY - 40)
    );
  }


  /* BODY */

  ctx.fillStyle =
    '#c96f35';

  ctx.beginPath();

  ctx.ellipse(
    x + 50,
    drawY - 38,
    49,
    34,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* BODY HIGHLIGHT */

  ctx.fillStyle =
    '#dd8950';

  ctx.beginPath();

  ctx.ellipse(
    x + 42,
    drawY - 48,
    30,
    15,
    -0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* WHITE BELLY */

  ctx.fillStyle =
    '#fff7e8';

  ctx.beginPath();

  ctx.ellipse(
    x + 62,
    drawY - 34,
    28,
    24,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD */

  ctx.fillStyle =
    '#c96f35';

  ctx.beginPath();

  ctx.arc(
    x + 90,
    drawY - 69,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD HIGHLIGHT */

  ctx.fillStyle =
    '#dd8950';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 79,
    20,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EARS */

  ctx.fillStyle =
    '#87472a';

  ctx.beginPath();

  ctx.ellipse(
    x + 66,
    drawY - 82,
    14,
    29,
    -0.5,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.ellipse(
    x + 108,
    drawY - 84,
    13,
    29,
    0.45,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* MUZZLE */

  ctx.fillStyle =
    '#fff7e8';

  ctx.beginPath();

  ctx.ellipse(
    x + 104,
    drawY - 56,
    23,
    18,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE */

  ctx.fillStyle =
    '#251d19';

  ctx.beginPath();

  ctx.arc(
    x + 99,
    drawY - 75,
    5.5,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE SHINE */

  ctx.fillStyle =
    '#fff';

  ctx.beginPath();

  ctx.arc(
    x + 101,
    drawY - 77,
    2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* NOSE */

  ctx.fillStyle =
    '#2d211c';

  ctx.beginPath();

  ctx.ellipse(
    x + 122,
    drawY - 58,
    7,
    5.5,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SMILE */

  ctx.strokeStyle =
    '#6b3a25';

  ctx.lineWidth = 2.5;

  ctx.beginPath();

  ctx.arc(
    x + 111,
    drawY - 51,
    10,
    0.15,
    1.5
  );

  ctx.stroke();


  /* COLLAR */

  ctx.strokeStyle =
    '#ef4444';

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.arc(
    x + 85,
    drawY - 45,
    25,
    0.5,
    2.7
  );

  ctx.stroke();


  /* COLLAR TAG */

  ctx.fillStyle =
    '#facc15';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 23,
    6,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* ----------------------------------------------------------
     LEGS
  ---------------------------------------------------------- */

  ctx.strokeStyle =
    '#a85b31';

  ctx.lineWidth = 11;

  ctx.lineCap =
    'round';

  const runningPhase =
    Math.sin(
      performance.now() /
        80
    );


  if (
    state.isJumping
  ) {
    /* tucked front leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 72,
      drawY - 25
    );

    ctx.lineTo(
      x + 86,
      drawY - 9
    );

    ctx.lineTo(
      x + 75,
      drawY - 3
    );

    ctx.stroke();


    /* tucked rear leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 24
    );

    ctx.lineTo(
      x + 18,
      drawY - 8
    );

    ctx.lineTo(
      x + 28,
      drawY - 2
    );

    ctx.stroke();
  } else if (
    state.isStumbling
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 27,
      drawY - 20
    );

    ctx.lineTo(
      x + 8,
      drawY + 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      x + 70,
      drawY - 19
    );

    ctx.lineTo(
      x + 91,
      drawY - 1
    );

    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 20
    );

    ctx.lineTo(
      x +
        20 +
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      x + 69,
      drawY - 19
    );

    ctx.lineTo(
      x +
        77 -
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();
  }


  /* TAIL */

  ctx.strokeStyle =
    '#c96f35';

  ctx.lineWidth = 12;

  ctx.lineCap =
    'round';

  const tailWave =
    moving
      ? Math.sin(
          performance.now() /
            85
        ) * 9
      : 0;

  ctx.beginPath();

  ctx.moveTo(
    x + 10,
    drawY - 44
  );

  ctx.quadraticCurveTo(
    x - 21,
    drawY -
      70 -
      tailWave,
    x - 5,
    drawY -
      91 -
      tailWave
  );

  ctx.stroke();

  ctx.restore();
}


function drawBunny(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  const x =
    state.puppyX;

  const y =
    state.puppyY;


  /* ----------------------------------------------------------
     RUN ANIMATION
  ---------------------------------------------------------- */

  const moving =
    state.puppySpeed > 0 &&
    !state.isJumping &&
    !state.isStumbling;

  const bounce =
    moving
      ? Math.sin(
          performance.now() /
            Math.max(
              50,
              145 -
                state.puppySpeed *
                  0.23
            )
        ) * 5
      : 0;

  const drawY =
    y + bounce;


  /* ----------------------------------------------------------
     STUMBLE
  ---------------------------------------------------------- */

  const stumbleProgress =
    state.isStumbling
      ? Math.min(
          1,
          (
            performance.now() -
            state.stumbleStartedAt
          ) / 650
        )
      : 0;

  const stumbleRotation =
    state.isStumbling
      ? Math.sin(
          stumbleProgress *
            Math.PI
        ) * 0.32
      : 0;


  /* SHADOW DOES NOT ROTATE */

  ctx.fillStyle =
    'rgba(60,35,20,.22)';

  ctx.beginPath();

  ctx.ellipse(
    x + 58,
    415,
    state.isJumping
      ? 28
      : 50,
    state.isJumping
      ? 6
      : 10,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.save();

  ctx.translate(
    x + 58,
    drawY - 45
  );

  ctx.rotate(
    stumbleRotation
  );

  ctx.translate(
    -(x + 58),
    -(drawY - 45)
  );


  /*
   * Slight squash/stretch.
   */

  if (
    state.isJumping
  ) {
    ctx.translate(
      x + 55,
      drawY - 40
    );

    ctx.scale(
      0.96,
      1.06
    );

    ctx.translate(
      -(x + 55),
      -(drawY - 40)
    );
  }


  /* BODY */

  ctx.fillStyle =
    '#f5c6d6';

  ctx.beginPath();

  ctx.ellipse(
    x + 50,
    drawY - 38,
    49,
    34,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* BODY HIGHLIGHT */

  ctx.fillStyle =
    '#fbdde8';

  ctx.beginPath();

  ctx.ellipse(
    x + 42,
    drawY - 48,
    30,
    15,
    -0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* WHITE BELLY */

  ctx.fillStyle =
    '#fffaf5';

  ctx.beginPath();

  ctx.ellipse(
    x + 62,
    drawY - 34,
    28,
    24,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD */

  ctx.fillStyle =
    '#f5c6d6';

  ctx.beginPath();

  ctx.arc(
    x + 90,
    drawY - 69,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD HIGHLIGHT */

  ctx.fillStyle =
    '#fbdde8';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 79,
    20,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EARS (tall bunny ears) */

  ctx.fillStyle =
    '#e8a0bd';

  ctx.beginPath();

  ctx.ellipse(
    x + 74,
    drawY - 112,
    9,
    46,
    -0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.ellipse(
    x + 100,
    drawY - 114,
    9,
    46,
    0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.fillStyle =
    '#fbdde8';

  ctx.beginPath();

  ctx.ellipse(
    x + 74,
    drawY - 108,
    4,
    32,
    -0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.ellipse(
    x + 100,
    drawY - 110,
    4,
    32,
    0.12,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* MUZZLE */

  ctx.fillStyle =
    '#fffaf5';

  ctx.beginPath();

  ctx.ellipse(
    x + 104,
    drawY - 56,
    23,
    18,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE */

  ctx.fillStyle =
    '#3a2a2f';

  ctx.beginPath();

  ctx.arc(
    x + 99,
    drawY - 75,
    5.5,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE SHINE */

  ctx.fillStyle =
    '#fff';

  ctx.beginPath();

  ctx.arc(
    x + 101,
    drawY - 77,
    2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* NOSE */

  ctx.fillStyle =
    '#d67a95';

  ctx.beginPath();

  ctx.ellipse(
    x + 122,
    drawY - 58,
    7,
    5.5,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SMILE */

  ctx.strokeStyle =
    '#a85a72';

  ctx.lineWidth = 2.5;

  ctx.beginPath();

  ctx.arc(
    x + 111,
    drawY - 51,
    10,
    0.15,
    1.5
  );

  ctx.stroke();


  /* COLLAR */

  ctx.strokeStyle =
    '#f472b6';

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.arc(
    x + 85,
    drawY - 45,
    25,
    0.5,
    2.7
  );

  ctx.stroke();


  /* COLLAR TAG */

  ctx.fillStyle =
    '#facc15';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 23,
    6,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* ----------------------------------------------------------
     LEGS
  ---------------------------------------------------------- */

  ctx.strokeStyle =
    '#e0a8bd';

  ctx.lineWidth = 11;

  ctx.lineCap =
    'round';

  const runningPhase =
    Math.sin(
      performance.now() /
        80
    );


  if (
    state.isJumping
  ) {
    /* tucked front leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 72,
      drawY - 25
    );

    ctx.lineTo(
      x + 86,
      drawY - 9
    );

    ctx.lineTo(
      x + 75,
      drawY - 3
    );

    ctx.stroke();


    /* tucked rear leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 24
    );

    ctx.lineTo(
      x + 18,
      drawY - 8
    );

    ctx.lineTo(
      x + 28,
      drawY - 2
    );

    ctx.stroke();
  } else if (
    state.isStumbling
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 27,
      drawY - 20
    );

    ctx.lineTo(
      x + 8,
      drawY + 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      x + 70,
      drawY - 19
    );

    ctx.lineTo(
      x + 91,
      drawY - 1
    );

    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 20
    );

    ctx.lineTo(
      x +
        20 +
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      x + 69,
      drawY - 19
    );

    ctx.lineTo(
      x +
        77 -
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();
  }


  /* TAIL (cotton puff) */

  ctx.fillStyle =
    '#fffaf5';

  ctx.beginPath();

  ctx.arc(
    x + 6,
    drawY - 46,
    13,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();
}



function drawFox(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  const x =
    state.puppyX;

  const y =
    state.puppyY;


  /* ----------------------------------------------------------
     RUN ANIMATION
  ---------------------------------------------------------- */

  const moving =
    state.puppySpeed > 0 &&
    !state.isJumping &&
    !state.isStumbling;

  const bounce =
    moving
      ? Math.sin(
          performance.now() /
            Math.max(
              50,
              145 -
                state.puppySpeed *
                  0.23
            )
        ) * 5
      : 0;

  const drawY =
    y + bounce;


  /* ----------------------------------------------------------
     STUMBLE
  ---------------------------------------------------------- */

  const stumbleProgress =
    state.isStumbling
      ? Math.min(
          1,
          (
            performance.now() -
            state.stumbleStartedAt
          ) / 650
        )
      : 0;

  const stumbleRotation =
    state.isStumbling
      ? Math.sin(
          stumbleProgress *
            Math.PI
        ) * 0.32
      : 0;


  /* SHADOW DOES NOT ROTATE */

  ctx.fillStyle =
    'rgba(60,35,20,.22)';

  ctx.beginPath();

  ctx.ellipse(
    x + 58,
    415,
    state.isJumping
      ? 28
      : 50,
    state.isJumping
      ? 6
      : 10,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.save();

  ctx.translate(
    x + 58,
    drawY - 45
  );

  ctx.rotate(
    stumbleRotation
  );

  ctx.translate(
    -(x + 58),
    -(drawY - 45)
  );


  /*
   * Slight squash/stretch.
   */

  if (
    state.isJumping
  ) {
    ctx.translate(
      x + 55,
      drawY - 40
    );

    ctx.scale(
      0.96,
      1.06
    );

    ctx.translate(
      -(x + 55),
      -(drawY - 40)
    );
  }


  /* BODY */

  ctx.fillStyle =
    '#e0692f';

  ctx.beginPath();

  ctx.ellipse(
    x + 50,
    drawY - 38,
    49,
    34,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* BODY HIGHLIGHT */

  ctx.fillStyle =
    '#f0895a';

  ctx.beginPath();

  ctx.ellipse(
    x + 42,
    drawY - 48,
    30,
    15,
    -0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* WHITE BELLY */

  ctx.fillStyle =
    '#fff7ec';

  ctx.beginPath();

  ctx.ellipse(
    x + 62,
    drawY - 34,
    28,
    24,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD */

  ctx.fillStyle =
    '#e0692f';

  ctx.beginPath();

  ctx.arc(
    x + 90,
    drawY - 69,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD HIGHLIGHT */

  ctx.fillStyle =
    '#f0895a';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 79,
    20,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EARS (pointed fox ears) */

  ctx.fillStyle =
    '#b8461f';

  ctx.beginPath();

  ctx.moveTo(
    x + 58,
    drawY - 78
  );

  ctx.lineTo(
    x + 68,
    drawY - 118
  );

  ctx.lineTo(
    x + 82,
    drawY - 80
  );

  ctx.closePath();

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    x + 96,
    drawY - 82
  );

  ctx.lineTo(
    x + 112,
    drawY - 120
  );

  ctx.lineTo(
    x + 122,
    drawY - 80
  );

  ctx.closePath();

  ctx.fill();

  ctx.fillStyle =
    '#2a1610';

  ctx.beginPath();

  ctx.moveTo(
    x + 64,
    drawY - 96
  );

  ctx.lineTo(
    x + 68,
    drawY - 112
  );

  ctx.lineTo(
    x + 74,
    drawY - 92
  );

  ctx.closePath();

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    x + 103,
    drawY - 98
  );

  ctx.lineTo(
    x + 112,
    drawY - 114
  );

  ctx.lineTo(
    x + 116,
    drawY - 92
  );

  ctx.closePath();

  ctx.fill();


  /* MUZZLE */

  ctx.fillStyle =
    '#fff7ec';

  ctx.beginPath();

  ctx.ellipse(
    x + 104,
    drawY - 56,
    23,
    18,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE */

  ctx.fillStyle =
    '#201510';

  ctx.beginPath();

  ctx.arc(
    x + 99,
    drawY - 75,
    5.5,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE SHINE */

  ctx.fillStyle =
    '#fff';

  ctx.beginPath();

  ctx.arc(
    x + 101,
    drawY - 77,
    2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* NOSE */

  ctx.fillStyle =
    '#241a15';

  ctx.beginPath();

  ctx.ellipse(
    x + 122,
    drawY - 58,
    7,
    5.5,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SMILE */

  ctx.strokeStyle =
    '#7a3210';

  ctx.lineWidth = 2.5;

  ctx.beginPath();

  ctx.arc(
    x + 111,
    drawY - 51,
    10,
    0.15,
    1.5
  );

  ctx.stroke();


  /* COLLAR */

  ctx.strokeStyle =
    '#22c55e';

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.arc(
    x + 85,
    drawY - 45,
    25,
    0.5,
    2.7
  );

  ctx.stroke();


  /* COLLAR TAG */

  ctx.fillStyle =
    '#facc15';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 23,
    6,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* ----------------------------------------------------------
     LEGS
  ---------------------------------------------------------- */

  ctx.strokeStyle =
    '#3a2a22';

  ctx.lineWidth = 11;

  ctx.lineCap =
    'round';

  const runningPhase =
    Math.sin(
      performance.now() /
        80
    );


  if (
    state.isJumping
  ) {
    /* tucked front leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 72,
      drawY - 25
    );

    ctx.lineTo(
      x + 86,
      drawY - 9
    );

    ctx.lineTo(
      x + 75,
      drawY - 3
    );

    ctx.stroke();


    /* tucked rear leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 24
    );

    ctx.lineTo(
      x + 18,
      drawY - 8
    );

    ctx.lineTo(
      x + 28,
      drawY - 2
    );

    ctx.stroke();
  } else if (
    state.isStumbling
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 27,
      drawY - 20
    );

    ctx.lineTo(
      x + 8,
      drawY + 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      x + 70,
      drawY - 19
    );

    ctx.lineTo(
      x + 91,
      drawY - 1
    );

    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 20
    );

    ctx.lineTo(
      x +
        20 +
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      x + 69,
      drawY - 19
    );

    ctx.lineTo(
      x +
        77 -
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();
  }


  /* TAIL (big bushy tail) */

  ctx.strokeStyle =
    '#e0692f';

  ctx.lineWidth = 20;

  ctx.lineCap =
    'round';

  const tailWave =
    moving
      ? Math.sin(
          performance.now() /
            85
        ) * 9
      : 0;

  ctx.beginPath();

  ctx.moveTo(
    x + 8,
    drawY - 42
  );

  ctx.quadraticCurveTo(
    x - 34,
    drawY -
      68 -
      tailWave,
    x - 12,
    drawY -
      98 -
      tailWave
  );

  ctx.stroke();

  ctx.fillStyle =
    '#fff7ec';

  ctx.beginPath();

  ctx.arc(
    x - 12,
    drawY -
      98 -
      tailWave,
    9,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();
}



function drawDragon(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  const x =
    state.puppyX;

  const y =
    state.puppyY;


  /* ----------------------------------------------------------
     RUN ANIMATION
  ---------------------------------------------------------- */

  const moving =
    state.puppySpeed > 0 &&
    !state.isJumping &&
    !state.isStumbling;

  const bounce =
    moving
      ? Math.sin(
          performance.now() /
            Math.max(
              50,
              145 -
                state.puppySpeed *
                  0.23
            )
        ) * 5
      : 0;

  const drawY =
    y + bounce;


  /* ----------------------------------------------------------
     STUMBLE
  ---------------------------------------------------------- */

  const stumbleProgress =
    state.isStumbling
      ? Math.min(
          1,
          (
            performance.now() -
            state.stumbleStartedAt
          ) / 650
        )
      : 0;

  const stumbleRotation =
    state.isStumbling
      ? Math.sin(
          stumbleProgress *
            Math.PI
        ) * 0.32
      : 0;


  /* SHADOW DOES NOT ROTATE */

  ctx.fillStyle =
    'rgba(60,35,20,.22)';

  ctx.beginPath();

  ctx.ellipse(
    x + 58,
    415,
    state.isJumping
      ? 28
      : 50,
    state.isJumping
      ? 6
      : 10,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.save();

  ctx.translate(
    x + 58,
    drawY - 45
  );

  ctx.rotate(
    stumbleRotation
  );

  ctx.translate(
    -(x + 58),
    -(drawY - 45)
  );


  /*
   * Slight squash/stretch.
   */

  if (
    state.isJumping
  ) {
    ctx.translate(
      x + 55,
      drawY - 40
    );

    ctx.scale(
      0.96,
      1.06
    );

    ctx.translate(
      -(x + 55),
      -(drawY - 40)
    );
  }


  /* BODY */

  ctx.fillStyle =
    '#2f9e8a';

  ctx.beginPath();

  ctx.ellipse(
    x + 50,
    drawY - 38,
    49,
    34,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* BODY HIGHLIGHT */

  ctx.fillStyle =
    '#4fd6bd';

  ctx.beginPath();

  ctx.ellipse(
    x + 42,
    drawY - 48,
    30,
    15,
    -0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* WHITE BELLY */

  ctx.fillStyle =
    '#d9c2f0';

  ctx.beginPath();

  ctx.ellipse(
    x + 62,
    drawY - 34,
    28,
    24,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD */

  ctx.fillStyle =
    '#2f9e8a';

  ctx.beginPath();

  ctx.arc(
    x + 90,
    drawY - 69,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD HIGHLIGHT */

  ctx.fillStyle =
    '#4fd6bd';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 79,
    20,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HORNS (small dragon horns) */

  ctx.fillStyle =
    '#6b3fa0';

  ctx.beginPath();

  ctx.moveTo(
    x + 70,
    drawY - 88
  );

  ctx.lineTo(
    x + 75,
    drawY - 106
  );

  ctx.lineTo(
    x + 82,
    drawY - 88
  );

  ctx.closePath();

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    x + 98,
    drawY - 90
  );

  ctx.lineTo(
    x + 105,
    drawY - 108
  );

  ctx.lineTo(
    x + 112,
    drawY - 90
  );

  ctx.closePath();

  ctx.fill();

  ctx.fillStyle =
    'rgba(139,92,246,.35)';

  ctx.beginPath();

  ctx.moveTo(
    x + 24,
    drawY - 52
  );

  ctx.quadraticCurveTo(
    x - 6,
    drawY - 82,
    x + 10,
    drawY - 108
  );

  ctx.quadraticCurveTo(
    x + 26,
    drawY - 80,
    x + 30,
    drawY - 48
  );

  ctx.closePath();

  ctx.fill();


  /* MUZZLE */

  ctx.fillStyle =
    '#d9c2f0';

  ctx.beginPath();

  ctx.ellipse(
    x + 104,
    drawY - 56,
    23,
    18,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE */

  ctx.fillStyle =
    '#1a1015';

  ctx.beginPath();

  ctx.arc(
    x + 99,
    drawY - 75,
    5.5,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE SHINE */

  ctx.fillStyle =
    '#fff';

  ctx.beginPath();

  ctx.arc(
    x + 101,
    drawY - 77,
    2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* NOSE */

  ctx.fillStyle =
    '#241830';

  ctx.beginPath();

  ctx.ellipse(
    x + 122,
    drawY - 58,
    7,
    5.5,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SMILE */

  ctx.strokeStyle =
    '#1f6b5c';

  ctx.lineWidth = 2.5;

  ctx.beginPath();

  ctx.arc(
    x + 111,
    drawY - 51,
    10,
    0.15,
    1.5
  );

  ctx.stroke();


  /* COLLAR */

  ctx.strokeStyle =
    '#fbbf24';

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.arc(
    x + 85,
    drawY - 45,
    25,
    0.5,
    2.7
  );

  ctx.stroke();


  /* COLLAR TAG */

  ctx.fillStyle =
    '#facc15';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 23,
    6,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* ----------------------------------------------------------
     LEGS
  ---------------------------------------------------------- */

  ctx.strokeStyle =
    '#237a6a';

  ctx.lineWidth = 11;

  ctx.lineCap =
    'round';

  const runningPhase =
    Math.sin(
      performance.now() /
        80
    );


  if (
    state.isJumping
  ) {
    /* tucked front leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 72,
      drawY - 25
    );

    ctx.lineTo(
      x + 86,
      drawY - 9
    );

    ctx.lineTo(
      x + 75,
      drawY - 3
    );

    ctx.stroke();


    /* tucked rear leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 24
    );

    ctx.lineTo(
      x + 18,
      drawY - 8
    );

    ctx.lineTo(
      x + 28,
      drawY - 2
    );

    ctx.stroke();
  } else if (
    state.isStumbling
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 27,
      drawY - 20
    );

    ctx.lineTo(
      x + 8,
      drawY + 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      x + 70,
      drawY - 19
    );

    ctx.lineTo(
      x + 91,
      drawY - 1
    );

    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 20
    );

    ctx.lineTo(
      x +
        20 +
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      x + 69,
      drawY - 19
    );

    ctx.lineTo(
      x +
        77 -
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();
  }


  /* TAIL (spiky dragon tail) */

  ctx.strokeStyle =
    '#2f9e8a';

  ctx.lineWidth = 12;

  ctx.lineCap =
    'round';

  const tailWave =
    moving
      ? Math.sin(
          performance.now() /
            85
        ) * 9
      : 0;

  ctx.beginPath();

  ctx.moveTo(
    x + 10,
    drawY - 44
  );

  ctx.quadraticCurveTo(
    x - 21,
    drawY -
      70 -
      tailWave,
    x - 5,
    drawY -
      91 -
      tailWave
  );

  ctx.stroke();

  ctx.fillStyle =
    '#6b3fa0';

  ctx.beginPath();

  ctx.moveTo(
    x - 12,
    drawY -
      64 -
      tailWave
  );

  ctx.lineTo(
    x - 22,
    drawY -
      72 -
      tailWave
  );

  ctx.lineTo(
    x - 10,
    drawY -
      76 -
      tailWave
  );

  ctx.closePath();

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    x - 3,
    drawY -
      85 -
      tailWave
  );

  ctx.lineTo(
    x - 13,
    drawY -
      93 -
      tailWave
  );

  ctx.lineTo(
    x - 1,
    drawY -
      97 -
      tailWave
  );

  ctx.closePath();

  ctx.fill();

  ctx.restore();
}



function drawUnicorn(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  const x =
    state.puppyX;

  const y =
    state.puppyY;


  /* ----------------------------------------------------------
     RUN ANIMATION
  ---------------------------------------------------------- */

  const moving =
    state.puppySpeed > 0 &&
    !state.isJumping &&
    !state.isStumbling;

  const bounce =
    moving
      ? Math.sin(
          performance.now() /
            Math.max(
              50,
              145 -
                state.puppySpeed *
                  0.23
            )
        ) * 5
      : 0;

  const drawY =
    y + bounce;


  /* ----------------------------------------------------------
     STUMBLE
  ---------------------------------------------------------- */

  const stumbleProgress =
    state.isStumbling
      ? Math.min(
          1,
          (
            performance.now() -
            state.stumbleStartedAt
          ) / 650
        )
      : 0;

  const stumbleRotation =
    state.isStumbling
      ? Math.sin(
          stumbleProgress *
            Math.PI
        ) * 0.32
      : 0;


  /* SHADOW DOES NOT ROTATE */

  ctx.fillStyle =
    'rgba(60,35,20,.22)';

  ctx.beginPath();

  ctx.ellipse(
    x + 58,
    415,
    state.isJumping
      ? 28
      : 50,
    state.isJumping
      ? 6
      : 10,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.save();

  ctx.translate(
    x + 58,
    drawY - 45
  );

  ctx.rotate(
    stumbleRotation
  );

  ctx.translate(
    -(x + 58),
    -(drawY - 45)
  );


  /*
   * Slight squash/stretch.
   */

  if (
    state.isJumping
  ) {
    ctx.translate(
      x + 55,
      drawY - 40
    );

    ctx.scale(
      0.96,
      1.06
    );

    ctx.translate(
      -(x + 55),
      -(drawY - 40)
    );
  }


  /* BODY */

  ctx.fillStyle =
    '#f3ecff';

  ctx.beginPath();

  ctx.ellipse(
    x + 50,
    drawY - 38,
    49,
    34,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* BODY HIGHLIGHT */

  ctx.fillStyle =
    '#ffffff';

  ctx.beginPath();

  ctx.ellipse(
    x + 42,
    drawY - 48,
    30,
    15,
    -0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* WHITE BELLY */

  ctx.fillStyle =
    '#fdf4ff';

  ctx.beginPath();

  ctx.ellipse(
    x + 62,
    drawY - 34,
    28,
    24,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD */

  ctx.fillStyle =
    '#f3ecff';

  ctx.beginPath();

  ctx.arc(
    x + 90,
    drawY - 69,
    37,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HEAD HIGHLIGHT */

  ctx.fillStyle =
    '#ffffff';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 79,
    20,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* HORN (single spiral horn) */

  ctx.fillStyle =
    '#fbbf24';

  ctx.beginPath();

  ctx.moveTo(
    x + 82,
    drawY - 88
  );

  ctx.lineTo(
    x + 90,
    drawY - 122
  );

  ctx.lineTo(
    x + 98,
    drawY - 88
  );

  ctx.closePath();

  ctx.fill();

  ctx.strokeStyle =
    '#fde68a';

  ctx.lineWidth = 1.5;

  ctx.beginPath();

  ctx.moveTo(
    x + 86,
    drawY - 95
  );

  ctx.lineTo(
    x + 91,
    drawY - 108
  );

  ctx.stroke();

  ctx.fillStyle =
    '#e8a0ff';

  ctx.beginPath();

  ctx.ellipse(
    x + 66,
    drawY - 82,
    9,
    22,
    -0.5,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.ellipse(
    x + 108,
    drawY - 84,
    8,
    22,
    0.45,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* MUZZLE */

  ctx.fillStyle =
    '#fdf4ff';

  ctx.beginPath();

  ctx.ellipse(
    x + 104,
    drawY - 56,
    23,
    18,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE */

  ctx.fillStyle =
    '#2a2030';

  ctx.beginPath();

  ctx.arc(
    x + 99,
    drawY - 75,
    5.5,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* EYE SHINE */

  ctx.fillStyle =
    '#fff';

  ctx.beginPath();

  ctx.arc(
    x + 101,
    drawY - 77,
    2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* NOSE */

  ctx.fillStyle =
    '#d8a8e8';

  ctx.beginPath();

  ctx.ellipse(
    x + 122,
    drawY - 58,
    7,
    5.5,
    0,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* SMILE */

  ctx.strokeStyle =
    '#b088c8';

  ctx.lineWidth = 2.5;

  ctx.beginPath();

  ctx.arc(
    x + 111,
    drawY - 51,
    10,
    0.15,
    1.5
  );

  ctx.stroke();


  /* COLLAR */

  ctx.strokeStyle =
    '#f472b6';

  ctx.lineWidth = 7;

  ctx.beginPath();

  ctx.arc(
    x + 85,
    drawY - 45,
    25,
    0.5,
    2.7
  );

  ctx.stroke();


  /* COLLAR TAG */

  ctx.fillStyle =
    '#facc15';

  ctx.beginPath();

  ctx.arc(
    x + 82,
    drawY - 23,
    6,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /* ----------------------------------------------------------
     LEGS
  ---------------------------------------------------------- */

  ctx.strokeStyle =
    '#e8d8f5';

  ctx.lineWidth = 11;

  ctx.lineCap =
    'round';

  const runningPhase =
    Math.sin(
      performance.now() /
        80
    );


  if (
    state.isJumping
  ) {
    /* tucked front leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 72,
      drawY - 25
    );

    ctx.lineTo(
      x + 86,
      drawY - 9
    );

    ctx.lineTo(
      x + 75,
      drawY - 3
    );

    ctx.stroke();


    /* tucked rear leg */

    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 24
    );

    ctx.lineTo(
      x + 18,
      drawY - 8
    );

    ctx.lineTo(
      x + 28,
      drawY - 2
    );

    ctx.stroke();
  } else if (
    state.isStumbling
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 27,
      drawY - 20
    );

    ctx.lineTo(
      x + 8,
      drawY + 2
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
      x + 70,
      drawY - 19
    );

    ctx.lineTo(
      x + 91,
      drawY - 1
    );

    ctx.stroke();
  } else {
    ctx.beginPath();

    ctx.moveTo(
      x + 30,
      drawY - 20
    );

    ctx.lineTo(
      x +
        20 +
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();


    ctx.beginPath();

    ctx.moveTo(
      x + 69,
      drawY - 19
    );

    ctx.lineTo(
      x +
        77 -
        runningPhase * 13,
      drawY + 6
    );

    ctx.stroke();
  }


  /* TAIL (flowing rainbow tail) */

  ctx.lineWidth = 8;

  ctx.lineCap =
    'round';

  const tailWave =
    moving
      ? Math.sin(
          performance.now() /
            85
        ) * 9
      : 0;

  const rainbowColours =
    [
      '#f472b6',
      '#fb923c',
      '#fde047',
      '#4ade80',
      '#60a5fa',
      '#c084fc',
    ];

  rainbowColours.forEach(
    (colour, i) => {
      ctx.strokeStyle =
        colour;

      ctx.beginPath();

      ctx.moveTo(
        x + 10,
        drawY - 44
      );

      ctx.quadraticCurveTo(
        x - 21 - i * 4,
        drawY -
          70 -
          tailWave -
          i * 5,
        x - 5 - i * 5,
        drawY -
          91 -
          tailWave -
          i * 7
      );

      ctx.stroke();
    }
  );

  ctx.restore();
}


/* ============================================================
   CREATURE DISPATCH
============================================================ */

function drawCreature(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  creature: CreatureType
) {
  switch (creature) {
    case 'bunny':
      drawBunny(ctx, state);
      return;
    case 'fox':
      drawFox(ctx, state);
      return;
    case 'dragon':
      drawDragon(ctx, state);
      return;
    case 'unicorn':
      drawUnicorn(ctx, state);
      return;
    default:
      drawDog(ctx, state);
      return;
  }
}


/* ============================================================
   SPEED / DUST PARTICLES
============================================================ */

function drawSpeedParticles(
  ctx: CanvasRenderingContext2D,
  state: GameState
) {
  if (
    state.speedLevel ===
      'stopped' ||
    state.isJumping
  ) {
    return;
  }

  const count =
    state.speedLevel ===
    'fast'
      ? 7
      : state.speedLevel ===
          'normal'
        ? 5
        : 3;

  const time =
    performance.now() /
    100;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const phase =
      (
        time +
        i * 17
      ) % 50;

    const x =
      state.puppyX -
      10 -
      i * 18 -
      phase;

    const y =
      405 +
      (i % 3) * 8;

    const size =
      4 +
      (i % 3) * 2;

    ctx.fillStyle =
      'rgba(255,235,195,.55)';

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      size,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }


  /*
   * Speed streaks for fast running.
   */

  if (
    state.speedLevel ===
    'fast'
  ) {
    ctx.strokeStyle =
      'rgba(255,255,255,.5)';

    ctx.lineWidth = 4;

    for (
      let i = 0;
      i < 4;
      i++
    ) {
      const y =
        335 +
        i * 20;

      ctx.beginPath();

      ctx.moveTo(
        state.puppyX -
          35 -
          i * 12,
        y
      );

      ctx.lineTo(
        state.puppyX -
          95 -
          i * 18,
        y
      );

      ctx.stroke();
    }
  }
}


/* ============================================================
   GAME EFFECTS
============================================================ */

function drawGameEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState
) {
  if (
    state.eventType ===
    'none'
  ) {
    return;
  }

  const elapsed =
    performance.now() -
    state.eventStartedAt;

  const progress =
    Math.min(
      1,
      elapsed / 1100
    );

  const alpha =
    Math.max(
      0,
      1 - progress
    );

  ctx.save();

  ctx.globalAlpha =
    alpha;


  /* ========================================================
     SUCCESS
  ======================================================== */

  if (
    state.eventType ===
    'hurdle-cleared'
  ) {
    drawStarBurst(
      ctx,
      state.puppyX +
        75,
      state.puppyY -
        100,
      progress
    );

    const y =
      95 -
      progress * 18;

    ctx.textAlign =
      'center';

    ctx.font =
      '900 32px "Trebuchet MS"';

    ctx.strokeStyle =
      '#5b21b6';

    ctx.lineWidth = 8;

    ctx.fillStyle =
      '#ffffff';

    ctx.strokeText(
      '⭐ GREAT JUMP! ⭐',
      canvas.width / 2,
      y
    );

    ctx.fillText(
      '⭐ GREAT JUMP! ⭐',
      canvas.width / 2,
      y
    );


    ctx.font =
      '900 27px "Trebuchet MS"';

    ctx.strokeStyle =
      '#92400e';

    ctx.lineWidth = 6;

    ctx.fillStyle =
      '#fde047';

    ctx.strokeText(
      '+100',
      canvas.width / 2,
      y + 38
    );

    ctx.fillText(
      '+100',
      canvas.width / 2,
      y + 38
    );
  }


  /* ========================================================
     HIT
  ======================================================== */

  if (
    state.eventType ===
    'hurdle-hit'
  ) {
    const impactX =
      state.puppyX +
      115;

    const impactY =
      state.puppyY -
      45;

    const radius =
      35 +
      progress * 35;

    ctx.fillStyle =
      '#facc15';

    drawImpactStar(
      ctx,
      impactX,
      impactY,
      radius
    );

    ctx.fill();


    ctx.fillStyle =
      '#ef4444';

    drawImpactStar(
      ctx,
      impactX,
      impactY,
      radius * 0.55
    );

    ctx.fill();


    ctx.textAlign =
      'center';

    ctx.font =
      '900 34px "Trebuchet MS"';

    ctx.strokeStyle =
      '#991b1b';

    ctx.lineWidth = 8;

    ctx.fillStyle =
      '#fff';

    ctx.strokeText(
      '💥 OOPS!',
      canvas.width / 2,
      95
    );

    ctx.fillText(
      '💥 OOPS!',
      canvas.width / 2,
      95
    );


    ctx.font =
      '900 21px "Trebuchet MS"';

    ctx.strokeStyle =
      '#78350f';

    ctx.lineWidth = 6;

    ctx.fillStyle =
      '#fff7c2';

    ctx.strokeText(
      '🎵 Pitch a little higher ↑',
      canvas.width / 2,
      132
    );

    ctx.fillText(
      '🎵 Pitch a little higher ↑',
      canvas.width / 2,
      132
    );
  }

  ctx.restore();
}


/* ============================================================
   IMPACT STAR
============================================================ */

function drawImpactStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) {
  const points =
    12;

  ctx.beginPath();

  for (
    let i = 0;
    i < points * 2;
    i++
  ) {
    const angle =
      (
        Math.PI *
        i
      ) / points;

    const r =
      i % 2 === 0
        ? radius
        : radius * 0.45;

    const px =
      x +
      Math.cos(
        angle
      ) *
        r;

    const py =
      y +
      Math.sin(
        angle
      ) *
        r;

    if (i === 0) {
      ctx.moveTo(
        px,
        py
      );
    } else {
      ctx.lineTo(
        px,
        py
      );
    }
  }

  ctx.closePath();
}


/* ============================================================
   STAR BURST
============================================================ */

function drawStarBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number
) {
  const stars =
    8;

  ctx.font =
    '25px sans-serif';

  ctx.textAlign =
    'center';

  for (
    let i = 0;
    i < stars;
    i++
  ) {
    const angle =
      (
        Math.PI *
        2 *
        i
      ) / stars;

    const distance =
      20 +
      progress * 75;

    ctx.fillText(
      '⭐',
      x +
        Math.cos(
          angle
        ) *
          distance,
      y +
        Math.sin(
          angle
        ) *
          distance
    );
  }
}


/* ============================================================
   ROUND RECT HELPER
============================================================ */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  /*
   * Avoid invalid geometry when an
   * animated progress bar is at zero.
   */
  if (
    width <= 0 ||
    height <= 0
  ) {
    return;
  }

  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  ctx.beginPath();

  ctx.moveTo(
    x + r,
    y
  );

  ctx.lineTo(
    x +
      width -
      r,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );

  ctx.lineTo(
    x + width,
    y +
      height -
      r
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x +
      width -
      r,
    y + height
  );

  ctx.lineTo(
    x + r,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y +
      height -
      r
  );

  ctx.lineTo(
    x,
    y + r
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );

  ctx.closePath();
}


/* ============================================================
   START PANEL
============================================================ */

function StartPanel({
  title,
  description,
  buttonText,
  onClick,
  error,
  disabled = false,
}: {
  title: string;
  description: string;
  buttonText: string;
  onClick: () => void;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: 620,

        margin:
          '55px auto',

        textAlign:
          'center',

        background:
          'rgba(255,255,255,.96)',

        padding:
          '42px 35px',

        borderRadius: 34,

        border:
          '4px solid #fff',

        boxShadow:
          '0 20px 55px rgba(80,50,120,.16)',
      }}
    >
      <div
        style={{
          fontSize: 90,

          lineHeight: 1,

          filter:
            'drop-shadow(0 8px 7px rgba(0,0,0,.12))',
        }}
      >
        🐶
      </div>

      <h2
        style={{
          margin:
            '20px 0 12px',

          color:
            '#5b21b6',

          fontSize:
            'clamp(30px,5vw,42px)',
        }}
      >
        {title}
      </h2>

      <div
        style={{
          maxWidth: 430,

          margin:
            '0 auto 28px',

          whiteSpace:
            'pre-line',

          lineHeight: 2,

          color:
            '#475569',

          fontSize: 20,

          fontWeight: 800,

          background:
            '#faf5ff',

          border:
            '2px solid #ede9fe',

          borderRadius: 20,

          padding:
            '16px 20px',
        }}
      >
        {description}
      </div>

      <button
        onClick={
          onClick
        }
        disabled={
          disabled
        }
        style={{
          ...primaryButton,

          opacity:
            disabled
              ? 0.65
              : 1,

          cursor:
            disabled
              ? 'wait'
              : 'pointer',
        }}
      >
        {buttonText}
      </button>

      {error && (
        <div
          style={{
            marginTop: 18,

            padding:
              '10px 14px',

            borderRadius: 12,

            background:
              '#fee2e2',

            color:
              '#b91c1c',

            fontWeight: 800,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}


/* ============================================================
   HUD
============================================================ */

function Hud({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        textAlign:
          'center',

        background:
          'linear-gradient(180deg,#fff9dc,#ffedb0)',

        border:
          '3px solid #9a6424',

        borderRadius: 18,

        padding:
          '9px 12px',

        boxShadow:
          '0 5px 0 #70451c',

        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,

          letterSpacing: 1,

          fontWeight: 900,

          color:
            '#7c4a16',
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 2,

          fontSize:
            'clamp(16px,2.5vw,22px)',

          fontWeight: 900,

          color:
            '#422006',

          whiteSpace:
            'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}


/* ============================================================
   VOICE METER
============================================================ */

function VoiceMeter({
  title,
  subtitle,
  value,
  min,
  max,
  suffix,
  status,
  leftLabel,
  rightLabel,
}: {
  title: string;
  subtitle: string;
  value: number | null;
  min: number;
  max: number;
  suffix: string;
  status: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const percent =
    value === null
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            (
              (value - min) /
              (max - min)
            ) * 100
          )
        );

  return (
    <div
      style={{
        background:
          'rgba(255,255,255,.94)',

        border:
          '3px solid #e5c07b',

        borderRadius: 22,

        padding:
          '15px 18px',

        boxShadow:
          '0 8px 22px rgba(70,45,25,.09)',
      }}
    >
      <div
        style={{
          display: 'flex',

          alignItems:
            'flex-start',

          justifyContent:
            'space-between',

          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 900,

              color:
                '#4c2c13',

              fontSize: 17,
            }}
          >
            {title}
          </div>

          <div
            style={{
              color:
                '#8a6445',

              fontSize: 12,

              fontWeight: 800,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            fontWeight: 900,

            color:
              '#5b21b6',
          }}
        >
          {value === null
            ? '--'
            : `${Math.round(
                value
              )} ${suffix}`}
        </div>
      </div>


      {/* LABELS */}

      <div
        style={{
          display: 'flex',

          justifyContent:
            'space-between',

          margin:
            '12px 2px 4px',

          fontSize: 11,

          fontWeight: 900,

          color:
            '#78604a',
        }}
      >
        <span>
          {leftLabel}
        </span>

        <span>
          {rightLabel}
        </span>
      </div>


      {/* METER */}

      <div
        style={{
          height: 20,

          borderRadius: 20,

          background:
            'linear-gradient(90deg,#60a5fa,#facc15,#22c55e)',

          position:
            'relative',

          boxShadow:
            'inset 0 2px 4px rgba(0,0,0,.18)',
        }}
      >
        <div
          style={{
            position:
              'absolute',

            left:
              `${percent}%`,

            top: -5,

            width: 10,

            height: 30,

            borderRadius: 7,

            background:
              '#3b2415',

            border:
              '2px solid white',

            boxShadow:
              '0 2px 5px rgba(0,0,0,.25)',

            transform:
              'translateX(-50%)',

            transition:
              'left 80ms linear',
          }}
        />
      </div>


      {/* CHILD FRIENDLY STATUS */}

      <div
        style={{
          marginTop: 9,

          textAlign:
            'center',

          minHeight: 25,

          color:
            '#15803d',

          fontSize: 18,

          fontWeight: 900,
        }}
      >
        {status}
      </div>
    </div>
  );
}


/* ============================================================
   GAME OVER
============================================================ */

function GameOver({
  state,
  level,
  onAgain,
  onLevels,
}: {
  state: GameState;
  level: LevelConfig | null;
  onAgain: () => void;
  onLevels: () => void;
}) {
  const total =
    level?.numHurdles ??
    3;

  const perfect =
    state.hurdlesHit === 0 &&
    state.hurdlesCleared > 0;

  return (
    <div
      style={{
        position:
          'fixed',

        inset: 0,

        padding: 20,

        boxSizing:
          'border-box',

        background:
          'rgba(38,25,55,.78)',

        display: 'flex',

        justifyContent:
          'center',

        alignItems:
          'center',

        zIndex: 1000,

        backdropFilter:
          'blur(5px)',
      }}
    >
      <div
        style={{
          width: 470,

          maxWidth:
            '92vw',

          padding:
            '35px 30px',

          boxSizing:
            'border-box',

          background:
            'linear-gradient(180deg,#fffdf1,#fff2c7)',

          border:
            '5px solid #f59e0b',

          borderRadius: 34,

          textAlign:
            'center',

          boxShadow:
            '0 25px 70px rgba(0,0,0,.3)',
        }}
      >
        <div
          style={{
            fontSize: 82,

            lineHeight: 1,
          }}
        >
          {perfect
            ? '🐶🏆'
            : '🐶🏁'}
        </div>

        <h2
          style={{
            margin:
              '18px 0 5px',

            color:
              '#5b21b6',

            fontSize: 34,
          }}
        >
          {perfect
            ? 'Amazing Race!'
            : 'Great Race!'}
        </h2>

        <p
          style={{
            margin:
              '0 0 22px',

            color:
              '#7c5b43',

            fontWeight: 800,
          }}
        >
          {perfect
            ? 'You cleared every hurdle!'
            : 'Keep practising your voice and jumps!'}
        </p>


        <div
          style={{
            display: 'grid',

            gridTemplateColumns:
              '1fr 1fr',

            gap: 10,

            marginBottom: 24,
          }}
        >
          <ResultCard
            label="SCORE"
            value={`⭐ ${Math.floor(
              state.score
            )}`}
          />

          <ResultCard
            label="CLEARED"
            value={`🚧 ${state.hurdlesCleared}/${total}`}
          />

          <ResultCard
            label="HITS"
            value={`💥 ${state.hurdlesHit}`}
          />

          <ResultCard
            label="VOICE"
            value={`🔊 ${Math.round(
              state.loudnessAccuracy
            )}%`}
          />
        </div>


        <div
          style={{
            display: 'flex',

            justifyContent:
              'center',

            flexWrap:
              'wrap',

            gap: 10,
          }}
        >
          <button
            onClick={
              onAgain
            }
            style={
              primaryButton
            }
          >
            🔄 Race Again
          </button>

          <button
            onClick={
              onLevels
            }
            style={
              secondaryButton
            }
          >
            📋 Levels
          </button>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   RESULT CARD
============================================================ */

function ResultCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding:
          '13px 8px',

        borderRadius: 16,

        background:
          '#fff',

        border:
          '2px solid #f2d79b',
      }}
    >
      <div
        style={{
          fontSize: 11,

          fontWeight: 900,

          color:
            '#8a6748',
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 3,

          fontSize: 21,

          fontWeight: 900,

          color:
            '#4b2d17',
        }}
      >
        {value}
      </div>
    </div>
  );
}


/* ============================================================
   SPEED LABEL
============================================================ */

function speedLabel(
  speed:
    | 'stopped'
    | 'slow'
    | 'normal'
    | 'fast'
): string {
  switch (speed) {
    case 'fast':
      return '🚀 FAST!';

    case 'normal':
      return '🐶 RUNNING';

    case 'slow':
      return '🐾 KEEP GOING';

    default:
      return '🔊 USE YOUR VOICE';
  }
}


/* ============================================================
   BUTTON STYLES
============================================================ */

const primaryButton:
  React.CSSProperties = {
    border:
      '3px solid rgba(255,255,255,.7)',

    borderRadius: 30,

    padding:
      '14px 28px',

    background:
      'linear-gradient(90deg,#10b981,#14b8a6)',

    color: 'white',

    fontWeight: 900,

    fontSize: 17,

    cursor: 'pointer',

    boxShadow:
      '0 6px 0 #087c68, 0 10px 20px rgba(16,185,129,.2)',
  };


const secondaryButton:
  React.CSSProperties = {
    border:
      '3px solid rgba(255,255,255,.7)',

    borderRadius: 30,

    padding:
      '12px 22px',

    background:
      'linear-gradient(90deg,#f59e0b,#f97316)',

    color: 'white',

    fontWeight: 900,

    cursor: 'pointer',

    boxShadow:
      '0 5px 0 #b45309',
  };