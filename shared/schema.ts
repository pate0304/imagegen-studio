import { z } from 'zod';

export const presets = [
  {
    id: 'custom',
    name: 'Your own idea',
    category: 'stylized-concept',
    description: 'Start with a blank canvas.',
    prompt: '',
    style: '',
  },
  {
    id: 'product',
    name: 'Product photography',
    category: 'product-mockup',
    description: 'Beautiful objects. Thoughtful light.',
    prompt: 'A sculptural ceramic vase with a single olive branch on a warm limestone surface.',
    style:
      'Editorial product photography, tactile materials, soft window light, subtle natural shadows.',
  },
  {
    id: 'editorial',
    name: 'Editorial photograph',
    category: 'photorealistic-natural',
    description: 'Natural moments with a point of view.',
    prompt: 'A quiet corner of a sunlit neighborhood café, with a coffee cup and an open book.',
    style: 'Candid editorial photography, real textures, natural light, restrained color grading.',
  },
  {
    id: 'illustration',
    name: 'Editorial illustration',
    category: 'illustration-story',
    description: 'Expressive shapes, a little personality.',
    prompt: 'A tiny greenhouse filled with oversized plants, seen from outside.',
    style: 'Hand-painted gouache illustration, visible paper texture, simplified shapes.',
  },
  {
    id: 'campaign',
    name: 'Campaign creative',
    category: 'ads-marketing',
    description: 'Make room for the message.',
    prompt: 'A minimal campaign image of a refreshing sparkling drink on a sunlit table.',
    style: 'Art-directed commercial photography, strong focal point, negative space for copy.',
  },
  {
    id: 'concept',
    name: 'Concept art',
    category: 'stylized-concept',
    description: 'Build a world worth exploring.',
    prompt: 'A small observatory nestled into a lush mountainside just after the rain.',
    style: 'Cinematic environment concept art, atmospheric depth, considered composition.',
  },
  {
    id: 'icon',
    name: '3D object',
    category: 'stylized-concept',
    description: 'One object. All the character.',
    prompt: 'A small sculptural desk lamp with a playful curved silhouette.',
    style: 'Polished 3D studio render, tactile matte surfaces, soft area lighting.',
  },
  {
    id: 'cutout',
    name: 'Clean cutout',
    category: 'background-extraction',
    description: 'Keep the subject. Lose the background.',
    prompt:
      'Remove only the background. Preserve the subject, fine edges, proportions and original colors.',
    style: '',
    edit: true,
    transparent: true,
  },
] as const;

const requestFields = z.object({
  prompt: z.string().trim().min(3, 'Describe what you want to create.').max(6000),
  mode: z.enum(['generate', 'edit']).default('generate'),
  preset: z
    .enum([
      'custom',
      'product',
      'editorial',
      'illustration',
      'campaign',
      'concept',
      'icon',
      'cutout',
    ])
    .default('custom'),
  ratio: z.enum(['auto', '1:1', '3:2', '2:3', '16:9', '9:16']).default('1:1'),
  style: z.string().trim().max(1500).default(''),
  text: z.string().max(1000).default(''),
  constraints: z.string().trim().max(2000).default(''),
  transparent: z.boolean().default(false),
  variants: z.number().int().min(1).max(4).default(1),
  references: z
    .array(
      z.object({
        id: z.string().uuid(),
        role: z.enum(['reference', 'edit target', 'style reference']),
      }),
    )
    .max(5)
    .default([]),
});
// Browser drafts may be incomplete; server requests must meet every generation rule.
export const draftSchema = requestFields.extend({ prompt: z.string().max(6000) });
export const requestSchema = requestFields.superRefine((v, ctx) => {
  const targets = v.references.filter((r) => r.role === 'edit target');
  if (v.mode === 'edit' && targets.length !== 1)
    ctx.addIssue({
      code: 'custom',
      message: 'Editing needs exactly one image labeled “Edit target”.',
      path: ['references'],
    });
  if (v.mode === 'generate' && targets.length)
    ctx.addIssue({
      code: 'custom',
      message: 'Choose Edit mode to use an edit target.',
      path: ['references'],
    });
  if (new Set(v.references.map((r) => r.id)).size !== v.references.length)
    ctx.addIssue({
      code: 'custom',
      message: 'Each reference image can be added once.',
      path: ['references'],
    });
});
export type GenerationRequest = z.infer<typeof requestSchema>;
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface Job {
  id: string;
  batchId: string;
  variant: number;
  status: JobStatus;
  request: GenerationRequest;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  threadId?: string;
  stage: string;
  error?: string;
  messages: string[];
  assetIds: string[];
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number };
}
export interface Asset {
  id: string;
  kind: 'generated' | 'reference';
  filename: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  hasAlpha: boolean;
  favorite: boolean;
  archived: boolean;
  jobId?: string;
  request?: GenerationRequest;
}
export interface Health {
  ready: boolean;
  binary?: string;
  version?: string;
  model?: string;
  provider?: string;
  auth: string;
  skillPath: string;
  skillAvailable: boolean;
  imageFeature: boolean;
  reason?: string;
  dataDir: string;
  queuePaused: boolean;
}

export function structuredPrompt(r: GenerationRequest): string {
  const preset = presets.find((p) => p.id === r.preset)!;
  return [
    `Use case: ${r.mode === 'edit' && r.preset !== 'cutout' ? 'precise-object-edit' : preset.category}`,
    `Primary request: ${r.prompt}`,
    r.style && `Style/medium: ${r.style}`,
    r.ratio !== 'auto' &&
      `Composition/framing: target aspect ratio ${r.ratio}. This is a composition request, not an exact pixel-size guarantee.`,
    r.text && `Text (verbatim): ${JSON.stringify(r.text)}`,
    r.constraints && `Constraints / preserve: ${r.constraints}`,
    r.mode === 'edit' &&
      'Edit invariants: change only the requested elements; preserve everything else in the edit target.',
    r.transparent && 'Background: genuinely transparent, with alpha; do not draw a checkerboard.',
  ]
    .filter(Boolean)
    .join('\n');
}
