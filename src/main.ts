import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import "highlight.js/styles/atom-one-light.css";
import "./style.css";

import { sampleDocument } from "./model.ts";
import { mountNaive } from "./naive.ts";
import naiveSource from "./naive.ts?raw";

hljs.registerLanguage("typescript", typescript);

const naivePanel = document.getElementById("naive-panel");
if (naivePanel) {
  mountPanel(naivePanel, mountNaive(sampleDocument()), naiveSource);
}

function mountPanel(panel: HTMLElement, demo: HTMLElement, source: string): void {
  const stage = panel.querySelector('[data-pane="demo"]');
  const code = panel.querySelector('[data-pane="code"]');
  if (stage) stage.appendChild(demo);
  if (code) {
    code.classList.add("hljs");
    code.innerHTML = hljs.highlight(source, { language: "typescript" }).value;
  }

  const tabs = panel.querySelectorAll<HTMLElement>(".tab");
  const panes = panel.querySelectorAll<HTMLElement>("[data-pane]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.show;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panes.forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== target));
    });
  });
}
