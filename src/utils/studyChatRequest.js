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
