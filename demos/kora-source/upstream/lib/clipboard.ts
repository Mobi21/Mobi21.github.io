export async function copyText(text: string) {
  let clipboardError: unknown;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (error) {
    clipboardError = error;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.style.pointerEvents = "none";
  document.body.append(field);
  field.focus();
  field.select();
  const copied = typeof document.execCommand === "function" && document.execCommand("copy");
  field.remove();
  if (!copied) throw clipboardError instanceof Error ? clipboardError : new Error("Clipboard access is unavailable.");
}
