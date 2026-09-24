import { SemanticRule } from './types';

function preserveCase(original: string, replacement: string): string {
  if (!original) return replacement;
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export const RULE_REGISTRY: SemanticRule[] = [
  {
    id: 'R001_human_bark_orders',
    version: '1.0',
    enabled: true,
    description: 'Replace "bark orders" with "shout orders" when spoken by human authority',
    targetVerb: 'bark',
    requiredSubjectType: 'HUMAN',
    requiresCollocation: /\bbark(?:s|ed|ing)?\s+orders?\b/i,
    minConfidence: 0.95,
    transform: (text: string) => {
      return text.replace(/\b(bark)(s|ed|ing)?(\s+orders?)\b/gi, (fullMatch, base, suffix, rest) => {
        const s = (suffix || '').toLowerCase();
        let shoutBase = 'shout';
        if (s === 's') shoutBase = 'shouts';
        else if (s === 'ed') shoutBase = 'shouted';
        else if (s === 'ing') shoutBase = 'shouting';

        return preserveCase(base, shoutBase) + rest;
      });
    },
  },
  {
    id: 'R002_human_chirp_around',
    version: '1.0',
    enabled: true,
    description: 'Replace "chirp around" with "chatter around" when referring to lively human children/people',
    targetVerb: 'chirp',
    requiredSubjectType: 'HUMAN',
    requiresCollocation: /\bchirp(?:s|ed|ing)?\s+around\b/i,
    minConfidence: 0.90,
    transform: (text: string) => {
      return text.replace(/\b(chirp)(s|ed|ing)?(\s+around)\b/gi, (fullMatch, base, suffix, rest) => {
        const s = (suffix || '').toLowerCase();
        let chatterBase = 'chatter';
        if (s === 's') chatterBase = 'chatters';
        else if (s === 'ed') chatterBase = 'chattered';
        else if (s === 'ing') chatterBase = 'chattering';

        return preserveCase(base, chatterBase) + rest;
      });
    },
  },
];
