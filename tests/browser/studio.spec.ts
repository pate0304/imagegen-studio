import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';

test('desktop: generate, preview, favorite, reuse, download and archive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/studio');
  await expect(page.getByText('Codex connected')).toBeVisible();
  await page.getByLabel('Describe your image').fill('Browser test: a green ceramic cup');
  await page.getByRole('button', { name: 'Preview brief' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Primary request: Browser test: a green ceramic cup',
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  const image = page
    .getByRole('button', { name: 'Open image: Browser test: a green ceramic cup' })
    .first();
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => image.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await image.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('80 × 64');
  const download = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Download original' }).click();
  expect((await download).suggestedFilename()).toMatch(/imagegen-.*\.png/);
  await dialog.getByRole('button', { name: 'Favorite', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Unfavorite' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit this image' }).click();
  await expect(page.getByLabel('What would you like to change?')).toBeVisible();
  await expect(page.locator('.reference select')).toHaveValue('edit target');
  await page.getByLabel('What would you like to change?').fill('Make only the cup blue');
  await page.getByRole('button', { name: 'Create edited image' }).click();
  await expect(
    page.getByRole('button', { name: 'Open image: Make only the cup blue' }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Open image: Make only the cup blue' }).first().click();
  await page.getByRole('button', { name: 'Archive image' }).click();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open image: Make only the cup blue' }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('uploads get roles; invalid edit shows an actionable message; drafts persist', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit an image', exact: true }).click();
  await page
    .getByLabel('What would you like to change?')
    .fill('Replace the backdrop with soft green');
  await page.getByRole('button', { name: 'Create edited image' }).click();
  await expect(
    page.getByText('Editing needs exactly one image labeled “Edit target”.'),
  ).toBeVisible();
  const buffer = await sharp({
    create: { width: 30, height: 20, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer });
  await expect(page.locator('.reference select')).toHaveValue('edit target');
  await page.reload();
  await expect(page.getByLabel('What would you like to change?')).toHaveValue(
    'Replace the backdrop with soft green',
  );
  await expect(page.locator('.reference img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.reference img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
});

test('mobile: templates, connection dialog and generation controls fit the screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Prompt starters', exact: true }).click();
  await page.getByRole('button', { name: /Product photography.*Use starter/ }).click();
  await expect(page.getByLabel('Describe your image')).toHaveValue(/sculptural ceramic vase/);
  await page.getByRole('button', { name: 'Fine-tune your brief' }).click();
  await page.getByLabel('Exact text in the image').fill('HELLO');
  await page.getByRole('switch', { name: 'Transparent background' }).click();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Connection settings' }).click();
  await expect(page.getByRole('dialog')).toContainText('Connected and ready to create');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-studio.png', fullPage: true });
});

test('main workspace, starters, and connection dialog pass automated accessibility checks', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Codex connected')).toBeVisible();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Prompt starters', exact: true }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Connection settings' }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('unfinished edit drafts survive reload, new brief can be undone, and keyboard focus is restored', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit an image', exact: true }).click();
  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await page.getByRole('button', { name: 'Fine-tune your brief' }).click();
  await page.getByLabel('Style direction').fill('Keep this unfinished draft');
  await page.reload();
  await expect(page.getByLabel('What would you like to change?')).toHaveValue('');
  await expect(page.getByRole('button', { name: '16:9', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Fine-tune your brief' }).click();
  await expect(page.getByLabel('Style direction')).toHaveValue('Keep this unfinished draft');
  await page.getByRole('button', { name: 'New brief', exact: true }).click();
  await expect(page.getByLabel('Describe your image')).toBeFocused();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('What would you like to change?')).toHaveValue('');
  await page.getByRole('button', { name: 'Preview brief' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Preview brief' })).toBeFocused();
});

test('primary action stays in the viewport at laptop and mobile sizes', async ({ page }) => {
  for (const size of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.getByLabel('Describe your image').fill('A clear view of the primary action');
    const action = page.getByRole('button', { name: 'Generate image', exact: true });
    await expect(action).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Fine-tune your brief' }).click();
    await page.getByLabel('Exact text in the image').fill('Hello');
    await expect(action).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('button', { name: 'Connection settings' })).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('archive undo, sort, search and original comparison work together', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Codex connected')).toBeVisible();
  await page.getByLabel('Describe your image').fill('Comparison journey original');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open image: Comparison journey original', exact: true })
    .first()
    .click();
  const original = await page.locator('.image-detail-preview img').getAttribute('src');
  await page.getByRole('button', { name: 'Edit this image', exact: true }).click();
  await page.getByLabel('What would you like to change?').fill('Comparison journey edited');
  await page.getByRole('button', { name: 'Create edited image' }).click();
  await page
    .getByRole('button', { name: 'Open image: Comparison journey edited', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(page.locator('.image-detail-preview img')).toHaveAttribute('src', original!);
  await page.getByRole('button', { name: 'Edited result', exact: true }).click();
  await expect(page.locator('.image-detail-preview img')).not.toHaveAttribute('src', original!);
  await page.getByRole('button', { name: 'Archive image' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page
      .getByRole('button', { name: 'Open image: Comparison journey edited', exact: true })
      .first(),
  ).toBeVisible();
  await page.getByLabel('Search images').fill('Comparison journey');
  await expect(page.locator('.image-card')).toHaveCount(2);
  await page.getByLabel('Sort images').selectOption('oldest');
  await expect(page.locator('.image-card').first()).toContainText('Comparison journey original');
  await page.getByRole('button', { name: 'Compact grid' }).click();
  await expect(page.locator('.image-grid')).toHaveClass(/compact/);
  await page.getByLabel('Search images').fill('no-matching-image-1234567');
  await expect(page.getByText('Nothing here just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to creating' }).click();
  await expect(page.getByLabel('Search images')).toHaveValue('');
});

test('missing Codex has actionable onboarding and never queues a generation', async ({ page }) => {
  let generated = false;
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        ready: false,
        auth: 'Not connected',
        skillAvailable: false,
        reason: 'Codex CLI was not found. Install Codex, run codex login, then refresh.',
      },
    }),
  );
  await page.route('**/api/jobs', (route) => {
    generated = true;
    return route.abort();
  });
  await page.goto('/');
  await expect(page.getByText('Connect Codex to start creating')).toBeVisible();
  await page.getByLabel('Describe your image').fill('This should wait for connection');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Connection needs attention');
  expect(generated).toBe(false);
});

test('mobile composer and image dialog pass automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('Your creative space')).toBeAttached();
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.getByLabel('Describe your image').fill('Mobile accessibility fixture');
  await page.getByRole('button', { name: 'Generate image', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open image: Mobile accessibility fixture' }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Library/ }).click();
  await page
    .getByRole('button', { name: /Open image:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('pasted image becomes an edit target and keyboard submission creates the result', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Codex connected')).toBeVisible();
  await page.getByRole('button', { name: 'Edit an image', exact: true }).click();
  const buffer = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#ace' } })
    .png()
    .toBuffer();
  await page.getByLabel('What would you like to change?').focus();
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'pasted-reference.png', { type: 'image/png' }));
    document
      .querySelector('textarea')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
  }, buffer.toString('base64'));
  await expect(page.locator('.reference select')).toHaveValue('edit target');
  await page.getByLabel('What would you like to change?').fill('Keyboard and paste edit journey');
  await page.getByLabel('What would you like to change?').press('Control+Enter');
  await expect(
    page.getByRole('button', { name: 'Open image: Keyboard and paste edit journey' }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
