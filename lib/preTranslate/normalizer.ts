import { RULE_REGISTRY } from './registry';
import { ClassifierResult, NormalizationDecision, NormalizationSummary, SemanticRule, SubjectType } from './types';

export const NORMALIZER_VERSION = 'pretranslate-v1';

const SIMILE_PATTERN = /\b(?:like|as\s+if|as\s+though)\s+(?:a|an|the)?\s*(?:bird|sparrow|chick|dog|wolf|hound|beast|animal|monster|creature)\b/i;

const HUMAN_LEXICON = new Set([
  'child', 'children', 'kid', 'kids', 'boy', 'boys', 'girl', 'girls',
  'man', 'men', 'woman', 'women', 'people', 'person', 'someone',
  'he', 'she', 'they', 'who', 'whom',
  'captain', 'soldier', 'soldiers', 'commander', 'commanders', 'officer', 'officers',
  'general', 'generals', 'elder', 'elders', 'master', 'masters',
  'teacher', 'student', 'students', 'guard', 'guards', 'knight', 'knights',
  'father', 'mother', 'brother', 'sister', 'king', 'queen', 'prince', 'princess',
  'lord', 'lady', 'prodigy', 'cultivator', 'cultivators', 'disciple', 'disciples'
]);

const ANIMAL_OBJECT_LEXICON = new Set([
  'bird', 'birds', 'sparrow', 'sparrows', 'chick', 'chicks', 'fowl',
  'dog', 'dogs', 'hound', 'hounds', 'puppy', 'puppies',
  'wolf', 'wolves', 'cat', 'cats', 'kitten', 'kittens',
  'beast', 'beasts', 'monster', 'monsters', 'animal', 'animals', 'creature', 'creatures',
  'stomach', 'belly', 'gut', 'wind', 'tree', 'branch', 'engine'
]);

/**
 * Extract tokens in the preceding window (within the current sentence, up to 15 words back).
 */
function getPrecedingWords(text: string, matchIndex: number): string[] {
  // Find sentence start boundary (. ! ? or beginning of text)
  const prevSlice = text.slice(0, matchIndex);
  const sentenceBoundary = Math.max(
    prevSlice.lastIndexOf('.'),
    prevSlice.lastIndexOf('!'),
    prevSlice.lastIndexOf('?'),
    prevSlice.lastIndexOf('\n')
  );
  const sentenceSegment = sentenceBoundary >= 0 ? prevSlice.slice(sentenceBoundary + 1) : prevSlice;
  return sentenceSegment
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Classify the subject preceding the target verb/clause within the sentence.
 */
export function classifyContext(
  text: string,
  matchIndex: number,
  rule: SemanticRule,
  knownGlossaryTerms?: Array<{ canonicalEn: string }>
): ClassifierResult {
  const simileDetected = SIMILE_PATTERN.test(text);
  const collocationMatched = rule.requiresCollocation ? rule.requiresCollocation.test(text) : true;

  const words = getPrecedingWords(text, matchIndex);
  const lowerWords = words.map((w) => w.toLowerCase());

  let detectedSubject = '';
  let subjectType: SubjectType = 'UNKNOWN';

  // Build a set of known proper names from glossary (if provided)
  const glossaryNames = new Set(
    (knownGlossaryTerms || []).map((t) => t.canonicalEn.trim().toLowerCase())
  );

  // Scan backwards from nearest word to find candidate subject
  for (let i = lowerWords.length - 1; i >= 0; i--) {
    const word = lowerWords[i];

    // Check animal / object lexicon first
    if (ANIMAL_OBJECT_LEXICON.has(word)) {
      detectedSubject = words[i];
      subjectType = 'ANIMAL';
      break;
    }

    // Check glossary names -> HUMAN
    if (glossaryNames.has(word)) {
      detectedSubject = words[i];
      subjectType = 'HUMAN';
      break;
    }

    // Check human lexicon
    if (HUMAN_LEXICON.has(word)) {
      detectedSubject = words[i];
      subjectType = 'HUMAN';
      break;
    }
  }

  // If subject not directly found in single words, check multi-word glossary names
  if (subjectType === 'UNKNOWN' && knownGlossaryTerms) {
    const precedingText = words.join(' ').toLowerCase();
    for (const g of knownGlossaryTerms) {
      const gLower = g.canonicalEn.trim().toLowerCase();
      if (gLower.length > 2 && precedingText.includes(gLower)) {
        detectedSubject = g.canonicalEn;
        subjectType = 'HUMAN';
        break;
      }
    }
  }

  return {
    subject: detectedSubject,
    subjectType,
    simileDetected,
    collocationMatched,
  };
}

/**
 * Evaluate safety gate for a rule and sentence.
 */
export function evaluateSafetyGate(
  text: string,
  rule: SemanticRule,
  paragraphIndex: number,
  knownGlossaryTerms?: Array<{ canonicalEn: string }>
): NormalizationDecision {
  if (!rule.enabled) {
    return {
      action: 'BYPASS',
      ruleId: rule.id,
      paragraphIndex,
      originalText: text,
      confidence: 1.0,
      classifier: { subject: '', subjectType: 'UNKNOWN', simileDetected: false, collocationMatched: false },
      reasons: ['Rule is disabled'],
    };
  }

  const verbRegex = new RegExp(`\\b${rule.targetVerb}\\w*\\b`, 'i');
  const verbMatch = verbRegex.exec(text);

  if (!verbMatch) {
    return {
      action: 'BYPASS',
      ruleId: rule.id,
      paragraphIndex,
      originalText: text,
      confidence: 1.0,
      classifier: { subject: '', subjectType: 'UNKNOWN', simileDetected: false, collocationMatched: false },
      reasons: ['Target verb not found'],
    };
  }

  const clf = classifyContext(text, verbMatch.index, rule, knownGlossaryTerms);

  // Calculate confidence score based on subject classification, simile, and collocation
  let confidence = 0.5;
  if (clf.collocationMatched) confidence += 0.3;
  if (clf.subjectType === rule.requiredSubjectType) confidence += 0.2;
  if (clf.simileDetected) confidence = 0.1; // heavily penalized if simile is present

  const canNormalize =
    clf.collocationMatched &&
    clf.subjectType === rule.requiredSubjectType &&
    !clf.simileDetected &&
    confidence >= rule.minConfidence;

  if (canNormalize) {
    const transformed = rule.transform(text, verbMatch, clf);
    return {
      action: 'NORMALIZE',
      ruleId: rule.id,
      paragraphIndex,
      originalText: text,
      transformedText: transformed,
      confidence,
      classifier: clf,
      reasons: [
        `Subject matched ${clf.subjectType} (${clf.subject || 'lexicon'})`,
        'Collocation matched',
        'Simile absent',
        `Confidence ${confidence.toFixed(2)} >= ${rule.minConfidence}`,
      ],
    };
  }

  const reasons: string[] = [];
  if (!clf.collocationMatched) reasons.push('Collocation not matched');
  if (clf.simileDetected) reasons.push('Simile/metaphor detected in sentence');
  if (clf.subjectType !== rule.requiredSubjectType) {
    reasons.push(`Subject type '${clf.subjectType}' does not match required '${rule.requiredSubjectType}'`);
  }
  if (confidence < rule.minConfidence) {
    reasons.push(`Confidence ${confidence.toFixed(2)} below threshold ${rule.minConfidence}`);
  }

  return {
    action: 'BYPASS',
    ruleId: rule.id,
    paragraphIndex,
    originalText: text,
    confidence,
    classifier: clf,
    reasons,
  };
}

/**
 * Main entry point: Normalize English paragraphs before glossary masking and Google Translate.
 * Operates strictly on a clone of paragraphs without modifying the caller's original inputs.
 */
export function preTranslateNormalize(
  paragraphs: string[],
  knownGlossaryTerms?: Array<{ canonicalEn: string }>
): {
  normalized: string[];
  summary: NormalizationSummary;
} {
  const normalized: string[] = [];
  const decisions: NormalizationDecision[] = [];
  let normalizedCount = 0;
  let bypassedCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    let currentText = paragraphs[i];
    let paragraphTransformed = false;

    // Fast-path guard: if text doesn't contain any target verbs, skip regex loops
    const hasCandidateVerb = RULE_REGISTRY.some(
      (r) => r.enabled && new RegExp(`\\b${r.targetVerb}\\w*\\b`, 'i').test(currentText)
    );

    if (hasCandidateVerb) {
      for (const rule of RULE_REGISTRY) {
        if (!rule.enabled) continue;

        const decision = evaluateSafetyGate(currentText, rule, i, knownGlossaryTerms);
        if (decision.action === 'NORMALIZE' && decision.transformedText) {
          decisions.push(decision);
          currentText = decision.transformedText;
          paragraphTransformed = true;
          normalizedCount++;
        } else if (decision.classifier.collocationMatched || decision.classifier.subject) {
          // Record bypass decisions when candidate pattern was present but safety gate tripped
          decisions.push(decision);
        }
      }
    }

    if (!paragraphTransformed) {
      bypassedCount++;
    }
    normalized.push(currentText);
  }

  return {
    normalized,
    summary: {
      normalizerVersion: NORMALIZER_VERSION,
      normalizedCount,
      bypassedCount,
      decisions,
    },
  };
}
