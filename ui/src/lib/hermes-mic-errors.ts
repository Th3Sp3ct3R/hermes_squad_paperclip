export function formatHermesMicError(err: unknown): string {
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  const message = rawMessage.toLowerCase();

  if (
    message.includes("notallowed") ||
    message.includes("permission") ||
    message.includes("denied")
  ) {
    return "Mic access was blocked by the browser. Allow microphone permissions in site settings, or use text input.";
  }

  if (message.includes("notfound")) {
    return "No microphone was found on this device. Use text input instead.";
  }

  if (
    message.includes("notreadable") ||
    message.includes("busy") ||
    message.includes("unavailable")
  ) {
    return "The microphone is busy or unavailable. Close other audio apps and try again.";
  }

  return `Microphone init failed: ${rawMessage}. Use text input or try again after granting permission.`;
}
