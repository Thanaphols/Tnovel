import assert from 'node:assert';
import { preTranslateNormalize } from '../lib/preTranslate';

interface TestCase {
  id: string;
  input: string;
  expectedAction: 'NORMALIZE' | 'BYPASS';
  expectedContains: string;
  reason: string;
}

const TEST_CORPUS: TestCase[] = [
  {
    id: 'TC-01',
    input: 'Not to mention those children who could do nothing but chirp around.',
    expectedAction: 'NORMALIZE',
    expectedContains: 'chatter around',
    reason: 'Subject is children (HUMAN), no simile',
  },
  {
    id: 'TC-02',
    input: 'The birds chirped around the garden.',
    expectedAction: 'BYPASS',
    expectedContains: 'chirped around',
    reason: 'Subject is birds (ANIMAL)',
  },
  {
    id: 'TC-03',
    input: 'The girl chirped around him like a sparrow.',
    expectedAction: 'BYPASS',
    expectedContains: 'chirped around',
    reason: 'Simile detected (like a sparrow), preserve literary metaphor',
  },
  {
    id: 'TC-04',
    input: 'The captain barked orders at the squad.',
    expectedAction: 'NORMALIZE',
    expectedContains: 'shouted orders',
    reason: 'Subject is captain (HUMAN), collocation barked orders',
  },
  {
    id: 'TC-05',
    input: 'The stray dog barked orders.',
    expectedAction: 'BYPASS',
    expectedContains: 'barked orders',
    reason: 'Subject is dog (ANIMAL)',
  },
  {
    id: 'TC-06',
    input: 'The guard dog barked loudly at night.',
    expectedAction: 'BYPASS',
    expectedContains: 'barked loudly',
    reason: 'True animal barking action',
  },
  {
    id: 'TC-07',
    input: 'His stomach growled with hunger.',
    expectedAction: 'BYPASS',
    expectedContains: 'growled',
    reason: 'Excluded verb from pre-translation (organ action)',
  },
  {
    id: 'TC-08',
    input: 'He growled in frustration.',
    expectedAction: 'BYPASS',
    expectedContains: 'growled',
    reason: 'Excluded verb from pre-translation, reserved for AI Polish',
  },
];

async function runTests() {
  console.log('🧪 Starting Semantic Pre-Translation Normalizer Regression Tests...\n');

  let passed = 0;
  for (const tc of TEST_CORPUS) {
    const { normalized, summary } = preTranslateNormalize([tc.input]);
    const resultText = normalized[0];
    const decision = summary.decisions.find((d) => d.originalText === tc.input);

    const actualAction = decision ? decision.action : 'BYPASS';

    try {
      assert.strictEqual(
        actualAction,
        tc.expectedAction,
        `Expected action ${tc.expectedAction} but got ${actualAction}`
      );
      assert.ok(
        resultText.includes(tc.expectedContains),
        `Expected output to contain "${tc.expectedContains}", but got "${resultText}"`
      );
      console.log(`✅ [${tc.id}] PASS: "${tc.input}" -> "${resultText}" (${tc.reason})`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [${tc.id}] FAIL: ${err.message}`);
      console.error(`   Decision:`, JSON.stringify(decision, null, 2));
    }
  }

  console.log(`\n📊 Regression Test Summary: ${passed}/${TEST_CORPUS.length} passed.`);
  assert.strictEqual(passed, TEST_CORPUS.length, 'All regression test cases must pass 100%');

  // Benchmark: Measure execution time on 500 paragraphs
  console.log('\n⏱️ Running Performance Benchmark (500 paragraphs)...');
  const sampleParagraphs: string[] = [];
  for (let i = 0; i < 500; i++) {
    sampleParagraphs.push(
      i % 20 === 0
        ? 'Not to mention those children who could do nothing but chirp around.'
        : 'The sun was setting behind the distant misty mountains while Keith walked quietly.'
    );
  }

  const start = performance.now();
  const { summary: benchSummary } = preTranslateNormalize(sampleParagraphs);
  const durationMs = performance.now() - start;

  console.log(`⚡ Benchmark Result: 500 paragraphs processed in ${durationMs.toFixed(3)} ms`);
  console.log(`   Transformed: ${benchSummary.normalizedCount}, Bypassed: ${benchSummary.bypassedCount}`);
  assert.ok(durationMs < 10.0, `Performance target exceeded: ${durationMs} ms >= 10 ms`);
  console.log('🎉 All Pre-Translation tests and benchmarks completed successfully!\n');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
