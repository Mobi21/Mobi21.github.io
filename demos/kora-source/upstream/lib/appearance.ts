export const APPEARANCE_KEY = "kora.appearance.v1";

export type AppearancePreferences = {
  version: 1;
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  scale: 0.9 | 1 | 1.1 | 1.25;
};

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  version: 1,
  theme: "system",
  density: "comfortable",
  scale: 1,
};

let startupScaleError: string | undefined;

export function readAppearanceStartupError() {
  return startupScaleError;
}

export function clearAppearanceStartupError() {
  startupScaleError = undefined;
}

export function readAppearance(): AppearancePreferences {
  try {
    const candidate = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "{}") as Partial<AppearancePreferences>;
    return {
      version: 1,
      theme: candidate.theme === "light" || candidate.theme === "dark" ? candidate.theme : "system",
      density: candidate.density === "compact" ? "compact" : "comfortable",
      scale: candidate.scale === 0.9 || candidate.scale === 1.1 || candidate.scale === 1.25 ? candidate.scale : 1,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(preferences: AppearancePreferences) {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.density = preferences.density;
}

export async function applyStartupAppearance(
  applyInterfaceScale?: (scale: AppearancePreferences["scale"]) => Promise<unknown>,
) {
  const preferences = readAppearance();
  startupScaleError = undefined;
  applyAppearance(preferences);
  if (applyInterfaceScale) {
    try {
      await applyInterfaceScale(preferences.scale);
    } catch (error) {
      // A native startup failure should leave the renderer usable. Keep the
      // user's saved choice visible and let the Appearance page report that
      // the host could not apply it during this launch.
      startupScaleError = error instanceof Error
        ? error.message
        : "Kora could not apply the saved interface scale.";
    }
  }
  return preferences;
}

export function saveAppearance(preferences: AppearancePreferences) {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preferences));
  applyAppearance(preferences);
  window.dispatchEvent(new CustomEvent("kora:appearance-changed", { detail: preferences }));
}

