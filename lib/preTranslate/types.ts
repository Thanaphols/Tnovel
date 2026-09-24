export type SubjectType = 'HUMAN' | 'ANIMAL' | 'OBJECT' | 'UNKNOWN';

export interface ClassifierResult {
  subject: string;
  subjectType: SubjectType;
  simileDetected: boolean;
  collocationMatched: boolean;
}

export interface NormalizationDecision {
  action: 'NORMALIZE' | 'BYPASS';
  ruleId?: string;
  paragraphIndex?: number;
  originalText: string;
  transformedText?: string;
  confidence: number;
  classifier: ClassifierResult;
  reasons: string[];
}

export interface SemanticRule {
  id: string;
  version: string;
  enabled: boolean;
  description: string;
  targetVerb: string;
  requiredSubjectType: SubjectType;
  requiresCollocation?: RegExp;
  minConfidence: number;
  transform: (text: string, match: RegExpExecArray, clf: ClassifierResult) => string;
}

export interface NormalizationSummary {
  normalizerVersion: string;
  normalizedCount: number;
  bypassedCount: number;
  decisions: NormalizationDecision[];
}
