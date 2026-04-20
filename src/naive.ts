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
    const view = composeRoot(project(doc.graph, doc.root, new Set(), ops, null), ops, doc.root);
    view.classList.add("rebuild-flash");
    host.appendChild(view);
  };

  rerender();
  return host;
}

function composeRoot(p: Projected, ops: Ops, rootName: string): HTMLElement {
  if (p.kind === "leaf") {
    const wrapper = document.createElement("div");
    wrapper.className = "row";
    wrapper.appendChild(p.input);
    for (const el of edgeAdder((edgeName) => ops.commit(rootName, edgeName, ""))) {
      wrapper.appendChild(el);
    }
    return wrapper;
  }
  const view = document.createElement("div");
  const header = document.createElement("div");
  header.className = "row";
  header.appendChild(p.nameInput);
  header.appendChild(p.toggle);
  view.appendChild(header);
  view.appendChild(p.body);
  return view;
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
  toggle.className = "toggle";
  toggle.textContent = expanded ? "▾" : "▸";

  const body = document.createElement("div");
  body.className = "indent";
  body.style.display = expanded ? "" : "none";

  let built = false;
  const ensureBuilt = (): void => {
    if (built) return;
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
    built = true;
  };
  if (expanded) ensureBuilt();

  let currentExpanded = expanded;
  toggle.addEventListener("click", () => {
    currentExpanded = !currentExpanded;
    if (currentExpanded) ensureBuilt();
    body.style.display = currentExpanded ? "" : "none";
    toggle.textContent = currentExpanded ? "▾" : "▸";
  });

  return { kind: "node", nameInput, toggle, body };
}

// MARK: render — pure DOM construction

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

  const row = document.createElement("div");
  row.className = "row";
  row.appendChild(labelEl);
  row.appendChild(arrow);

  if (childP.kind === "leaf") {
    row.appendChild(childP.input);
    row.appendChild(deleteBtn);
    row.appendChild(addEdgeBelow(row, onAddEdgeToLeaf));
    return row;
  }

  row.appendChild(childP.nameInput);
  row.appendChild(childP.toggle);
  row.appendChild(deleteBtn);

  const wrapper = document.createElement("div");
  wrapper.appendChild(row);
  wrapper.appendChild(childP.body);
  return wrapper;
}

function renderAddEdge(onAdd: (edgeName: string) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  for (const el of edgeAdder(onAdd)) row.appendChild(el);
  return row;
}

function addEdgeBelow(row: HTMLElement, onAdd: (edgeName: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "add-edge";
  button.textContent = "+";

  button.addEventListener("click", () => {
    button.style.display = "none";

    const indent = document.createElement("div");
    indent.className = "indent";
    const input = document.createElement("input");
    input.className = "label-input";
    input.placeholder = "edge name";
    indent.appendChild(input);

    const reset = (): void => {
      indent.remove();
      button.style.display = "";
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) onAdd(input.value.trim());
      else if (e.key === "Escape") reset();
    });
    input.addEventListener("blur", reset);

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
  input.className = "label-input";
  input.placeholder = "edge name";
  input.style.display = "none";

  const reset = (): void => {
    input.value = "";
    input.style.display = "none";
    button.style.display = "";
  };

  button.addEventListener("click", () => {
    button.style.display = "none";
    input.style.display = "";
    input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) onAdd(input.value.trim());
    else if (e.key === "Escape") reset();
  });

  input.addEventListener("blur", reset);

  return [button, input];
}
