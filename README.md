# UI Experiment — Derivative Updates

A side-by-side comparison of UI rendering strategies on a minimal graph model, exploring the question:

> When the model changes, how do we update the UI without losing user-direct state (cursor, focus, expansion, etc.)?

## Run

```sh
cd ui-experiment
npm install   # one-time
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>).

## The model

A graph of strings: `{ entity: { edge: value } }` where everything is a string. If a value happens to be the name of another entity, projection recurses into it.

That's the whole substrate. No types, no schema, no records. Just enough structure to have:

- **Editable values** (text inputs holding cursor and selection state)
- **Recursive structure** (one entity referencing another)
- **UI-only state** (per-entity expansion, not stored in the graph)

## What this demonstrates

Run any implementation and try the following — watch what each strategy does:

1. **Type a character into a value** — does the cursor stay where it was?
2. **Click to focus a different value, then make an edit elsewhere** — does the focused field stay focused?
3. **Collapse a sub-entity, then change something** — does the collapse state survive?

Each implementation handles these differently. Naive rebuild fails them all. Smarter strategies preserve various amounts of state. The reader gets to *feel* the difference.

## Implementations (planned)

- **Naive** — full rebuild on every change.
- **Virtual-DOM-style** — diff old/new representation, apply minimal patches.
- **React** — to demonstrate what frameworks do and don't solve.
- **Derivative** — each component knows what it depends on; on change, decides skip / recurse / rebuild.

The interesting comparison is what kinds of UI state survive each model mutation under each strategy.
