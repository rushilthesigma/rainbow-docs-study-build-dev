export function buildStudyChatBody({
  message,
  sessionId,
  context,
  images = [],
  canvasImage = null,
  sourced = false,
  disableThinking = false,
  model = null,
  humanize = false,
  bestOf = null,
  reroute = false,
  smartReroute = false,
  bruteForce = false,
  bruteForceFocus = '',
}) {
  const normalizedCanvas = canvasImage?.dataUrl
    ? {
        dataUrl: canvasImage.dataUrl,
        mimeType: canvasImage.mimeType || 'image/png',
        name: canvasImage.name || 'Live math canvas',
      }
    : null;
  // Keep the canvas in its own field so it is guaranteed a slot. Manual
  // attachments retain the remaining image budget.
  const manualImageLimit = normalizedCanvas ? 3 : 4;
  return {
    message,
    sessionId,
    context,
    sourced: !!sourced,
    disableThinking: !!disableThinking,
    humanize: !!humanize,
    model: model || undefined,
    // Regular reroute: fan this prompt out to every available model.
    reroute: reroute ? true : undefined,
    // Smart reroute: reframe the prompt up front (ethos-preserving) before the fan-out.
    smartReroute: smartReroute ? true : undefined,
    // Brute force: loop 5 models + up to 10 trigger-word-free rewrites until one answers.
    bruteForce: bruteForce ? true : undefined,
    // Optional clarification of the most important part to preserve in rewrites.
    bruteForceFocus: bruteForce && bruteForceFocus ? String(bruteForceFocus).slice(0, 600) : undefined,
    bestOf: bestOf && Array.isArray(bestOf.models) && bestOf.judgeModel
      ? {
          models: bestOf.models.slice(0, 3),
          judgeModel: bestOf.judgeModel,
        }
      : undefined,
    images: (images || []).slice(0, manualImageLimit).map(i => ({
      dataUrl: i.dataUrl,
      mimeType: i.mimeType,
    })),
    canvasImage: normalizedCanvas,
  };
}
