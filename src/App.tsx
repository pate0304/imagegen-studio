import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from './components/Modal';
import { ConceptArt } from './components/ConceptArt';
import { useDraft, initial } from './hooks/useDraft';
import {
  Aperture,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Expand,
  ImagePlus,
  Images,
  Layers3,
  LoaderCircle,
  Monitor,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  WandSparkles,
  X,
  Archive,
  FileText,
  Link2,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from './api';
import {
  presets,
  requestSchema,
  structuredPrompt,
  type Asset,
  type GenerationRequest,
  type Health,
  type Job,
} from '../shared/schema';

const art = ['paper', 'object', 'sun', 'leaf', 'campaign', 'mountain', 'lamp', 'cutout'];
const relative = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function App() {
  const query = useQueryClient();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/api/health'),
    refetchInterval: 15_000,
  });
  const library = useQuery({
    queryKey: ['library'],
    queryFn: () => api<{ assets: Asset[]; jobs: Job[]; queuePaused: boolean }>('/api/library'),
    refetchInterval: (query) =>
      query.state.data?.jobs.some((j) => ['running', 'queued'].includes(j.status)) ? 1500 : 10_000,
  });
  const [draft, setDraft, draftSaved] = useDraft();
  const [view, setView] = useState<'studio' | 'library' | 'favorites' | 'queue' | 'templates'>(
    'studio',
  );
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'generate' | 'edit' | 'archived'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [details, setDetails] = useState(false);
  const [promptPreview, setPromptPreview] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [uploading, setUploading] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !document.querySelector('[role=dialog]') &&
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLElement &&
          (event.target.matches('input,textarea,select') || event.target.isContentEditable)
        )
      ) {
        event.preventDefault();
        setView('studio');
        setTimeout(() => promptInput.current?.focus(), 50);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const assets = library.data?.assets || [];
  const jobs = library.data?.jobs || [];
  const active = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const generated = assets.filter((a) => a.kind === 'generated');
  const visible = generated
    .filter(
      (a) =>
        (filter === 'archived' ? a.archived : !a.archived) &&
        (view !== 'favorites' || a.favorite) &&
        (!['generate', 'edit'].includes(filter) || a.request?.mode === filter) &&
        `${a.name} ${a.request?.prompt} ${a.request?.style}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'newest'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  const field = <K extends keyof GenerationRequest>(key: K, value: GenerationRequest[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const refresh = () => {
    void query.invalidateQueries({ queryKey: ['library'] });
  };

  const generate = useMutation({
    mutationFn: (request: GenerationRequest) =>
      api<{ jobs: Job[] }>('/api/jobs', { method: 'POST', body: JSON.stringify(request) }),
    onSuccess: (data) => {
      setSubmitted(false);
      refresh();
      toast.success(
        `${data.jobs.length === 1 ? 'Your image is' : `${data.jobs.length} variations are`} in the queue.`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitted(true);
    const parsed = requestSchema.safeParse(draft);
    if (!parsed.success) {
      if (parsed.error.issues[0].path[0] === 'prompt') promptInput.current?.focus();
      return;
    }
    if (!health.data?.ready) {
      setSettings(true);
      return;
    }
    generate.mutate(parsed.data);
  }
  async function changeAsset(asset: Asset, patch: { favorite?: boolean; archived?: boolean }) {
    try {
      const updated = await api<Asset>(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      refresh();
      setSelected((current) => (current?.id === asset.id ? updated : current));
      if (patch.archived !== undefined)
        toast.success(patch.archived ? 'Image archived.' : 'Image restored.', {
          action: {
            label: 'Undo',
            onClick: () => void changeAsset(updated, { archived: asset.archived }),
          },
        });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  function choosePreset(id: GenerationRequest['preset']) {
    const preset = presets.find((p) => p.id === id)!;
    const previous = draft;
    setDraft((d) => ({
      ...d,
      preset: id,
      prompt: preset.prompt || d.prompt,
      style: preset.style,
      mode: 'edit' in preset ? 'edit' : 'generate',
      transparent: 'transparent' in preset,
      references: d.references.map((r, i) => ({
        ...r,
        role: 'edit' in preset && i === 0 ? 'edit target' : 'reference',
      })),
    }));
    setView('studio');
    setSubmitted(false);
    if (previous.prompt)
      toast.success('Starter loaded.', {
        action: { label: 'Undo', onClick: () => setDraft(previous) },
      });
    setTimeout(() => promptInput.current?.focus(), 50);
  }
  function reuse(asset: Asset, mode: 'prompt' | 'edit' | 'reference') {
    if (mode === 'prompt' && asset.request) setDraft({ ...asset.request, variants: 1 });
    else if (mode === 'edit')
      setDraft({
        ...initial,
        mode: 'edit',
        prompt: '',
        references: [{ id: asset.id, role: 'edit target' }],
        constraints:
          'Keep the subject, composition, colors, and details unchanged except for the requested edit.',
      });
    else
      setDraft((d) => ({
        ...d,
        references: [
          ...d.references.filter((r) => r.id !== asset.id),
          { id: asset.id, role: 'style reference' as const },
        ].slice(0, 5),
      }));
    setSelected(null);
    setView('studio');
    setTimeout(() => promptInput.current?.focus(), 100);
    toast.success(
      mode === 'edit'
        ? 'Image added as your edit target.'
        : mode === 'reference'
          ? 'Added as a style reference.'
          : 'Prompt and settings loaded.',
    );
  }
  async function upload(files: FileList | File[]) {
    if (uploading) return;
    const list = Array.from(files);
    if (draft.references.length + list.length > 5) {
      toast.error('Use up to five reference images.');
      return;
    }
    setUploading(true);
    try {
      for (const file of list) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Each reference must be under 20 MB.');
        const form = new FormData();
        form.append('image', file);
        const asset = await api<Asset>('/api/references', { method: 'POST', body: form });
        setDraft((d) => ({
          ...d,
          references: [
            ...d.references,
            {
              id: asset.id,
              role:
                d.mode === 'edit' && !d.references.some((r) => r.role === 'edit target')
                  ? 'edit target'
                  : 'reference',
            },
          ],
        }));
        refresh();
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  async function controlQueue(paused: boolean) {
    try {
      await api('/api/queue', { method: 'POST', body: JSON.stringify({ paused }) });
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function cancel(job: Job) {
    try {
      await api(`/api/jobs/${job.id}/cancel`, { method: 'POST', body: '{}' });
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  const validation = requestSchema.safeParse(draft);
  const validationMessage =
    submitted && !validation.success ? validation.error.issues[0].message : '';
  const editTarget =
    selected?.request?.mode === 'edit'
      ? assets.find(
          (a) => a.id === selected.request?.references.find((r) => r.role === 'edit target')?.id,
        )
      : undefined;
  useEffect(() => setCompareOriginal(false), [selected?.id]);
  function newBrief() {
    const previous = draft;
    setDraft(initial);
    setSubmitted(false);
    setView('studio');
    toast.success('Ready for a new idea.', {
      action: { label: 'Undo', onClick: () => setDraft(previous) },
    });
    setTimeout(() => promptInput.current?.focus(), 50);
  }
  const lastStatuses = useRef(new Map<string, string>());
  useEffect(() => {
    for (const job of jobs) {
      if (lastStatuses.current.get(job.id) === 'running' && job.status === 'completed')
        toast.success('Your image is ready in the library.');
      lastStatuses.current.set(job.id, job.status);
    }
  }, [jobs]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setView('studio');
          }}
          aria-label="Imagegen Studio home"
        >
          <span className="brand-mark">
            <Aperture size={24} />
          </span>
          <span>
            imagegen<span className="brand-sub">STUDIO</span>
          </span>
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>LOCAL</span>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={view === 'studio' ? 'nav active' : 'nav'}
            onClick={() => setView('studio')}
          >
            <WandSparkles size={18} />
            Create<span className="keycap">N</span>
          </button>
          <button
            className={view === 'library' ? 'nav active' : 'nav'}
            onClick={() => setView('library')}
          >
            <Images size={18} />
            Library<span className="nav-count">{generated.filter((a) => !a.archived).length}</span>
          </button>
          <button
            className={view === 'favorites' ? 'nav active' : 'nav'}
            onClick={() => setView('favorites')}
          >
            <Star size={18} />
            Favorites
            <span className="nav-count">
              {generated.filter((a) => a.favorite && !a.archived).length || ''}
            </span>
          </button>
          <button
            className={view === 'queue' ? 'nav active' : 'nav'}
            onClick={() => setView('queue')}
          >
            <Layers3 size={18} />
            Activity{active.length > 0 && <span className="queue-count">{active.length}</span>}
          </button>
          <div className="nav-divider" />
          <button
            className={view === 'templates' ? 'nav active' : 'nav'}
            onClick={() => setView('templates')}
          >
            <Sparkles size={18} />
            Prompt starters
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Monitor size={19} />
            <strong>Your own creative space.</strong>
            <p>
              Saved on your computer.
              <br />
              Powered by your Codex.
            </p>
          </div>
          <button className="nav" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Getting started
            <ArrowRight size={15} />
          </button>
          <button className="connection" onClick={() => setSettings(true)}>
            <span className={`status-dot ${health.data?.ready ? 'online' : ''}`} />
            <span>
              <strong>
                {health.isLoading
                  ? 'Connecting…'
                  : health.data?.ready
                    ? 'Codex connected'
                    : 'Check connection'}
              </strong>
              <small>
                {health.data?.auth === 'ChatGPT' ? 'Your ChatGPT account' : 'Local app server'}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <strong>
              {
                {
                  studio: 'Create',
                  library: 'Library',
                  favorites: 'Favorites',
                  queue: 'Activity',
                  templates: 'Prompt starters',
                }[view]
              }
            </strong>
          </div>
          <div className="top-actions">
            <button className="text-button new-brief" onClick={newBrief}>
              <Plus size={16} />
              New brief
            </button>
            <span className="local-badge">
              <span />
              Local workspace
            </span>
            <button
              className="icon-button"
              aria-label="Connection settings"
              onClick={() => setSettings(true)}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>
        {library.isError && (
          <div className="notice error">
            The local server is unreachable. Make sure Imagegen Studio is running.
            <button onClick={() => void library.refetch()}>Reconnect</button>
          </div>
        )}
        {library.data?.queuePaused && (
          <div className="notice">
            <Pause size={15} />
            <span>Queue paused. Pending images will wait until you resume.</span>
            <button onClick={() => void controlQueue(false)}>Resume queue</button>
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className={view === 'studio' ? 'workspace' : 'workspace full'}
        >
          {view === 'studio' && (
            <section className="composer" aria-label="Image composer">
              <div className="composer-heading">
                <div className="section-eyebrow">
                  <span className="tiny-spark">✳</span> FROM THOUGHT TO IMAGE
                </div>
                <h1>
                  Ideas into <em>images.</em>
                </h1>
                <p className="composer-intro">Your imagination. Your Codex.</p>
              </div>
              <form
                onSubmit={submit}
                noValidate
                onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                    e.preventDefault();
                    void upload(e.clipboardData.files);
                  }
                }}
              >
                <div className="composer-fields">
                  <div className="mode-switch" aria-label="Image mode">
                    <button
                      type="button"
                      aria-pressed={draft.mode === 'generate'}
                      className={draft.mode === 'generate' ? 'chosen' : ''}
                      onClick={() => {
                        field('mode', 'generate');
                        field(
                          'references',
                          draft.references.map((r) => ({ ...r, role: 'reference' })),
                        );
                      }}
                    >
                      <Sparkles size={15} />
                      Generate
                    </button>
                    <button
                      type="button"
                      aria-pressed={draft.mode === 'edit'}
                      className={draft.mode === 'edit' ? 'chosen' : ''}
                      onClick={() => {
                        field('mode', 'edit');
                        field(
                          'references',
                          draft.references.map((r, i) => ({
                            ...r,
                            role: i === 0 ? 'edit target' : 'reference',
                          })),
                        );
                      }}
                    >
                      <WandSparkles size={15} />
                      Edit an image
                    </button>
                  </div>
                  <div className="field-heading">
                    <label htmlFor="prompt">
                      {draft.mode === 'edit'
                        ? 'What would you like to change?'
                        : 'Describe your image'}
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setView('templates')}
                    >
                      <Sparkles size={12} />
                      Get inspired
                    </button>
                  </div>
                  <div className="prompt-box">
                    <textarea
                      id="prompt"
                      aria-invalid={submitted && draft.prompt.trim().length < 3}
                      aria-describedby={validationMessage ? 'brief-error' : undefined}
                      ref={promptInput}
                      value={draft.prompt}
                      onChange={(e) => field('prompt', e.target.value)}
                      maxLength={6000}
                      placeholder={
                        draft.mode === 'edit'
                          ? 'Change the lighting to a warm sunset. Keep everything else exactly as it is…'
                          : 'A sculptural ceramic vase, soft afternoon light, a quiet Mediterranean feeling…'
                      }
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          void submit();
                        }
                      }}
                    />
                    <div className="prompt-footer">
                      <span>{draft.prompt.length}/6000</span>
                      <button
                        ref={previewTrigger}
                        type="button"
                        onClick={() => setPromptPreview(true)}
                      >
                        <FileText size={12} />
                        Preview brief
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="field-heading">
                    <label>Reference images</label>
                    <span className="optional">
                      {draft.references.length}/5 ·{' '}
                      {draft.mode === 'edit' ? '1 target required' : 'optional'}
                    </span>
                  </div>
                  <input
                    type="file"
                    ref={fileInput}
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files) void upload(e.target.files);
                    }}
                  />
                  {draft.references.length > 0 && (
                    <div className="references">
                      {draft.references.map((ref) => {
                        const asset = assets.find((a) => a.id === ref.id);
                        return (
                          <div className="reference" key={ref.id}>
                            <img
                              src={`/api/assets/${ref.id}/thumb`}
                              alt={asset?.name || 'Reference image'}
                            />
                            <div>
                              <strong>{asset?.name || 'Reference image'}</strong>
                              <select
                                aria-label={`Role for ${asset?.name || 'reference'}`}
                                value={ref.role}
                                onChange={(e) =>
                                  field(
                                    'references',
                                    draft.references.map((r) =>
                                      r.id === ref.id
                                        ? { ...r, role: e.target.value as typeof ref.role }
                                        : r,
                                    ),
                                  )
                                }
                              >
                                <option value="reference">Reference</option>
                                <option value="style reference">Style reference</option>
                                {draft.mode === 'edit' && (
                                  <option value="edit target">Edit target</option>
                                )}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Remove reference"
                              onClick={() =>
                                field(
                                  'references',
                                  draft.references.filter((r) => r.id !== ref.id),
                                )
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`upload-zone ${dragging ? 'dragging' : ''}`}
                    disabled={uploading || draft.references.length >= 5}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
                    }}
                  >
                    {uploading ? (
                      <LoaderCircle size={20} className="spin" />
                    ) : (
                      <ImagePlus size={22} />
                    )}
                    <span>
                      <strong>
                        {uploading
                          ? 'Adding your images…'
                          : draft.references.length
                            ? 'Add another reference'
                            : 'Drop an image, or browse'}
                      </strong>
                      <small>PNG, JPG or WebP · up to 20 MB each</small>
                    </span>
                    <Plus size={16} />
                  </button>
                  <div className="field-heading">
                    <label>Frame</label>
                    <span className="optional">Composition guidance</span>
                  </div>
                  <div className="ratio-options">
                    {(['1:1', '3:2', '2:3', '16:9', '9:16', 'auto'] as const).map((ratio) => (
                      <button
                        type="button"
                        aria-pressed={draft.ratio === ratio}
                        key={ratio}
                        className={draft.ratio === ratio ? 'ratio selected' : 'ratio'}
                        onClick={() => field('ratio', ratio)}
                      >
                        <span className={`ratio-icon r-${ratio.replace(':', '-')}`} />
                        <span>{ratio === 'auto' ? 'Auto' : ratio}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="details-toggle"
                    aria-expanded={details}
                    onClick={() => setDetails(!details)}
                  >
                    <SlidersHorizontal size={14} />
                    Fine-tune your brief
                    <ChevronDown size={14} className={details ? 'rotated' : ''} />
                  </button>
                  {details && (
                    <div className="fine-tune">
                      {' '}
                      <div className="field-heading">
                        <label htmlFor="style">Style direction</label>
                        <span className="optional">Optional</span>
                      </div>
                      <input
                        id="style"
                        className="text-input"
                        value={draft.style}
                        maxLength={1500}
                        onChange={(e) => field('style', e.target.value)}
                        placeholder="e.g. tactile, editorial, natural light"
                      />
                      <label htmlFor="exact-text">Exact text in the image</label>
                      <input
                        id="exact-text"
                        className="text-input"
                        value={draft.text}
                        maxLength={1000}
                        onChange={(e) => field('text', e.target.value)}
                        placeholder="Render these words verbatim"
                      />
                      <label htmlFor="constraints">Keep, change, or avoid</label>
                      <textarea
                        id="constraints"
                        className="text-input"
                        value={draft.constraints}
                        maxLength={2000}
                        onChange={(e) => field('constraints', e.target.value)}
                        placeholder="Preserve the product shape. No added logos."
                        rows={3}
                      />
                    </div>
                  )}
                  <div className="option-row">
                    <div>
                      <strong>Transparent background</strong>
                      <small>Ask for an image with real alpha</small>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.transparent}
                      aria-label="Transparent background"
                      className={`switch ${draft.transparent ? 'on' : ''}`}
                      onClick={() => field('transparent', !draft.transparent)}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="option-row variation-row">
                    <div>
                      <strong>Variations</strong>
                      <small>Each one is a separate generation</small>
                    </div>
                    <div className="stepper">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} variation${n > 1 ? 's' : ''}`}
                          aria-pressed={draft.variants === n}
                          className={draft.variants === n ? 'selected' : ''}
                          onClick={() => field('variants', n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="composer-submit">
                  {validationMessage && (
                    <p id="brief-error" role="alert" className="inline-error">
                      {validationMessage}
                    </p>
                  )}
                  <div className="draft-status">
                    <span>
                      <Check size={12} />
                      {draftSaved ? 'Draft saved on this device' : 'Draft in this browser'}
                    </span>
                    <span>
                      {draft.ratio} · {draft.variants} {draft.variants === 1 ? 'image' : 'images'}
                    </span>
                  </div>
                  <button
                    className="generate-button"
                    disabled={generate.isPending || uploading || !draft.prompt.trim()}
                    type="submit"
                  >
                    {generate.isPending ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    <span>
                      {draft.mode === 'edit'
                        ? 'Create edited image'
                        : draft.variants > 1
                          ? `Generate ${draft.variants} variations`
                          : 'Generate image'}
                    </span>
                    <span className="shortcut" aria-hidden="true">
                      ⌘ ↵
                    </span>
                  </button>
                  <p className="generation-note">
                    Uses your Codex plan · Generated online · Saved locally
                  </p>
                </div>
              </form>
            </section>
          )}

          <section className="canvas-area" aria-label="Image workspace">
            {health.data && !health.data.ready && (
              <div className="setup-card">
                <Terminal size={22} />
                <div>
                  <strong>Connect Codex to start creating</strong>
                  <p>{health.data.reason}</p>
                </div>
                <button className="secondary-button" onClick={() => setSettings(true)}>
                  Set up connection
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            {view === 'templates' ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="section-eyebrow">A GOOD PLACE TO START</span>
                    <h1>Find your direction.</h1>
                    <p>Considered starting points. Make them entirely yours.</p>
                  </div>
                </div>
                <div className="template-grid">
                  {presets.slice(1).map((p, i) => (
                    <button className="template-card" key={p.id} onClick={() => choosePreset(p.id)}>
                      <ConceptArt name={art[i + 1]} />
                      <div>
                        <strong>{p.name}</strong>
                        <p>{p.description}</p>
                        <span>
                          Use starter
                          <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="quiet-note">
                  Template artwork is illustrative. Your images are generated from your own brief.
                </p>
              </>
            ) : view === 'queue' ? (
              <>
                <div className="page-heading">
                  <div>
                    <span className="section-eyebrow">WORK IN PROGRESS</span>
                    <h1>Your creative activity.</h1>
                    <p>One image at a time. Every brief, kept together.</p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => void controlQueue(!library.data?.queuePaused)}
                  >
                    {library.data?.queuePaused ? <Play size={15} /> : <Pause size={15} />}{' '}
                    {library.data?.queuePaused ? 'Resume queue' : 'Pause queue'}
                  </button>
                </div>
                {jobs.length ? (
                  <div className="jobs-list">
                    {jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onCancel={() => void cancel(job)}
                        onReuse={() => {
                          setDraft({ ...job.request, variants: 1 });
                          setView('studio');
                        }}
                        onOpen={() => {
                          const asset = assets.find((a) => a.id === job.assetIds[0]);
                          if (asset) setSelected(asset);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="A little quiet here."
                    text="Your generations, edits, and variations will appear here."
                    onStart={() => setView('studio')}
                  />
                )}
              </>
            ) : (
              <>
                <div className="canvas-heading">
                  <div>
                    <h2>
                      {view === 'favorites'
                        ? 'Your favorites'
                        : view === 'library'
                          ? 'Your image library'
                          : 'Your creative space'}
                      <span>{visible.length}</span>
                    </h2>
                    <p>
                      {view === 'favorites'
                        ? 'The ones worth coming back to.'
                        : 'Create, collect, and take your next idea further.'}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="View generation activity"
                    onClick={() => setView('queue')}
                  >
                    <Layers3 size={18} />
                  </button>
                </div>
                <div className="library-toolbar">
                  <div className="filter-tabs">
                    {(['all', 'generate', 'edit', 'archived'] as const).map((f) => (
                      <button
                        key={f}
                        aria-pressed={filter === f}
                        className={filter === f ? 'selected' : ''}
                        onClick={() => setFilter(f)}
                      >
                        {
                          {
                            all: 'All images',
                            generate: 'Generated',
                            edit: 'Edits',
                            archived: 'Archived',
                          }[f]
                        }
                      </button>
                    ))}
                  </div>
                  <div className="search-box">
                    <Search size={15} />
                    <input
                      aria-label="Search images"
                      placeholder="Search your images"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => setSearch('')}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="gallery-controls">
                  <span>
                    {visible.length} {visible.length === 1 ? 'image' : 'images'}
                    {search && ` matching “${search}”`}
                  </span>
                  <div>
                    <select
                      aria-label="Sort images"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as typeof sort)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                    <button
                      className="icon-button"
                      aria-label="Comfortable grid"
                      aria-pressed={density === 'comfortable'}
                      onClick={() => setDensity('comfortable')}
                    >
                      <Square size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Compact grid"
                      aria-pressed={density === 'compact'}
                      onClick={() => setDensity('compact')}
                    >
                      <Images size={16} />
                    </button>
                  </div>
                </div>
                {active.length > 0 && (
                  <div className="active-jobs">
                    {active.slice(0, 4).map((job) => (
                      <div className="active-job" key={job.id}>
                        <div className={`job-orb ${job.status === 'running' ? 'working' : ''}`}>
                          {job.status === 'running' ? (
                            <Aperture size={23} className="slow-spin" />
                          ) : (
                            <Layers3 size={20} />
                          )}
                        </div>
                        <div>
                          <strong>{job.stage}</strong>
                          <p>{job.request.prompt}</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Cancel generation"
                          onClick={() => void cancel(job)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {active.length > 4 && (
                      <button className="text-button" onClick={() => setView('queue')}>
                        View {active.length - 4} more queued images
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                )}
                {jobs[0]?.status === 'failed' && (
                  <div className="job-error">
                    <strong>That generation needs attention.</strong>
                    <p>{jobs[0].error}</p>
                    <button className="text-button" onClick={() => setView('queue')}>
                      View activity
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}
                {visible.length > 0 ? (
                  <div className={`image-grid ${density}`}>
                    {visible.map((asset) => (
                      <article className="image-card" key={asset.id}>
                        <button
                          className="image-open checker"
                          onClick={() => setSelected(asset)}
                          aria-label={`Open image: ${asset.name}`}
                        >
                          <img
                            src={`/api/assets/${asset.id}/thumb`}
                            alt={asset.name}
                            loading="lazy"
                            width={asset.width}
                            height={asset.height}
                          />
                          <span className="image-expand">
                            <Expand size={16} />
                          </span>
                          {asset.request?.mode === 'edit' && (
                            <span className="edit-badge">Edited</span>
                          )}
                        </button>
                        <div className="image-card-caption">
                          <div>
                            <strong>{asset.name}</strong>
                            <small>
                              {relative(asset.createdAt)}
                              <span>·</span>
                              {asset.width} × {asset.height}
                            </small>
                          </div>
                          <button
                            className={`icon-button favorite ${asset.favorite ? 'is-favorite' : ''}`}
                            aria-label={asset.favorite ? 'Remove favorite' : 'Favorite image'}
                            onClick={() => void changeAsset(asset, { favorite: !asset.favorite })}
                          >
                            <Star size={17} fill={asset.favorite ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : generated.length === 0 &&
                  !search &&
                  filter === 'all' &&
                  view !== 'favorites' ? (
                  <div className="welcome">
                    <div className="welcome-art">
                      <ConceptArt name="object" />
                      <ConceptArt name="leaf" />
                      <ConceptArt name="sun" />
                      <span className="art-label">
                        <Sparkles size={12} />A blank canvas, full of possibilities.
                      </span>
                    </div>
                    <h2>Your next idea starts here.</h2>
                    <p>
                      Describe what you have in mind, or take a little inspiration.
                      <br />
                      Your generated images will find a home right here.
                    </p>
                    <div className="starter-chips">
                      <button onClick={() => choosePreset('product')}>
                        A product moment
                        <ArrowRight size={13} />
                      </button>
                      <button onClick={() => choosePreset('illustration')}>
                        Something illustrated
                        <ArrowRight size={13} />
                      </button>
                      <button onClick={() => choosePreset('concept')}>
                        A world of your own
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="welcome-footer">
                      <span>
                        01 <strong>Describe it</strong>
                      </span>
                      <span>
                        02 <strong>Make it yours</strong>
                      </span>
                      <span>
                        03 <strong>Keep creating</strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title={
                      view === 'favorites' ? 'Keep the good ones close.' : 'Nothing here just yet.'
                    }
                    text={
                      view === 'favorites'
                        ? 'Star an image to collect your favorites here.'
                        : 'Try a different search or filter, or create something new.'
                    }
                    onStart={() => {
                      setSearch('');
                      setFilter('all');
                      setView('studio');
                    }}
                  />
                )}
              </>
            )}
            <footer className="canvas-footer">
              <span>
                <Aperture size={13} />
                Made with your imagination. Powered by Codex.
              </span>
              <button onClick={() => setHelp(true)}>
                How it works
                <ArrowRight size={12} />
              </button>
            </footer>
          </section>
        </main>
      </div>

      <Modal
        returnFocusRef={previewTrigger}
        open={promptPreview}
        onOpenChange={setPromptPreview}
        title="Your generation brief"
        description="Structured using the imagegen skill. No extra AI call is used to prepare this brief."
      >
        <pre className="prompt-preview">{structuredPrompt(draft)}</pre>
        <p className="muted">
          Reference roles and preservation instructions are included with your images. Aspect ratio
          is a request; actual output dimensions appear in your library.
        </p>
        <button
          className="secondary-button"
          onClick={() =>
            void navigator.clipboard
              .writeText(structuredPrompt(draft))
              .then(() => toast.success('Brief copied.'))
              .catch(() => toast.error('Clipboard access is unavailable.'))
          }
        >
          <Copy size={15} />
          Copy brief
        </button>
      </Modal>
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="Your Codex connection"
        description="The studio uses the Codex installed on this computer."
      >
        <div className={`connection-banner ${health.data?.ready ? 'ready' : ''}`}>
          {health.data?.ready ? <Check size={20} /> : <Terminal size={20} />}
          <div>
            <strong>
              {health.data?.ready ? 'Connected and ready to create' : 'Connection needs attention'}
            </strong>
            <p>
              {health.data?.reason ||
                (health.data?.ready
                  ? 'Your existing ChatGPT login is used. No API key needed.'
                  : 'Checking the local Codex installation…')}
            </p>
          </div>
        </div>
        <dl className="settings-list">
          <dt>Integration</dt>
          <dd>Codex app server · local stdio</dd>
          <dt>Runtime</dt>
          <dd>{health.data?.version || 'Checking…'}</dd>
          <dt>Model</dt>
          <dd>{health.data?.model || 'Your Codex default'}</dd>
          <dt>Imagegen skill</dt>
          <dd>
            {health.data?.skillAvailable ? 'Found · supplied with every generation' : 'Not found'}
          </dd>
          <dt>Binary</dt>
          <dd className="mono">{health.data?.binary || 'Not found'}</dd>
          <dt>Local library</dt>
          <dd className="mono">{health.data?.dataDir || 'Checking…'}</dd>
        </dl>
        <p className="muted">
          Model and provider settings are inherited. Image generation is enabled for studio sessions
          only. No global configuration is changed.
        </p>
        <button
          className="secondary-button"
          onClick={() =>
            void api<Health>('/api/health/refresh', { method: 'POST', body: '{}' })
              .then((value) => {
                query.setQueryData(['health'], value);
                toast.success('Connection checked.');
              })
              .catch((error) => toast.error(error.message))
          }
        >
          <RotateCcw size={15} />
          Check connection
        </button>
      </Modal>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="A small studio. Big possibilities."
        description="Your Codex imagegen workflow, with a little more room to create."
      >
        <div className="help-steps">
          <div>
            <span>01</span>
            <section>
              <h3>Start with an idea</h3>
              <p>
                Describe the subject, mood, and intended use. Prompt starters give you a useful
                first draft.
              </p>
            </section>
          </div>
          <div>
            <span>02</span>
            <section>
              <h3>Add some direction</h3>
              <p>
                Upload references and choose their roles. For edits, label one image as the edit
                target and say what must stay unchanged.
              </p>
            </section>
          </div>
          <div>
            <span>03</span>
            <section>
              <h3>Generate, then keep exploring</h3>
              <p>
                Your existing Codex account creates the image online. Download the original, save a
                favorite, reuse the brief, or start an edit.
              </p>
            </section>
          </div>
        </div>
        <div className="help-note">
          Generation uses your Codex usage limits. Each variation is a separate call. Closing the
          browser leaves the local queue running; stop the server to end the session. Your library
          persists on disk.
        </div>
      </Modal>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="A closer look"
        description="Original image, creative brief, and next steps."
        className="image-modal"
      >
        {selected && (
          <div className="image-detail">
            <div className="preview-column">
              {editTarget && (
                <div className="compare-tabs" aria-label="Compare edit">
                  <button aria-pressed={!compareOriginal} onClick={() => setCompareOriginal(false)}>
                    Edited result
                  </button>
                  <button aria-pressed={compareOriginal} onClick={() => setCompareOriginal(true)}>
                    Original
                  </button>
                </div>
              )}
              <div className="image-detail-preview checker">
                <img
                  src={`/api/assets/${compareOriginal && editTarget ? editTarget.id : selected.id}/image`}
                  alt={
                    compareOriginal && editTarget ? `Original: ${editTarget.name}` : selected.name
                  }
                />
              </div>
              <a
                className="text-button original-link"
                href={`/api/assets/${selected.id}/image`}
                target="_blank"
                rel="noreferrer"
              >
                <Expand size={14} />
                Open full resolution
              </a>
            </div>
            <div className="image-detail-info">
              <span className="section-eyebrow">
                {selected.request?.mode === 'edit' ? 'EDITED IMAGE' : 'GENERATED IMAGE'}
              </span>
              <h3>{selected.name}</h3>
              <div className="asset-meta">
                <span>
                  {selected.width} × {selected.height}
                </span>
                <span>{selected.format.toUpperCase()}</span>
                <span>{(selected.bytes / 1024 / 1024).toFixed(1)} MB</span>
                {selected.hasAlpha && <span>Alpha channel</span>}
              </div>
              <p className="detail-prompt">{selected.request?.prompt}</p>
              {selected.request?.style && <p className="muted">{selected.request.style}</p>}
              <a className="generate-button" href={`/api/assets/${selected.id}/download`}>
                <ArrowDownToLine size={17} />
                Download original
              </a>
              <button className="secondary-button" onClick={() => reuse(selected, 'edit')}>
                <WandSparkles size={16} />
                Edit this image
              </button>
              <div className="detail-actions">
                <button onClick={() => reuse(selected, 'prompt')}>
                  <RotateCcw size={15} />
                  Reuse brief
                </button>
                <button onClick={() => reuse(selected, 'reference')}>
                  <Link2 size={15} />
                  Use as reference
                </button>
                <button
                  onClick={() => void changeAsset(selected, { favorite: !selected.favorite })}
                >
                  <Star size={15} fill={selected.favorite ? 'currentColor' : 'none'} />
                  {selected.favorite ? 'Unfavorite' : 'Favorite'}
                </button>
                <button
                  onClick={() => {
                    void changeAsset(selected, { archived: !selected.archived });
                    setSelected(null);
                  }}
                >
                  <Archive size={15} />
                  {selected.archived ? 'Restore image' : 'Archive image'}
                </button>
              </div>
              <a
                className="text-button"
                href={`/api/assets/${selected.id}/prompt`}
                download={`imagegen-${selected.id.slice(0, 8)}-brief.json`}
              >
                <FileText size={13} />
                Export prompt and settings
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EmptyState({
  title,
  text,
  onStart,
}: {
  title: string;
  text: string;
  onStart: () => void;
}) {
  return (
    <div className="empty-state">
      <div>
        <Images size={32} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="secondary-button" onClick={onStart}>
        Back to creating
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function JobCard({
  job,
  onCancel,
  onReuse,
  onOpen,
}: {
  job: Job;
  onCancel: () => void;
  onReuse: () => void;
  onOpen: () => void;
}) {
  const ongoing = job.status === 'running' || job.status === 'queued';
  return (
    <article className="job-card">
      <div className="job-card-top">
        <span className={`job-status ${job.status}`}>
          {job.status === 'running' && <LoaderCircle className="spin" size={12} />} {job.status}
        </span>
        <span>
          {relative(job.createdAt)} · Variation {job.variant}
        </span>
      </div>
      <h3>{job.request.prompt}</h3>
      <p>{job.stage}</p>
      {job.error && <div className="error-message">{job.error}</div>}
      {job.messages.length > 0 && (
        <details>
          <summary>Codex activity</summary>
          {job.messages.map((text, i) => (
            <p className="activity-message" key={i}>
              {text}
            </p>
          ))}
        </details>
      )}
      <div className="job-card-actions">
        {ongoing ? (
          <button className="secondary-button" onClick={onCancel}>
            <Square size={12} />
            Cancel
          </button>
        ) : (
          <>
            <button className="secondary-button" onClick={onReuse}>
              <RotateCcw size={14} />
              Reuse brief
            </button>
            {job.assetIds.length > 0 && (
              <button className="secondary-button" onClick={onOpen}>
                View image
                <ArrowRight size={14} />
              </button>
            )}
          </>
        )}
        {job.usage?.input_tokens !== undefined && (
          <small>
            {job.usage.input_tokens.toLocaleString()} input ·{' '}
            {(job.usage.output_tokens || 0).toLocaleString()} output tokens
          </small>
        )}
      </div>
    </article>
  );
}
