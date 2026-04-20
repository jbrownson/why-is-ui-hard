// Naive: every model change tears down the view tree and rebuilds from
// scratch. UI state (cursor position, focus, expansion) lives on view
// instances; rebuilding throws those instances away.

import { applyDelta, type Delta, type Document, type Graph } from "./model.ts";

type Ops = {
  commit: (node: string, edge: string, value: string) => void;
  rename: (node: string, oldEdge: string, newEdge: string) => void;
  remove: (node: string, edge: string) => void;
  renameNode: (oldName: string, newName: string) => void;
};

type Projected =
  | { kind: "leaf"; input: HTMLInputElement }
  | { kind: "node"; nameInput: HTMLInputElement; toggle: HTMLElement; body: HTMLElement };

export function mountNaive(doc: Document): HTMLElement {
  const host = document.createElement("div");

  const ops: Ops = {
    commit: (node, edge, value) => {
      doc.graph = applyDelta(doc.graph, new Map([[node, new Map([[edge, value]])]]));
      rerender();
    },
    rename: (node, oldEdge, newEdge) => {
      const value = doc.graph.get(node)?.get(oldEdge);
      if (value === undefined) return;
      doc.graph = applyDelta(
        doc.graph,
        new Map([[node, new Map<string, string | null>([[oldEdge, null], [newEdge, value]])]]),
      );
      rerender();
    },
    remove: (node, edge) => {
      doc.graph = applyDelta(
        doc.graph,
        new Map([[node, new Map<string, string | null>([[edge, null]])]]),
      );
      rerender();
    },
    renameNode: (oldName, newName) => {
      if (oldName === newName) return;
      const edges = doc.graph.get(oldName);
      if (!edges) return;
      const delta: Delta = new Map();
      delta.set(oldName, null);
      delta.set(newName, edges);
      for (const [entity, entityEdges] of doc.graph) {
        if (entity === oldName) continue;
        const updates = new Map<string, string | null>();
        for (const [edge, value] of entityEdges) {
          if (value === oldName) updates.set(edge, newName);
        }
        if (updates.size > 0) delta.set(entity, updates);
      }
      doc.graph = applyDelta(doc.graph, delta);
      if (doc.root === oldName) doc.root = newName;
      rerender();
    },
  };

  const rerender = (): void => {
    host.innerHTML = "";
    const projected = project(doc.graph, doc.root, new Set(), ops, null);
    const view = renderProjected(projected, [], [], (edgeName) => ops.commit(doc.root, edgeName, ""));
    view.classList.add("rebuild-flash");
    host.appendChild(view);
  };

  rerender();
  return host;
}

// MARK: project — walk the graph, decide what to render

function project(
  graph: Graph,
  value: string,
  ancestors: Set<string>,
  ops: Ops,
  onChange: ((s: string) => void) | null,
): Projected {
  const edges = graph.get(value);

  if (!edges) {
    const input = document.createElement("input");
    input.className = "value-input";
    input.value = value;
    if (onChange) input.addEventListener("input", () => onChange(input.value));
    else input.readOnly = true;
    return { kind: "leaf", input };
  }

  const isCycle = ancestors.has(value);
  const expanded = !isCycle;
  const childAncestors = new Set(ancestors).add(value);

  const nameInput = document.createElement("input");
  nameInput.className = "value-input";
  nameInput.value = value;
  nameInput.addEventListener("input", () => {
    const trimmed = nameInput.value.trim();
    if (trimmed) ops.renameNode(value, trimmed);
  });

  const toggle = document.createElement("span");
  toggle.className = expanded ? "toggle" : "toggle collapsed";

  const body = document.createElement("div");
  body.className = expanded ? "indent" : "indent hidden";

  const ensureBuilt = (): void => {
    if (body.children.length > 0) return;
    [...edges]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([edge, child]) => {
        const childP = project(graph, child, childAncestors, ops, (s) => ops.commit(value, edge, s));
        body.appendChild(
          renderEdge(
            edge,
            (newEdge) => ops.rename(value, edge, newEdge),
            () => ops.remove(value, edge),
            childP,
            (edgeName) => ops.commit(child, edgeName, ""),
          ),
        );
      });
    body.appendChild(renderAddEdge((edgeName) => ops.commit(value, edgeName, "")));
  };
  if (expanded) ensureBuilt();

  toggle.addEventListener("click", () => {
    const willExpand = body.classList.contains("hidden");
    if (willExpand) ensureBuilt();
    body.classList.toggle("hidden");
    toggle.classList.toggle("collapsed");
  });

  return { kind: "node", nameInput, toggle, body };
}

// MARK: render — pure DOM construction

function renderProjected(
  p: Projected,
  prefix: HTMLElement[],
  suffix: HTMLElement[],
  onAddEdge: (edgeName: string) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.append(...prefix);

  if (p.kind === "leaf") {
    row.append(p.input, ...suffix, addEdgeBelow(row, onAddEdge));
    return row;
  }

  row.append(p.nameInput, p.toggle, ...suffix);

  const wrapper = document.createElement("div");
  wrapper.appendChild(row);
  wrapper.appendChild(p.body);
  return wrapper;
}

function renderEdge(
  label: string,
  onRename: (newLabel: string) => void,
  onDelete: () => void,
  childP: Projected,
  onAddEdgeToLeaf: (edgeName: string) => void,
): HTMLElement {
  const labelEl = document.createElement("input");
  labelEl.className = "label";
  labelEl.value = label;
  labelEl.addEventListener("input", () => {
    const trimmed = labelEl.value.trim();
    if (trimmed) onRename(trimmed);
  });

  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.textContent = "→";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-edge";
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", onDelete);

  return renderProjected(childP, [labelEl, arrow], [deleteBtn], onAddEdgeToLeaf);
}

function renderAddEdge(onAdd: (edgeName: string) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  row.append(...edgeAdder(onAdd));
  return row;
}

function addEdgeBelow(row: HTMLElement, onAdd: (edgeName: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "add-edge";
  button.textContent = "+";

  button.addEventListener("click", () => {
    button.classList.add("hidden");

    const indent = document.createElement("div");
    indent.className = "indent";
    const input = document.createElement("input");
    input.className = "label-input";
    input.placeholder = "edge name";
    indent.appendChild(input);

    bindAdderInput(input, onAdd, () => {
      indent.remove();
      button.classList.remove("hidden");
    });

    row.after(indent);
    input.focus();
  });

  return button;
}

function edgeAdder(onAdd: (edgeName: string) => void): HTMLElement[] {
  const button = document.createElement("button");
  button.className = "add-edge";
  button.textContent = "+";

  const input = document.createElement("input");
  input.className = "label-input hidden";
  input.placeholder = "edge name";

  button.addEventListener("click", () => {
    button.classList.add("hidden");
    input.classList.remove("hidden");
    input.focus();
  });

  bindAdderInput(input, onAdd, () => {
    input.value = "";
    input.classList.add("hidden");
    button.classList.remove("hidden");
  });

  return [button, input];
}

function bindAdderInput(
  input: HTMLInputElement,
  onCommit: (edgeName: string) => void,
  onCancel: () => void,
): void {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) onCommit(input.value.trim());
    else if (e.key === "Escape") onCancel();
  });
  input.addEventListener("blur", onCancel);
}
