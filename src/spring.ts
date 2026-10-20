/** Exact critically damped spring step. Retargeting changes displacement, never velocity. */
export function stepSpring(position: number, velocity: number, seconds: number): [number, number] {
  const frequency = 22;
  const decay = Math.exp(-frequency * seconds);
  const tangent = velocity + frequency * position;
  return [(position + tangent * seconds) * decay, (velocity - frequency * tangent * seconds) * decay];
}
