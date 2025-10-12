// @ts-nocheck

function segmentLength(segment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  return Math.hypot(dx, dy);
}

function resolveAngle(segments, fromStart = true) {
  const ordered = fromStart ? segments : [...segments].reverse();
  for (const segment of ordered) {
    const dx = segment.end.x - segment.start.x;
    const dy = segment.end.y - segment.start.y;
    if (dx !== 0 || dy !== 0) {
      return Math.atan2(dy, dx);
    }
  }
  return 0;
}

function resolveLabelPoint(segments) {
  const total = segments.reduce((sum, segment) => sum + segmentLength(segment), 0);
  if (total === 0) {
    const [first] = segments;
    return { x: first.start.x, y: first.start.y };
  }

  const halfway = total / 2;
  let accumulated = 0;
  for (const segment of segments) {
    const length = segmentLength(segment);
    if (length === 0) {
      continue;
    }
    if (accumulated + length >= halfway) {
      const ratio = (halfway - accumulated) / length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    accumulated += length;
  }

  const last = segments[segments.length - 1];
  return { x: last.end.x, y: last.end.y };
}

export function computeOrthogonalGeometry(startPoint, endPoint, mode) {
  if (mode !== '90-vertical' && mode !== '90-horizontal') {
    throw new Error(`Unsupported orthogonal mode: ${mode}`);
  }

  const elbow = mode === '90-vertical'
    ? { x: startPoint.x, y: endPoint.y }
    : { x: endPoint.x, y: startPoint.y };

  const segments = [
    { start: { ...startPoint }, end: { ...elbow } },
    { start: { ...elbow }, end: { ...endPoint } },
  ];

  const startAngle = resolveAngle(segments, true);
  const endAngle = resolveAngle(segments, false);
  const labelPoint = resolveLabelPoint(segments);

  return {
    elbow,
    segments,
    startAngle,
    endAngle,
    labelPoint,
  };
}

