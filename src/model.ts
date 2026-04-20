export type Graph = Map<string, Map<string, string>>;
export type Delta = Map<string, Map<string, string | null> | null>;
export type Document = { root: string; graph: Graph };

export const applyDelta = (graph: Graph, delta: Delta): Graph => {
  const next = new Map(graph);
  for (const [entity, changes] of delta) {
    if (changes === null) {
      next.delete(entity);
      continue;
    }
    const cur = new Map(next.get(entity) ?? new Map<string, string>());
    for (const [edge, value] of changes) {
      if (value === null) cur.delete(edge);
      else cur.set(edge, value);
    }
    if (cur.size === 0) next.delete(entity);
    else next.set(entity, cur);
  }
  return next;
};

export const sampleDocument = (): Document => ({
  root: "person",
  graph: sampleGraph(),
});

const sampleGraph = (): Graph => new Map([
  ["person", new Map([
    ["name", "Alice"],
    ["favoritePet", "fluffy"],
    ["backupPet", "rex"],
  ])],
  ["fluffy", new Map([
    ["species", "cat"],
    ["color", "orange"],
  ])],
  ["rex", new Map([
    ["species", "dog"],
    ["color", "brown"],
  ])],
]);
