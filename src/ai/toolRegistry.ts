export type ToolSchema = Record<string, unknown>;

export interface ToolDefinition {
  appId: string;
  toolName: string;
  description: string;
  input_schema: ToolSchema;
  handler: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

const tools: ToolDefinition[] = [];
const listeners: Array<() => void> = [];

export function listTools(): ToolDefinition[] { return [...tools]; }

export function registerTool(
  appId: string,
  toolName: string,
  description: string,
  input_schema: ToolSchema,
  handler: (input: Record<string, unknown>) => Promise<unknown> | unknown,
): () => void {
  const def: ToolDefinition = { appId, toolName, description, input_schema, handler };
  tools.push(def);
  listeners.forEach(l => l());
  return () => {
    const i = tools.indexOf(def);
    if (i !== -1) { tools.splice(i, 1); listeners.forEach(l => l()); }
  };
}

export function subscribeToolRegistry(cb: () => void): () => void {
  listeners.push(cb);
  return () => { const i = listeners.indexOf(cb); if (i !== -1) listeners.splice(i, 1); };
}
