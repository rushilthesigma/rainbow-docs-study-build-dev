import { useEffect, useState } from 'react';
import { listTools, registerTool, subscribeToolRegistry, type ToolDefinition, type ToolSchema } from '@/ai/toolRegistry';

export function useRegisteredTools(): ToolDefinition[] {
  const [tools, setTools] = useState<ToolDefinition[]>(() => listTools());
  useEffect(() => subscribeToolRegistry(() => setTools(listTools())), []);
  return tools;
}

export function useAppTools(
  appId: string,
  defs: Array<{
    toolName: string;
    description: string;
    input_schema: ToolSchema;
    handler: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  }>,
) {
  useEffect(() => {
    const disposers = defs.map(d =>
      registerTool(appId, d.toolName, d.description, d.input_schema, d.handler),
    );
    return () => { for (const d of disposers) d(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);
}
