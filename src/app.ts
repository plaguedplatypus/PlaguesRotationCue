import "./styles.css";
import "./settings.css";
import { State } from "./state";
import { mountApp } from "./ui/main";
import { maybeShowToast } from "./updates/updateToast";

if (window.alt1) {
  try {
    window.alt1.identifyAppUrl("./appconfig.json");
  } catch (error) {
    console.warn("Rotation Cue could not identify itself to Alt1", error);
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Rotation Cue app root was not found.");

mountApp(root, new State());
maybeShowToast();
