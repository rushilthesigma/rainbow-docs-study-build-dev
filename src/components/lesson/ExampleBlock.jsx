import { useMemo } from 'react';
import MathTutorApp from '../desktop/apps/MathTutorApp';

// Worked example. Instead of a static reveal-on-click walkthrough, the
// example opens the actual Math Tutor window (chat + draw canvas), seeded
// to teach THIS problem. The student can ask questions, work it out on the
// canvas, and get feedback / a grade - exactly like the standalone Math
// Tutor, just embedded (near-fullscreen) in the lesson. The lesson's
// Continue action lives inside the tutor window, under Get feedback / Grade.
//
// Block shape:
//   { type: 'example', title, problem, steps: [{ label, text }], tryThis }

// Fold the block's problem + steps + "now you try" into a single seed prompt
// so the tutor teaches the exact example the curriculum authored, rather than
// a generic lesson on the topic.
function buildSeedPrompt(block) {
  const steps = Array.isArray(block.steps) ? block.steps.filter(s => s && s.text) : [];
  const stepLines = steps
    .map((s, i) => `${i + 1}. ${s.label ? `${s.label} - ` : ''}${s.text}`)
    .join('\n');
  return [
    'Walk me through this worked example like a tutor at the whiteboard - clear and tight, one step at a time. Use KaTeX for every piece of math.',
    '',
    `Problem: ${block.problem || block.title || 'this example'}`,
    stepLines ? `\nUse this approach as your guide:\n${stepLines}` : '',
    block.tryThis
      ? `\nAfter the walkthrough, give me this to try on the canvas and wait for my work:\n${block.tryThis}`
      : '\nEnd by giving me a similar problem to try on the canvas.',
  ].filter(Boolean).join('\n');
}

export default function ExampleBlock({ block, onComplete, hideContinue = false, continueLabel = 'Continue' }) {
  const seedPrompt = useMemo(() => buildSeedPrompt(block), [block]);

  return (
    <div className="cl-anim-in">
      <div className="h-[82vh] min-h-[520px]">
        <MathTutorApp
          seedPrompt={seedPrompt}
          title={block.title || 'Worked example'}
          defaultMode="both"
          embedded
          onContinue={hideContinue ? null : onComplete}
          continueLabel={continueLabel}
        />
      </div>
    </div>
  );
}
