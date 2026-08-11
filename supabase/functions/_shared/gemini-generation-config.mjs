export function buildGeminiGenerationConfig({
  model,
  maxOutputTokens,
  thinking,
  temperature,
}) {
  const isGemini3 = String(model).startsWith('gemini-3.')
  if (isGemini3 && thinking?.kind !== 'level') {
    throw new Error(`Gemini 3 model ${model} requires a thinking level`)
  }
  if (!isGemini3 && thinking?.kind === 'level') {
    throw new Error(`Gemini 2 model ${model} does not support thinking levels`)
  }

  return {
    ...(!isGemini3 && Number.isFinite(temperature) ? { temperature } : {}),
    max_output_tokens: maxOutputTokens,
    ...(thinking?.kind === 'level'
      ? { thinking_config: { thinking_level: thinking.value } }
      : thinking?.kind === 'budget'
        ? { thinking_config: { thinking_budget: thinking.value } }
        : {}),
  }
}
