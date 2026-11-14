
const RIPPLE_DURATION = 700;

function prefersReducedMotion() {
  return window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
}

export function enableButtonRipples() {
  const handleClick = (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest("button");

    if (!button || button.disabled) {
      return;
    }

    if (prefersReducedMotion()) {
      return;
    }

    const rect = button.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    button.classList.add("fashion-ripple-enabled");

    const ripple = document.createElement("span");

    ripple.className = "fashion-button-ripple";
    ripple.setAttribute("aria-hidden", "true");

    const keyboardClick =
      event.detail === 0;

    const x = keyboardClick
      ? rect.width / 2
      : event.clientX - rect.left;

    const y = keyboardClick
      ? rect.height / 2
      : event.clientY - rect.top;

    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    const maxDistance = Math.max(
      Math.hypot(x, y),
      Math.hypot(rect.width - x, y),
      Math.hypot(x, rect.height - y),
      Math.hypot(rect.width - x, rect.height - y)
    );

    ripple.style.setProperty(
      "--ripple-scale",
      String(Math.max(1, (maxDistance * 2) / 20))
    );

    // Avoid overlapping old ripples.
    button
      .querySelectorAll(".fashion-button-ripple")
      .forEach((oldRipple) => oldRipple.remove());

    button.appendChild(ripple);

    ripple.addEventListener(
      "animationend",
      () => ripple.remove(),
      { once: true }
    );

    setTimeout(() => ripple.remove(), RIPPLE_DURATION);

    // Restart the click illumination.
    button.classList.remove("fashion-premium-click");

    void button.offsetWidth;

    button.classList.add("fashion-premium-click");

    setTimeout(() => {
      button.classList.remove("fashion-premium-click");
    }, 500);
  };

  document.addEventListener("click", handleClick);

  return () => {
    document.removeEventListener("click", handleClick);
  };
}
