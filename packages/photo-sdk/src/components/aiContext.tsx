'use client';

import { createContext, useContext } from 'react';

import type { AIProvider } from '../ai/types';

/** Makes the configured AIProvider available to UI (e.g. the editor's AI tools). */
export const AIProviderContext = createContext<AIProvider | null>(null);

export function useAIProvider(): AIProvider | null {
  return useContext(AIProviderContext);
}
