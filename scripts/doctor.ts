import { discover } from '../server/codex.js';

const connection = await discover();
console.log('\nImagegen Studio — connection check\n');
for (const [name, ok, detail] of [
  [
    'Codex CLI',
    !!connection.binary,
    connection.version || 'Install Codex and ensure it is on PATH.',
  ],
  ['ChatGPT login', connection.auth === 'ChatGPT', connection.auth],
  [
    'Image generation',
    connection.imageFeature,
    connection.imageFeature ? 'Available' : 'A compatible Codex runtime is required.',
  ],
  [
    'Imagegen skill',
    connection.skillAvailable,
    connection.skillAvailable ? 'Found' : 'Set IMAGEGEN_SKILL to your installed imagegen SKILL.md.',
  ],
  ['Provider', connection.provider === 'openai', connection.provider || 'Codex default'],
] as const)
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
console.log(
  `\n${connection.ready ? 'Ready. Run npm start and open http://127.0.0.1:4310.' : connection.reason}\n`,
);
console.log('No images were generated. No account settings were changed.');
process.exitCode = connection.ready ? 0 : 1;
