const anchorRegistry = new Map();

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

function normalizeName(name) {
  if (typeof name !== 'string') {
    throw new Error('Anchor names must be strings.');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Anchor names must be non-empty strings.');
  }
  return trimmed;
}

function ensurePointFunction(anchor) {
  if (anchor == null || typeof anchor !== 'object') {
    throw new Error('Anchor definition must be an object.');
  }
  if (!hasOwn(anchor, 'getPoint') || typeof anchor.getPoint !== 'function') {
    throw new Error(`Anchor "${anchor.id}" must provide a "getPoint(node)" function.`);
  }
}

export function registerShapeAnchors(shapeName, anchors) {
  const shape = normalizeName(shapeName);
  if (!Array.isArray(anchors) || anchors.length === 0) {
    throw new Error(`Anchors for shape "${shape}" must be provided as a non-empty array.`);
  }

  const anchorMap = new Map();
  anchors.forEach(anchor => {
    if (typeof anchor !== 'object' || anchor == null) {
      throw new Error(`Invalid anchor definition for shape "${shape}".`);
    }
    const id = normalizeName(anchor.id);
    ensurePointFunction(anchor);
    const record = {
      id,
      canonicalId: id,
      tikz: normalizeName(anchor.tikz ?? id),
      isConnectable: Boolean(anchor.isConnectable),
      getPoint: anchor.getPoint,
      metadata: anchor.metadata ?? null,
    };
    if (anchorMap.has(id)) {
      throw new Error(`Duplicate anchor "${id}" for shape "${shape}".`);
    }
    anchorMap.set(id, record);
    if (Array.isArray(anchor.aliases)) {
      anchor.aliases.forEach(aliasName => {
        const alias = normalizeName(aliasName);
        if (anchorMap.has(alias)) {
          throw new Error(
            `Duplicate anchor alias "${alias}" for shape "${shape}". Anchors and aliases must be unique.`
          );
        }
        anchorMap.set(alias, record);
      });
    }
  });

  anchorRegistry.set(shape, anchorMap);
}

export function getShapeAnchors(shapeName) {
  const shape = normalizeName(shapeName);
  const anchors = anchorRegistry.get(shape);
  if (!anchors) return [];
  const unique = new Map();
  anchors.forEach(record => {
    if (!unique.has(record.canonicalId)) {
      unique.set(record.canonicalId, record);
    }
  });
  return Array.from(unique.values());
}

export function findShapeAnchor(shapeName, anchorId) {
  const shape = normalizeName(shapeName);
  const anchors = anchorRegistry.get(shape);
  if (!anchors) return null;
  const id = normalizeName(anchorId);
  return anchors.get(id) ?? null;
}

export function listRegisteredAnchorShapes() {
  return Array.from(anchorRegistry.keys());
}
