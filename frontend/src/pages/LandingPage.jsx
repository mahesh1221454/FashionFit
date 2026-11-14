
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { loginCollectionAdmin } from "../services/api";

import {
  getPortalSession,
  savePortalSession,
} from "../services/portalSession";

import "../styles/landing.css";

// ==================================================
// ANIMATION CONFIGURATION
// ==================================================

const TOTAL_FRAMES = 249;

const CAPTIONS = [
  {
    text: "Fashion Meets Intelligence.",
    start: 0,
    end: 33,
  },
  {
    text: "See Your Style Before You Wear It.",
    start: 33,
    end: 66,
  },
  {
    text: "Experience Fashion Like Never Before.",
    start: 66,
    end: 100,
  },
];

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

const smoothstep = (start, end, value) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};

const getFrameUrl = (index) =>
  `/landing-frames/frame_${String(index).padStart(6, "0")}.webp`;

// ==================================================
// WORD ANIMATION
// Each word receives its own scroll-driven style.
// ==================================================

function getWordStyle(
  caption,
  captionIndex,
  wordIndex,
  wordCount,
  scrollPercent,
  reducedMotion
) {
  const sectionLength = caption.end - caption.start;

  const local = clamp(
    (scrollPercent - caption.start) / sectionLength
  );

  const inSection =
    scrollPercent >= caption.start &&
    (scrollPercent < caption.end ||
      captionIndex === CAPTIONS.length - 1);

  if (reducedMotion) {
    return {
      opacity: inSection ? 1 : 0,
      transform: "none",
      filter: "none",
      color: "#FFF2D8",
      textShadow: "0 3px 12px rgba(0,0,0,.9)",
    };
  }

  // Words enter consecutively, not all at once.
  const stagger =
    wordIndex / Math.max(1, wordCount - 1);

  const revealStart = 0.025 + stagger * 0.49;
  const revealEnd = revealStart + 0.20;

  const reveal = smoothstep(
    revealStart,
    revealEnd,
    local
  );

  // Fade the entire previous caption near the end.
  // The final caption remains visible at 100%.
  const exit =
    captionIndex === CAPTIONS.length - 1
      ? 1
      : 1 - smoothstep(0.84, 0.99, local);

  const opacity = reveal * exit;

  // Each word rises into its final position.
  const translateY = (1 - reveal) * 35;

  // Blur disappears as each word becomes visible.
  const blur = (1 - reveal) * 9;

  // Slight scaling creates a cinematic depth effect.
  const scale = 0.94 + reveal * 0.06;

  // Gold transitions into warm ivory.
  const gold = [255, 194, 92];
  const ivory = [255, 246, 227];

  const colorProgress = smoothstep(
    0.25,
    0.92,
    reveal
  );

  const red = Math.round(
    gold[0] + (ivory[0] - gold[0]) * colorProgress
  );

  const green = Math.round(
    gold[1] + (ivory[1] - gold[1]) * colorProgress
  );

  const blue = Math.round(
    gold[2] + (ivory[2] - gold[2]) * colorProgress
  );

  // Gold illumination during the reveal.
  const glow = Math.sin(reveal * Math.PI);
  const glowStrength = Math.max(0, glow);

  return {
    opacity,
    color: `rgb(${red}, ${green}, ${blue})`,
    transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
    filter: `blur(${blur}px)`,
    textShadow: `
      0 2px 12px rgba(0,0,0,.95),
      0 4px 28px rgba(0,0,0,.75),
      0 0 ${10 + glowStrength * 16}px rgba(255,183,76,${glowStrength * 0.85})
    `,
  };
}

// ==================================================
// LANDING PAGE
// ==================================================

export default function LandingPage() {
  const navigate = useNavigate();

  const scrollSectionRef = useRef(null);
  const canvasRef = useRef(null);

  const frameCacheRef = useRef(new Map());
  const currentFrameRef = useRef(0);

  const [scrollPercent, setScrollPercent] = useState(0);
  const [introOpacity, setIntroOpacity] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loggedIn, setLoggedIn] = useState(
    Boolean(getPortalSession())
  );

  // ==================================================
  // FRAME-BY-FRAME SCROLL ANIMATION
  // ==================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = scrollSectionRef.current;

    const ctx = canvas?.getContext("2d", {
      alpha: false,
    });

    if (!canvas || !section || !ctx) return;

    const cache = frameCacheRef.current;

    let active = true;
    let animationId = null;
    let lastDrawnFrame = -1;

    const motionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    let motionReduced = motionQuery.matches;

    setReducedMotion(motionReduced);

    // --------------------------------------------------
    // Draw a frame, covering the entire visible screen.
    // --------------------------------------------------

    const drawImage = (image, frameIndex) => {
      if (
        !active ||
        !image ||
        !image.naturalWidth ||
        !image.naturalHeight
      ) {
        return;
      }

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const scale = Math.max(
        canvasWidth / image.naturalWidth,
        canvasHeight / image.naturalHeight
      );

      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;

      const x = (canvasWidth - drawWidth) / 2;
      const y = (canvasHeight - drawHeight) / 2;

      ctx.fillStyle = "#000";
      ctx.fillRect(
        0,
        0,
        canvasWidth,
        canvasHeight
      );

      ctx.drawImage(
        image,
        x,
        y,
        drawWidth,
        drawHeight
      );

      lastDrawnFrame = frameIndex;
    };

    // --------------------------------------------------
    // Load a WebP frame.
    // --------------------------------------------------

    const loadFrame = (index) => {
      if (index < 0 || index >= TOTAL_FRAMES) {
        return;
      }

      if (cache.has(index)) {
        return;
      }

      const image = new Image();

      cache.set(index, image);

      image.onload = () => {
        if (!active) return;

        if (currentFrameRef.current === index) {
          drawImage(image, index);
        }
      };

      image.onerror = () => {
        if (cache.get(index) === image) {
          cache.delete(index);
        }
      };

      image.src = getFrameUrl(index);
    };

    // --------------------------------------------------
    // Display frame and preload adjacent frames.
    // --------------------------------------------------

    const displayFrame = (frameIndex) => {
      const index = Math.round(
        clamp(frameIndex, 0, TOTAL_FRAMES - 1)
      );

      currentFrameRef.current = index;

      const image = cache.get(index);

      if (
        image?.complete &&
        image.naturalWidth > 0 &&
        lastDrawnFrame !== index
      ) {
        drawImage(image, index);
      } else if (!image) {
        loadFrame(index);
      }

      // Preload neighboring frames.
      for (let offset = 1; offset <= 6; offset++) {
        loadFrame(index + offset);
        loadFrame(index - offset);
      }

      // Prevent excessive memory consumption.
      for (const [key] of cache.entries()) {
        if (Math.abs(key - index) > 22) {
          cache.delete(key);
        }
      }
    };

    // --------------------------------------------------
    // Synchronize frames and captions with scrolling.
    // --------------------------------------------------

    const updateScroll = () => {
      animationId = null;

      const rect = section.getBoundingClientRect();

      const scrollDistance = Math.max(
        1,
        section.offsetHeight - window.innerHeight
      );

      const progress = clamp(
        -rect.top / scrollDistance
      );

      setIntroOpacity(
        1 - smoothstep(0.01, 0.16, progress)
      );

      const effectiveProgress = motionReduced
        ? 0
        : clamp((progress - 0.16) / 0.84);

      const percentage = effectiveProgress * 100;

      setScrollPercent(percentage);

      const frameIndex = Math.round(
        effectiveProgress * (TOTAL_FRAMES - 1)
      );

      displayFrame(frameIndex);
    };

    const onScroll = () => {
      if (animationId === null) {
        animationId = requestAnimationFrame(
          updateScroll
        );
      }
    };

    const onResize = () => {
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2
      );

      canvas.width = Math.round(
        window.innerWidth * pixelRatio
      );

      canvas.height = Math.round(
        window.innerHeight * pixelRatio
      );

      lastDrawnFrame = -1;

      updateScroll();
    };

    const onMotionChange = (event) => {
      motionReduced = event.matches;
      setReducedMotion(event.matches);
      onResize();
    };

    // First frame.
    loadFrame(0);

    onResize();

    window.addEventListener(
      "scroll",
      onScroll,
      { passive: true }
    );

    window.addEventListener(
      "resize",
      onResize
    );

    motionQuery.addEventListener?.(
      "change",
      onMotionChange
    );

    return () => {
      active = false;

      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }

      window.removeEventListener(
        "scroll",
        onScroll
      );

      window.removeEventListener(
        "resize",
        onResize
      );

      motionQuery.removeEventListener?.(
        "change",
        onMotionChange
      );

      cache.clear();
    };
  }, []);

  // ==================================================
  // LOGIN POPUP KEYBOARD HANDLING
  // ==================================================

  useEffect(() => {
    if (!showLogin) return;

    const onEscape = (event) => {
      if (
        event.key === "Escape" &&
        !loading
      ) {
        setShowLogin(false);
      }
    };

    window.addEventListener(
      "keydown",
      onEscape
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onEscape
      );
    };
  }, [showLogin, loading]);

  // ==================================================
  // LOGIN HANDLERS
  // ==================================================

  const handleLoginButton = () => {
    if (getPortalSession()) {
      navigate("/portal");
      return;
    }

    setLoggedIn(false);
    setError("");
    setShowLogin(true);
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await loginCollectionAdmin({
        username: username.trim(),
        password,
      });

      savePortalSession(response);

      setLoggedIn(true);
      setShowLogin(false);
      setPassword("");

      navigate("/portal", {
        replace: true,
      });
    } catch (err) {
      const detail =
        err?.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : err?.message ||
            "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // UI
  // ==================================================

  return (
    <main className="fashion-landing">

      {/* TOP-LEFT COMPANY LOGO */}
      <div className="fashion-brand">
        <img
          src="/brand-logo.png"
          alt="Intelera"
          className="fashion-brand-logo"
        />
      </div>

      {/* TOP-RIGHT LOGIN BUTTON */}
      <button
        type="button"
        className="fashion-login-button"
        onClick={handleLoginButton}
      >
        {loggedIn ? "Enter Portal" : "Login"}
      </button>

      {/* CINEMATIC WORD-BY-WORD CAPTIONS */}
      <div className="fashion-caption-container">
        {CAPTIONS.map((caption, captionIndex) => {
          const words = caption.text.split(" ");

          return (
            <h1
              key={captionIndex}
              className="fashion-cinematic-caption"
              aria-label={caption.text}
            >
              {words.map((word, wordIndex) => {
                const style = getWordStyle(
                  caption,
                  captionIndex,
                  wordIndex,
                  words.length,
                  scrollPercent,
                  reducedMotion
                );

                return (
                  <span
                    key={`${captionIndex}-${wordIndex}`}
                    className="fashion-cinematic-word"
                    aria-hidden="true"
                    style={style}
                  >
                    {word}
                  </span>
                );
              })}
            </h1>
          );
        })}
      </div>

      {/* THE EXISTING 249-FRAME ANIMATION */}
      {/* PERFECTMESS OPENING IMAGE */}
      
<section
        ref={scrollSectionRef}
        className="fashion-scroll-section"
      >
        <div className="fashion-sticky-frame">
          {/* FASHIONFIT_SEAMLESS_TRANSITION */}
          <div className="perfectmess-home-intro" style={{ opacity: introOpacity, transform: `scale(${1 + (1 - introOpacity) * 0.045})` }}>
  <img
    src="/perfectmess-home.png"
    alt="PerfectMess AI Virtual Try-On"
    fetchPriority="high"
  />

  <div className="perfectmess-home-overlay">
    <div className="perfectmess-home-copy">
      <span className="perfectmess-home-tag">
        PREMIUM MENSWEAR
      </span>

      <h1 className="perfectmess-home-title">
        FashionFit
      </h1>

      <p className="perfectmess-home-subtitle">
        Discover a smarter way to explore premium men’s fashion
        and visualize your style before you wear it.
      </p>
    </div>
  </div>
      {/* SCROLL INDICATOR */}
      <div className="fashion-scroll-hint" aria-hidden="true">
        <span className="fashion-scroll-hint-arrow">↑</span>
        <span className="fashion-scroll-hint-text">
          Scroll Down for a Better Experience
        </span>
      </div>
</div>

          <canvas
            ref={canvasRef}
            className="fashion-frame-canvas"
            role="img"
            aria-label="Fashion transformation animation"
          />
        </div>
      </section>

      {/* LOGIN POPUP */}
      {showLogin && (
        <div
          className="fashion-login-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !loading
            ) {
              setShowLogin(false);
            }
          }}
        >
          <div
            className="fashion-login-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fashion-login-heading"
          >
            

            <h2 id="fashion-login-heading">
              Welcome
            </h2>

            <form onSubmit={handleLogin}>
              <label htmlFor="fashion-username">
                Username
              </label>

              <input
                id="fashion-username"
                type="text"
                placeholder="Enter username"
                autoComplete="username"
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                disabled={loading}
                maxLength={150}
                required
                autoFocus
              />

              <label htmlFor="fashion-password">
                Password
              </label>

              <input
                id="fashion-password"
                type="password"
                placeholder="Enter password"
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                disabled={loading}
                required
              />

              {error && (
                <p
                  className="fashion-login-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="fashion-submit-button"
                disabled={loading}
              >
                {loading
                  ? "Signing in..."
                  : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}






