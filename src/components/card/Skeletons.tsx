import { useEffect, useRef } from 'preact/hooks';
import { GRID } from '../../shape.js';
import { drawSkeleton } from '../../skeleton';
import { dimOnHover } from './styles';

const SKELETON_PX = 192; // canvas size of a skeleton on a card (3 px per grid cell)

function Skeleton({ points }: { points: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = getComputedStyle(c).color;
    drawSkeleton(ctx, points, SKELETON_PX / GRID, 5);
  }, [points]);
  return <canvas class="size-(--size) text-bright" ref={canvas} width={SKELETON_PX} height={SKELETON_PX} />;
}

/** The skeletons of a shape search result, one per query letter side by side. */
export function Skeletons({ skeletons, shown }: { skeletons: Uint8Array[]; shown?: boolean }) {
  return (
    <div class={'max-w-full flex-wrap justify-center gap-1 py-[calc(var(--size)*0.1)] ' + dimOnHover + (shown ? ' flex' : ' hidden')}>
      {skeletons.map((p, i) => (
        <Skeleton key={i} points={p} />
      ))}
    </div>
  );
}
