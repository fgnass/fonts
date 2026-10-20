import { useLayoutEffect, useRef } from 'preact/hooks';
import { BINS, clamp, type Corridor } from '../sliders';

interface Props {
  bins?: Uint16Array;
  value: Corridor;
  marker?: number;
  markerLabel?: string;
}

/** Distribution of fonts behind a range slider, with the inspected font's bin highlighted. */
export function Histogram({ bins, value: [lo, hi], marker, markerLabel }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const off = lo <= 0 && hi >= 1;

  // Draw at the actual device-pixel size, with every bar edge on a whole pixel.
  useLayoutEffect(() => {
    const c = canvas.current!;
    const draw = () => {
      const bounds = c.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (c.width !== width) c.width = width;
      if (c.height !== height) c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      if (!bins || !width || !height) return;
      const css = getComputedStyle(c);
      // Logarithmic scale keeps rare features visible beside a dominant bin.
      const max = Math.log1p(Math.max(1, ...bins));
      const step = width / BINS;
      const gap = Math.max(1, Math.round(ratio));
      const markedBin = marker == null ? -1 : Math.min(BINS - 1, Math.floor(clamp(marker) * BINS));
      bins.forEach((n, i) => {
        if (!n) return;
        const inside = !off && (i + 1) / BINS > lo && i / BINS < hi;
        const marked = i === markedBin;
        // The bin of the inspected font shows in full accent, the others faded.
        ctx.fillStyle = css.getPropertyValue(marked || inside ? '--color-accent' : '--color-muted').trim();
        ctx.globalAlpha = marked ? 1 : inside ? 0.45 : 0.28;
        const len = Math.min(height, Math.max(Math.round(1.2 * ratio), Math.round((Math.log1p(n) / max) * height)));
        const left = Math.round(i * step + gap / 2);
        const right = Math.round((i + 1) * step - gap / 2);
        ctx.fillRect(left, height - len, Math.max(1, right - left), len);
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(c);
    window.addEventListener('resize', draw);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', draw);
    };
  }, [bins, lo, hi, marker]);

  return <canvas class="pointer-events-none absolute bottom-1.5 left-0 h-4 w-full" ref={canvas} title={markerLabel} />;
}
