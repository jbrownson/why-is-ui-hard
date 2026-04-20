import { sampleDocument } from "./model.ts";
import { mountNaive } from "./naive.ts";

const stage = document.getElementById("naive-stage");
if (stage) stage.appendChild(mountNaive(sampleDocument()));
