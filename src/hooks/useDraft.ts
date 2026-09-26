import { useEffect, useState } from 'react';
import { draftSchema, type GenerationRequest } from '../../shared/schema';

export const initial: GenerationRequest = {
  prompt: '',
  mode: 'generate',
  preset: 'custom',
  ratio: '1:1',
  style: '',
  text: '',
  constraints: '',
  transparent: false,
  variants: 1,
  references: [],
};
const key = 'imagegen-draft-v1';

export function useDraft() {
  const [draft, setDraft] = useState<GenerationRequest>(() => {
    try {
      const value = draftSchema.safeParse(JSON.parse(localStorage.getItem(key) || 'null'));
      return value.success ? value.data : initial;
    } catch {
      return initial;
    }
  });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [draft]);
  return [draft, setDraft, saved] as const;
}
