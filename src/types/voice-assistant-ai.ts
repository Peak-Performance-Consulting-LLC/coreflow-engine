export type AssistantTone = 'friendly' | 'professional' | 'empathetic' | 'concise';

export interface AssistantPromptInput {
  businessType?: string;
  assistantRole: string;
  callerTypes: string[];
  primaryGoal: string;
  collectFields: string[];
  tone: AssistantTone;
  language?: string;
  transferRule: string;
  restrictions?: string[];
  fallbackBehavior?: string;
}

export interface GenerateVoiceAssistantConfigInput extends AssistantPromptInput {
  workspace_id: string;
}

export interface GeneratedAssistantContent {
  suggestedName: string;
  description: string;
  greeting: string;
  systemPrompt: string;
  sampleQuestions: string[];
  usedFallback?: boolean;
  fallbackReason?: string;
}
