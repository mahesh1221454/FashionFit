
/*
 * FASHION FIT - PREMIUM PORTAL EFFECTS
 *
 * Visual effects only.
 * Does not modify API requests, navigation,
 * authentication or application data.
 */

const REVEAL_SELECTOR = [
  ".compact-dress-grid .design-card",
  ".design-grid .design-card",
  ".result-card",
  ".generation-result-card",
  ".collection-card",
  ".category-card",
  ".stat-card",
  ".history-card",
].join(", ");

const ACTIVE_CLASS = "premium-ui-enabled";
const REVEAL_CLASS = "premium-item-reveal";
const VISIBLE_CLASS = "premium-item-visible";

const REDUCED_MOTION =
  "(prefers-reduced-motion: reduce)";

export function initializePortalEffects() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const observedElements = new WeakSet();

  const motionQuery = window.matchMedia(
    REDUCED_MOTION
  );

  let disposed = false;
  let scheduled = false;
  let frameId = null;

  const isPortalPage = () =>
    window.location.pathname !== "/";

  const intersectionObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;

              entry.target.classList.add(
                VISIBLE_CLASS
              );

              intersectionObserver.unobserve(
                entry.target
              );
            }
          },
          {
            threshold: 0.06,
            rootMargin: "0px 0px -20px 0px",
          }
        )
      : null;

  function refreshElements() {
    if (disposed) return;

    const enabled = isPortalPage();

    document.body.classList.toggle(
      ACTIVE_CLASS,
      enabled
    );

    if (!enabled) return;

    const elements = document.querySelectorAll(
      REVEAL_SELECTOR
    );

    let newIndex = 0;

    elements.forEach((element) => {
      if (observedElements.has(element)) return;

      observedElements.add(element);

      if (
        motionQuery.matches ||
        !intersectionObserver
      ) {
        element.classList.add(VISIBLE_CLASS);
        return;
      }

      const rect = element.getBoundingClientRect();

      // Items already on screen should not flash
      // or suddenly disappear during page changes.
      const alreadyVisible =
        rect.top < window.innerHeight &&
        rect.bottom > 0;

      if (alreadyVisible) {
        element.classList.add(VISIBLE_CLASS);
        return;
      }

      element.classList.add(REVEAL_CLASS);

      element.style.setProperty(
        "--premium-delay",
        `${Math.min(newIndex % 6, 5) * 55}ms`
      );

      newIndex++;

      intersectionObserver.observe(element);
    });
  }

  function scheduleRefresh() {
    if (scheduled || disposed) return;

    scheduled = true;

    frameId = requestAnimationFrame(() => {
      scheduled = false;
      frameId = null;
      refreshElements();
    });
  }

  const mutationObserver = new MutationObserver(
    (mutations) => {
      const hasNewContent = mutations.some(
        (mutation) =>
          mutation.addedNodes.length > 0 ||
          mutation.removedNodes.length > 0
      );

      if (hasNewContent) {
        scheduleRefresh();
      }
    }
  );

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  const handleNavigation = () => {
    scheduleRefresh();
  };

  const handleMotionChange = () => {
    document
      .querySelectorAll(`.${REVEAL_CLASS}`)
      .forEach((element) => {
        element.classList.add(VISIBLE_CLASS);
        intersectionObserver?.unobserve(element);
      });

    scheduleRefresh();
  };

  window.addEventListener(
    "popstate",
    handleNavigation
  );

  motionQuery.addEventListener?.(
    "change",
    handleMotionChange
  );

  refreshElements();

  return () => {
    disposed = true;

    mutationObserver.disconnect();
    intersectionObserver?.disconnect();

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }

    window.removeEventListener(
      "popstate",
      handleNavigation
    );

    motionQuery.removeEventListener?.(
      "change",
      handleMotionChange
    );

    document.body.classList.remove(ACTIVE_CLASS);
  };
}
