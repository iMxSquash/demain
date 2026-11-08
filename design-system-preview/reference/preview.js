// Shared behaviour of the five direction previews: chart rendering, small
// interactions and entrance motion. Every value comes from the CSS tokens of
// the direction (tokens.css); nothing here is direction specific.
// The chart renderer is pure (string in, string out) so the build script can
// import it to write the static SVG that shows when JavaScript is off.

const Y_MIN_CENTS = 900000;
const Y_MAX_CENTS = 1400000;
const Y_STEP_CENTS = 250000;
const NARROW_CHART_WIDTH = 520;
export const CHART_BOX = { width: 720, height: 280, top: 20, right: 20, bottom: 36, left: 64 };

const round = (n) => Math.round(n * 10) / 10;

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const WHOLE_EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const formatEuros = (cents, { whole = false } = {}) => (whole ? WHOLE_EUROS : EUROS).format(cents / 100);

// Monotone cubic interpolation (Fritsch and Carlson): the curve never
// overshoots between two points, so it never shows a balance that did not exist.
function monotonePath(points) {
  const n = points.length;
  if (n < 2) return "";
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const k = 3 / Math.sqrt(sum);
      tangent[i] = k * a * slope[i];
      tangent[i + 1] = k * b * slope[i];
    }
  }
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${round(points[i].x + h)} ${round(points[i].y + tangent[i] * h)} ${round(points[i + 1].x - h)} ${round(points[i + 1].y - tangent[i + 1] * h)} ${round(points[i + 1].x)} ${round(points[i + 1].y)}`;
  }
  return d;
}

const DAY_MS = 86400000;
const toDay = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS;

// Keeps today, the last and the first label, then fills in from the right
// while every kept label stays at least `gap` pixels from the others.
function pickLabels(points, today, gap) {
  const order = [today, points.at(-1), points[0], ...[...points].reverse()];
  const kept = [];
  for (const p of order) {
    if (kept.includes(p)) continue;
    if (kept.every((k) => Math.abs(k.x - p.x) >= gap)) kept.push(p);
  }
  return kept;
}

/**
 * Returns the inner markup of the balance chart. The x axis is a time scale.
 * @param {{short: string, date: string, cents: number, status: "real" | "planned"}[]} rows
 * @param {number} months number of real points to show (planned points are always shown)
 * @param {number} width drawing width in CSS pixels
 * @param {string} uid suffix for ids, unique per page
 */
export function chartMarkup(rows, months, width = CHART_BOX.width, uid = "c") {
  const { height, top, right, bottom, left } = CHART_BOX;
  const real = rows.filter((r) => r.status === "real").slice(-months);
  const planned = rows.filter((r) => r.status === "planned");
  const shown = [...real, ...planned];
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const firstDay = toDay(shown[0].date);
  const span = toDay(shown.at(-1).date) - firstDay;
  const x = (iso) => left + (plotW * (toDay(iso) - firstDay)) / span;
  const y = (cents) => top + (1 - (cents - Y_MIN_CENTS) / (Y_MAX_CENTS - Y_MIN_CENTS)) * plotH;
  const points = shown.map((r) => ({ x: x(r.date), y: y(r.cents), row: r }));
  const realPts = points.slice(0, real.length);
  const plannedPts = points.slice(real.length - 1);
  const today = realPts.at(-1);
  const labelGap = width < NARROW_CHART_WIDTH ? 56 : 48;

  let grid = "";
  for (let v = Y_MIN_CENTS; v <= Y_MAX_CENTS; v += Y_STEP_CENTS) {
    grid += `<line x1="${left}" x2="${width - right}" y1="${round(y(v))}" y2="${round(y(v))}"/>`;
    grid += `<text x="${left - 12}" y="${round(y(v)) + 4}" text-anchor="end">${formatEuros(v, { whole: true })}</text>`;
  }
  let xLabels = "";
  for (const p of pickLabels(points, today, labelGap)) {
    const anchor = p === points[0] ? "start" : p === points.at(-1) ? "end" : "middle";
    xLabels += `<text x="${round(p.x)}" y="${height - 10}" text-anchor="${anchor}"${p.row.status === "planned" ? ' class="chart__label--planned"' : ""}>${p.row.short}</text>`;
  }

  const realPath = monotonePath(realPts);
  const baseY = round(top + plotH);
  const areaPath = `${realPath}L${round(today.x)} ${baseY}L${round(realPts[0].x)} ${baseY}Z`;
  const plannedPath = monotonePath(plannedPts);
  const plannedDots = plannedPts
    .slice(1)
    .map((p) => `<circle class="chart__planned-dot" cx="${round(p.x)}" cy="${round(p.y)}" r="5"/>`)
    .join("");

  const tipText = `${today.row.short} · ${formatEuros(today.row.cents)}`;
  const tipW = 12 + tipText.length * 7.2;
  const tipX = Math.min(Math.max(today.x - tipW / 2, left), width - right - tipW);
  const tipY = Math.max(today.y - 52, 2);

  return `<defs><linearGradient id="area-${uid}" x1="0" y1="0" x2="0" y2="1"><stop class="chart__stop chart__stop--top" offset="0"/><stop class="chart__stop chart__stop--bottom" offset="1"/></linearGradient></defs>`
    + `<g class="chart__grid">${grid}</g>`
    + `<g class="chart__axis">${xLabels}</g>`
    + `<path class="chart__area" d="${areaPath}" fill="url(#area-${uid})"/>`
    + `<path class="chart__real" d="${realPath}" pathLength="1"/>`
    + `<path class="chart__planned" d="${plannedPath}"/>`
    + `<g class="chart__planned-dots">${plannedDots}</g>`
    + `<g class="chart__today" style="transform-origin:${round(today.x)}px ${round(today.y)}px"><circle class="chart__today-halo" cx="${round(today.x)}" cy="${round(today.y)}" r="9"/><circle class="chart__today-dot" data-glow="data" cx="${round(today.x)}" cy="${round(today.y)}" r="6"/></g>`
    + `<g class="chart__tip"><rect x="${round(tipX)}" y="${round(tipY)}" width="${round(tipW)}" height="30" rx="8"/><text x="${round(tipX + tipW / 2)}" y="${round(tipY + 20)}" text-anchor="middle">${tipText}</text></g>`;
}

/* ---------- Browser side ---------- */

const isBrowser = typeof document !== "undefined";

// Motion tokens of the direction, read once.
function readMotion() {
  const style = getComputedStyle(document.documentElement);
  const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const ms = (name, fallback) => {
    const value = parseFloat(token(name, ""));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    chartMs: ms("--motion-chart-duration", 900),
    springMs: ms("--motion-spring-duration", 600),
    enterMs: ms("--motion-enter-duration", 600),
    staggerMs: ms("--motion-stagger", 60),
    baseMs: ms("--duration-base", 260),
    // Exits run at 75 % of the entrance, so closing feels responsive.
    exitMs: ms("--duration-base", 260) * 0.75,
    nudge: token("--nudge", "2px"),
    distance: token("--motion-enter-distance", "12px"),
    blur: token("--motion-enter-blur", "0px"),
    standard: token("--ease-standard", "ease-out"),
    enter: token("--ease-enter", "ease-out"),
    spring: token("--ease-spring", "ease-out"),
  };
}

function prefersReducedMotion() {
  const forced = new URLSearchParams(location.search).get("motion") === "reduce";
  return forced || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readChartRows(table) {
  return [...table.querySelectorAll("tbody tr")].map((tr) => ({
    short: tr.dataset.short,
    date: tr.dataset.date,
    cents: Number(tr.dataset.cents),
    status: tr.dataset.status,
  }));
}

function animateChart(svg, motion) {
  if (!motion) return;
  const { chartMs: duration, standard: easing, spring, springMs } = motion;
  svg.querySelector(".chart__real")?.animate(
    [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration, easing, fill: "backwards" },
  );
  svg.querySelector(".chart__area")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay: duration * 0.3, easing, fill: "backwards" });
  for (const el of svg.querySelectorAll(".chart__planned, .chart__planned-dots")) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.5, delay: duration, easing, fill: "backwards" });
  }
  svg.querySelector(".chart__today")?.animate(
    [{ transform: "scale(0)" }, { transform: "scale(1)" }],
    { duration: springMs, delay: duration * 0.85, easing: spring, fill: "backwards" },
  );
  svg.querySelector(".chart__today-halo")?.animate(
    [{ transform: "scale(1)", opacity: 0.7 }, { transform: "scale(2.6)", opacity: 0 }],
    { duration: duration, delay: duration + springMs * 0.5, easing, fill: "backwards" },
  );
  svg.querySelector(".chart__tip")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.4, delay: duration, easing, fill: "backwards" });
}

// The tooltip box is sized from an estimate in chartMarkup (no DOM there);
// in the browser it is fitted to the rendered text of the direction's font.
function fitTooltip(svg) {
  const rect = svg.querySelector(".chart__tip rect");
  const text = svg.querySelector(".chart__tip text");
  if (!rect || !text) return;
  const width = text.getComputedTextLength() + 24;
  const center = Number(text.getAttribute("x"));
  const viewWidth = svg.viewBox.baseVal.width;
  const x = Math.min(Math.max(center - width / 2, CHART_BOX.left), viewWidth - CHART_BOX.right - width);
  rect.setAttribute("x", String(round(x)));
  rect.setAttribute("width", String(round(width)));
  text.setAttribute("x", String(round(x + width / 2)));
}

function setupChart(motion) {
  const figure = document.querySelector("[data-chart]");
  if (!figure) return null;
  const svg = figure.querySelector("svg");
  const rows = readChartRows(figure.closest("section").querySelector("[data-chart-table]"));
  let months = Number(figure.querySelector('[data-range][aria-pressed="true"]')?.dataset.range ?? 12);
  let width;
  const render = (animate) => {
    const drawWidth = Math.max(Math.round(width), 280);
    svg.setAttribute("viewBox", `0 0 ${drawWidth} ${CHART_BOX.height}`);
    // Static markup built from the page's own data table, no user input involved.
    svg.innerHTML = chartMarkup(rows, months, drawWidth, "live");
    fitTooltip(svg);
    if (animate) animateChart(svg, motion);
  };
  width = svg.getBoundingClientRect().width;
  render(false);
  new ResizeObserver(([entry]) => {
    const next = entry.contentRect.width;
    if (Math.abs(next - width) < 8) return;
    width = next;
    render(false);
  }).observe(svg);
  for (const chip of figure.querySelectorAll("[data-range]")) {
    chip.addEventListener("click", () => {
      if (chip.getAttribute("aria-pressed") === "true") return;
      for (const other of figure.querySelectorAll("[data-range]")) other.setAttribute("aria-pressed", String(other === chip));
      months = Number(chip.dataset.range);
      render(true);
    });
  }
  return { svg, play: () => animateChart(svg, motion) };
}

// Fades the given elements out, runs the change, then fades them back in, so
// a swapped value or label never changes instantly.
function crossfade(elements, motion, change) {
  if (!motion || elements.length === 0) {
    change();
    return;
  }
  const half = motion.baseMs / 2;
  const out = elements.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half, easing: motion.standard, fill: "forwards" }));
  out[0].finished.then(() => {
    change();
    out.forEach((a) => a.cancel());
    for (const el of elements) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: half, easing: motion.standard });
  }, () => {
    // Rejected only when the fade-out is cancelled by a newer click, which
    // starts its own crossfade: nothing to do here.
  });
}

function setupToggles(motion) {
  for (const button of document.querySelectorAll("[data-toggle]")) {
    const target = document.getElementById(button.getAttribute("aria-controls"));
    const stateClass = button.dataset.toggle;
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(pressed));
      const status = target.querySelector("[data-status-text]");
      crossfade([...target.querySelectorAll("[data-fade]")], motion, () => {
        target.classList.toggle(stateClass, pressed);
        if (status) status.textContent = pressed ? status.dataset.on : status.dataset.off;
      });
    });
  }
}

// details elements open and close by animating their height; the content
// fades in on open. Without motion they keep the native instant toggle.
function setupDisclosures(motion) {
  if (!motion) return;
  for (const details of document.querySelectorAll("details.tx, details.data-table")) {
    const summary = details.querySelector(":scope > summary");
    const content = summary.nextElementSibling;
    let isOpen = details.open;
    let running = null;
    summary.addEventListener("click", (event) => {
      event.preventDefault();
      const start = details.offsetHeight;
      running?.cancel();
      isOpen = !isOpen;
      details.open = true;
      const border = details.offsetHeight - details.clientHeight;
      const end = isOpen ? details.offsetHeight : summary.offsetHeight + border;
      const duration = isOpen ? motion.baseMs : motion.exitMs;
      details.style.overflow = "hidden";
      running = details.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration, easing: motion.standard });
      content.animate(
        isOpen
          ? [{ opacity: 0, transform: `translateY(calc(-1 * ${motion.nudge}))` }, { opacity: 1, transform: "none" }]
          : [{ opacity: 1 }, { opacity: 0 }],
        { duration, easing: motion.standard, fill: isOpen ? "none" : "forwards" },
      );
      running.onfinish = () => {
        details.style.overflow = "";
        if (!isOpen) details.open = false;
        for (const a of content.getAnimations()) a.cancel();
        running = null;
      };
    });
  }
}

// Rows leaving the filter collapse and fade, rows entering grow back, instead
// of appearing or disappearing at once.
function showItem(item, visible, motion, gap) {
  if (!motion) {
    item.hidden = !visible;
    return;
  }
  if (visible === !item.hidden && !item.getAnimations().length) return;
  for (const a of item.getAnimations()) a.cancel();
  item.hidden = false;
  const height = item.offsetHeight;
  const shown = { height: `${height}px`, opacity: 1, marginBottom: "0px" };
  const gone = { height: "0px", opacity: 0, marginBottom: `-${gap}px` };
  item.style.overflow = "hidden";
  const animation = item.animate(visible ? [gone, shown] : [shown, gone], {
    duration: visible ? motion.baseMs : motion.exitMs,
    easing: motion.standard,
  });
  animation.onfinish = () => {
    item.style.overflow = "";
    item.hidden = !visible;
  };
}

function setupFilters(motion) {
  const group = document.querySelector("[data-filter-group]");
  if (!group) return;
  const list = document.getElementById(group.getAttribute("aria-controls"));
  const live = document.querySelector("[data-filter-count]");
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  for (const chip of group.querySelectorAll("[data-filter]")) {
    chip.addEventListener("click", () => {
      for (const other of group.querySelectorAll("[data-filter]")) other.setAttribute("aria-pressed", String(other === chip));
      const filter = chip.dataset.filter;
      let count = 0;
      for (const item of list.children) {
        const visible = filter === "all" || item.dataset.kind === filter;
        showItem(item, visible, motion, gap);
        if (visible) count++;
      }
      if (live) live.textContent = `${count} opération${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}`;
    });
  }
}

function setupForm(motion) {
  const form = document.querySelector("[data-demo-form]");
  if (!form) return;
  const status = form.querySelector("[data-form-status]");
  const announce = (text) => {
    status.textContent = text;
    if (!motion) return;
    status.animate([{ opacity: 0, transform: `translateY(${motion.nudge})` }, { opacity: 1, transform: "none" }], {
      duration: motion.baseMs,
      easing: motion.standard,
    });
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const invalid = form.querySelector('[aria-invalid="true"]');
    if (invalid) {
      invalid.focus();
      announce("Une erreur empêche l'enregistrement : corrigez la date.");
      return;
    }
    announce("Opération enregistrée (démonstration, rien n'est envoyé).");
  });
}

function setupEntrance(motion, chart) {
  const items = [...document.querySelectorAll("[data-reveal]")];
  if (!motion || !("IntersectionObserver" in window)) return;
  const { enterMs: duration, staggerMs: stagger, distance, blur, enter: easing } = motion;
  // A block is hidden only after the observer has reported it off screen, so
  // the page stays fully readable without JavaScript or if the observer never fires.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting && !e.target.dataset.revealArmed) {
          e.target.dataset.revealArmed = "true";
          e.target.style.opacity = "0";
        }
      }
      const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      visible.forEach((el, i) => {
        observer.unobserve(el);
        el.style.opacity = "";
        el.animate(
          [
            { opacity: 0, transform: `translateY(${distance})`, filter: `blur(${blur})` },
            { opacity: 1, transform: "none", filter: "blur(0px)" },
          ],
          { duration, delay: i * stagger, easing, fill: "backwards" },
        );
        if (chart && el.contains(chart.svg)) chart.play();
      });
    },
    { threshold: 0.12 },
  );
  for (const el of items) observer.observe(el);
}

if (isBrowser) {
  const reduced = prefersReducedMotion();
  document.documentElement.dataset.motion = reduced ? "reduce" : "full";
  // null under reduced motion: every animation is skipped.
  const motion = reduced ? null : readMotion();
  const chart = setupChart(motion);
  setupToggles(motion);
  setupDisclosures(motion);
  setupFilters(motion);
  setupForm(motion);
  setupEntrance(motion, chart);
}
