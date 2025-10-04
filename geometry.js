export function distToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 == 0) return Math.sqrt((p.x-v.x)**2 + (p.y-v.y)**2);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt((p.x - proj.x)**2 + (p.y - proj.y)**2);
}

export function getQuadraticCurveControlPoint(start, end, bendType, bendAmount) {
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist === 0) return { x: mx, y: my };
    const nx = -dy / dist;
    const ny = dx / dist;
    const bendFactor = (bendType === 'bend right' ? -1 : 1) * (bendAmount * dist / 100);
    return { x: mx + bendFactor * nx, y: my + bendFactor * ny };
}
