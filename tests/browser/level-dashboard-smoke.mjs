// Real Vue/Vite browser smoke with test-only HTTP fixtures; never starts the API or bot.
// PLAYWRIGHT_MODULE may point to an existing playwright/index.mjs installation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const webRoot = join(root, 'src', 'web');
const reportDirectory = process.env.LEVEL_BROWSER_REPORT_DIR || join(root, 'plans', 'reports', 'level-dashboard-browser');
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(isAbsolute(playwrightModule) ? pathToFileURL(playwrightModule).href : playwrightModule);
const { createServer } = await import(pathToFileURL(join(webRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);
const port = Number(process.env.LEVEL_BROWSER_PORT || 5191);
const origin = `http://127.0.0.1:${port}`;
const results = [];
const clone = (value) => JSON.parse(JSON.stringify(value));

const configFixture = {
  version: 1, enabled: true,
  requiredVerifiedRoleIds: ['1543196526946291783'],
  allowedChannelIds: ['1543196526946291784'],
  xpPerMessage: 20, minContentLength: 10, cooldownSeconds: 60,
  similarityWindow: 10, similarityThreshold: 0.9,
  levelRoles: [{ minLevel: 10, roleId: '1543196526946291785' }],
  rewardSpins: 1, rewardMilestones: [{ minLevel: 10, spins: 2 }],
  minecraftServiceId: 'browser-fixture', maxRewardAttempts: 12, rewardRetryBaseSeconds: 60,
  announcementEnabled: true, announcementChannelId: null,
  adminRoleIds: [], imageEnabled: true, accentColor: '#5865F2',
  extension: { preserved: true, notes: ['test fixture only'] },
};

const rewardFixtures = ['PENDING', 'LEASED', 'DEFERRED', 'COMPLETED', 'FAILED'].map((status, index) => ({
  id: `browser-${status.toLowerCase()}`, userId: `154319652694629179${index}`,
  level: index + 1, spins: index + 1, status, attemptCount: index,
  createdAt: '2026-08-30T02:00:00.000Z', nextAttemptAt: '2026-08-30T02:01:00.000Z',
  lastError: status === 'FAILED' ? 'Lỗi giả lập cho kiểm thử trình duyệt' : null,
}));

async function createFixtureContext(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.mobile ? { width: 375, height: 812 } : { width: 1440, height: 1000 },
    colorScheme: 'dark', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
    serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  const state = {
    config: clone(configFixture), rewards: clone(rewardFixtures),
    configError: options.configError || false, malformed: options.malformed || false,
    saveError: false, configReads: 0, operationReads: 0, writes: [], retries: [],
    pageErrors: [], unexpectedApi: [], blockedExternal: [], fontErrors: [],
  };
  await context.addInitScript(() => { localStorage.setItem('ticket-theme', 'dark'); });
  await context.routeWebSocket(/\/socket\.io\//, (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      state.blockedExternal.push(url.hostname);
      return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/socket.io')) return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return route.continue();
    const fulfill = (data, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      body: JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: data }),
    });
    const path = url.pathname;
    if (path === '/api/auth/refresh') return fulfill({
      token: 'browser-fixture-not-a-real-token',
      user: { id: 'browser-test', discordId: '1543196526946291700', username: 'Browser Test', role: 'ADMIN', permissions: {} },
    });
    if (path === '/api/config' && request.method() === 'GET') {
      state.configReads++;
      if (state.configError) return fulfill('Lỗi tải cấu hình giả lập', 503);
      return fulfill(state.malformed ? { chatLevelConfig: 'not JSON' } : { chatLevelConfig: clone(state.config) });
    }
    if (path === '/api/config' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.saveError) return fulfill('Lỗi lưu cấu hình giả lập', 503);
      state.config = clone(body.chatLevelConfig);
      return fulfill({ chatLevelConfig: clone(state.config) });
    }
    if (path === '/api/chat-levels/leaderboard') {
      state.operationReads++;
      return fulfill([{ userId: '1543196526946291799', level: 12, totalExperience: 3050, experience: 200, experienceForNextLevel: 400 }]);
    }
    if (path === '/api/chat-levels/rewards' || path === '/api/chat-levels/grants') return fulfill(clone(state.rewards));
    if (/^\/api\/chat-levels\/(?:rewards|grants)\/[^/]+\/retry$/.test(path)) {
      const id = decodeURIComponent(path.split('/').at(-2));
      state.retries.push(id);
      const reward = state.rewards.find((item) => item.id === id);
      if (!reward || !['DEFERRED', 'FAILED'].includes(reward.status)) return fulfill('Fixture rejects non-retryable reward', 409);
      reward.status = 'PENDING';
      return fulfill({ retried: true });
    }
    if (path === '/api/chat-levels/setup-status') return fulfill({
      ready: true, configEnabled: true, allowListPresent: true, minecraftServiceId: 'browser-fixture',
      serviceLastSeenAt: '2026-08-30T02:00:00.000Z', pendingCount: 1, deferredCount: 1, failedCount: 1, remediation: [],
    });
    if (['/api/options', '/api/clusters', '/api/staff', '/api/canned', '/api/faqs'].includes(path)) return fulfill([]);
    if (path === '/api/tickets') return fulfill({ tickets: [], total: 0, page: 1, pages: 1 });
    state.unexpectedApi.push(`${request.method()} ${path}`);
    return fulfill('Unexpected API request blocked by browser fixture', 503);
  });
  const page = await context.newPage();
  if (options.clock) await page.clock.install();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => state.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (/\.(?:ttf|otf|woff2?)(?:\?|$)/i.test(response.url()) && response.status() >= 400) state.fontErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (/\.(?:ttf|otf|woff2?)(?:\?|$)/i.test(request.url())) state.fontErrors.push(`Failed ${request.url()}`);
  });
  return { context, page, state };
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(reportDirectory, `${name}.png`), fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: join(reportDirectory, `${name}-viewport.png`), fullPage: false, animations: 'disabled' });
}

async function screenshotPreview(page, name) {
  const preview = page.getByRole('region', { name: 'Xem trước thẻ cấp độ', exact: true });
  await preview.scrollIntoViewIfNeeded();
  const pixelFont = await page.evaluate(async () => {
    await document.fonts.load('16px "Press Start 2P"', 'PLAYER STATS');
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 50;
    const context = canvas.getContext('2d');
    context.font = '16px "Press Start 2P"';
    const pixelWidth = context.measureText('PLAYER STATS').width;
    context.fillText('PLAYER STATS', 4, 30);
    const paintedPixels = [...context.getImageData(0, 0, 320, 50).data].filter((value, index) => index % 4 === 3 && value > 0).length;
    context.font = '16px sans-serif';
    return {
      loaded: [...document.fonts].some((font) => font.family.includes('Press Start 2P') && font.status === 'loaded'),
      pixelWidth, fallbackWidth: context.measureText('PLAYER STATS').width, paintedPixels,
    };
  });
  assert.equal(pixelFont.loaded, true, 'Preview pixel font must load locally rather than silently fall back');
  assert.ok(pixelFont.paintedPixels > 0);
  assert.notEqual(pixelFont.pixelWidth, pixelFont.fallbackWidth, 'Pixel font must produce its own glyph metrics');
  const bounds = await preview.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1, 'Preview must fit the viewport horizontally');
  await preview.screenshot({ path: join(reportDirectory, `${name}.png`), animations: 'disabled' });
  await page.screenshot({ path: join(reportDirectory, `${name}-viewport.png`), animations: 'disabled' });
}

async function scenario(browser, name, callback, options = {}) {
  const fixture = await createFixtureContext(browser, options);
  try {
    await fixture.page.goto(`${origin}/levels`);
    await callback(fixture);
    assert.deepEqual(fixture.state.pageErrors, [], 'Unexpected browser runtime errors');
    assert.deepEqual(fixture.state.unexpectedApi, [], 'Unspecified API endpoints must not silently become test data');
    assert.deepEqual(fixture.state.fontErrors, [], 'Local font assets must not fail, including Vite filesystem access errors');
    assert.deepEqual(fixture.state.blockedExternal, [], 'The dashboard must not attempt external requests for its local assets');
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    await screenshot(fixture.page, `browser-failure-${name}`).catch(() => {});
    results.push({ name, status: 'FAIL', error: error.stack || error.message, pageErrors: fixture.state.pageErrors });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await fixture.context.close();
  }
}

async function runScenarios(browser) {
  await scenario(browser, 'initial-levels-load', async ({ page }) => {
    await page.getByRole('heading', { name: 'Level Chat', exact: true }).waitFor();
    await page.getByLabel('EXP mỗi tin hợp lệ', { exact: true }).waitFor();
    for (const name of ['Ai được nhận EXP?', 'Nhịp độ & chống spam', 'Role theo cấp', 'Phần thưởng Minecraft', 'Thông báo & thẻ cấp độ']) {
      await page.getByRole('heading', { name, exact: true }).first().waitFor();
    }
    assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isDisabled(), true);
    const iconFont = await page.evaluate(async () => {
      await document.fonts.ready;
      await document.fonts.load('24px "Material Symbols Outlined"', 'menu_open');
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 50;
      const context = canvas.getContext('2d');
      context.font = '24px "Material Symbols Outlined"';
      context.fillText('menu_open', 10, 30);
      const pixels = context.getImageData(0, 0, 100, 50).data;
      const paintedPixels = [...pixels].filter((value, index) => index % 4 === 3 && value > 0).length;
      return {
        checked: document.fonts.check('24px "Material Symbols Outlined"'),
        loaded: [...document.fonts].some((font) => font.family.includes('Material Symbols Outlined') && font.status === 'loaded'),
        menuWidth: document.querySelector('#sidebar-toggle .material-symbols-outlined').getBoundingClientRect().width,
        paintedPixels,
      };
    });
    console.log(`Icon font diagnostic: ${JSON.stringify(iconFont)}`);
    assert.equal(iconFont.checked, true);
    assert.equal(iconFont.loaded, true, 'Material Symbols must load from local assets, not fallback text');
    assert.ok(iconFont.menuWidth <= 40, `Menu ligature rendered as text: ${iconFont.menuWidth}px`);
    assert.ok(iconFont.paintedPixels > 0, 'Local Material Symbols font paints no menu_open glyph pixels');
    await screenshot(page, 'browser-levels-desktop-dark');
    await page.getByRole('button', { name: 'Chế độ sáng', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await screenshot(page, 'browser-levels-desktop-light');
    await screenshotPreview(page, 'browser-rank-preview-desktop-light');
    await page.getByRole('button', { name: 'Chế độ tối', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await screenshotPreview(page, 'browser-rank-preview-desktop-dark');
    const preview = page.getByRole('region', { name: 'Xem trước thẻ cấp độ', exact: true });
    const card = preview.locator('.rank-preview');
    assert.equal(await card.evaluate((element) => getComputedStyle(element).getPropertyValue('--rank-accent').trim().toUpperCase()), '#5865F2');
    await page.getByLabel('Màu nhấn thẻ', { exact: true }).fill('#F97316');
    assert.equal(await card.evaluate((element) => getComputedStyle(element).getPropertyValue('--rank-accent').trim().toUpperCase()), '#F97316');
    await page.getByRole('switch', { name: 'Dùng ảnh thẻ cấp độ', exact: true }).uncheck();
    await preview.locator('.preview-disabled').filter({ hasText: 'Ảnh đang tắt. Bot dùng embed văn bản.' }).waitFor();
    await screenshotPreview(page, 'browser-rank-preview-custom-accent-image-disabled');
  });

  await scenario(browser, 'form-json-roundtrip-and-save', async ({ page, state }) => {
    const xp = page.getByLabel('EXP mỗi tin hợp lệ', { exact: true });
    await xp.fill('27');
    await page.getByRole('button', { name: 'JSON nâng cao', exact: true }).click();
    const jsonEditor = page.locator('#chat-level-config');
    const draft = JSON.parse(await jsonEditor.inputValue());
    assert.equal(draft.xpPerMessage, 27);
    assert.deepEqual(draft.extension, configFixture.extension);
    draft.xpPerMessage = 35;
    draft.extension.extra = 'round-trip preserved';
    await jsonEditor.fill(JSON.stringify(draft, null, 2));
    await page.getByRole('button', { name: 'Biểu mẫu hướng dẫn', exact: true }).click();
    assert.equal(await xp.inputValue(), '35');
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/config') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: /Lưu cấu hình/ }).click();
    await saved;
    await page.locator('.toast.success').filter({ hasText: 'Đã lưu cấu hình Level Chat' }).waitFor();
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].chatLevelConfig.xpPerMessage, 35);
    assert.deepEqual(state.writes[0].chatLevelConfig.extension, draft.extension);
    assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isDisabled(), true);
  });

  await scenario(browser, 'invalid-json-and-save-failure-preserve-draft', async ({ page, state }) => {
    const xp = page.getByLabel('EXP mỗi tin hợp lệ', { exact: true });
    await xp.fill('40');
    await page.getByRole('button', { name: 'JSON nâng cao', exact: true }).click();
    const editor = page.locator('#chat-level-config');
    const validDraft = await editor.inputValue();
    await editor.fill('{ invalid JSON');
    await page.getByRole('alert').first().waitFor();
    assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isDisabled(), true);
    await editor.fill(validDraft);
    await page.getByRole('button', { name: 'Biểu mẫu hướng dẫn', exact: true }).click();
    state.saveError = true;
    await page.getByRole('button', { name: /Lưu cấu hình/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Lỗi lưu cấu hình giả lập' }).waitFor();
    assert.equal(await xp.inputValue(), '40');
    assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isEnabled(), true);
    assert.equal(state.config.xpPerMessage, 20);
    await screenshot(page, 'browser-save-error-preserved-draft');
  });

  for (const malformed of [false, true]) {
    await scenario(browser, malformed ? 'malformed-config-save-lock' : 'failed-config-save-lock', async ({ page, state }) => {
      await page.getByRole('alert').first().waitFor();
      assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isDisabled(), true);
      assert.equal(state.writes.length, 0);
      await screenshot(page, malformed ? 'browser-malformed-config' : 'browser-config-load-error');
      state.configError = false;
      state.malformed = false;
      await page.getByRole('button', { name: /Tải lại cấu hình/ }).first().click();
      const xp = page.getByLabel('EXP mỗi tin hợp lệ', { exact: true });
      await xp.waitFor();
      assert.equal(await xp.inputValue(), '20');
      await xp.fill('21');
      assert.equal(await page.getByRole('button', { name: /Lưu cấu hình/ }).isEnabled(), true);
    }, { configError: !malformed, malformed });
  }

  await scenario(browser, 'operational-refresh-preserves-draft-and-retry-truth', async ({ page, state }) => {
    const xp = page.getByLabel('EXP mỗi tin hợp lệ', { exact: true });
    await xp.fill('29');
    const readsBefore = state.configReads;
    const refreshed = page.waitForResponse((response) => response.url().endsWith('/api/chat-levels/leaderboard'));
    await page.getByRole('button', { name: 'Làm mới dữ liệu', exact: true }).click();
    await refreshed;
    assert.equal(await xp.inputValue(), '29');
    assert.equal(state.configReads, readsBefore);
    const periodicRefresh = page.waitForResponse((response) => response.url().endsWith('/api/chat-levels/leaderboard'));
    await page.clock.fastForward(30_100);
    await periodicRefresh;
    assert.equal(await xp.inputValue(), '29');
    assert.equal(state.configReads, readsBefore);
    for (const reward of rewardFixtures) {
      const row = page.getByRole('row').filter({ hasText: reward.userId });
      await row.waitFor();
      assert.ok((await row.innerText()).includes(reward.status));
      assert.equal(await row.getByRole('button').count(), ['DEFERRED', 'FAILED'].includes(reward.status) ? 1 : 0);
    }
    const deferredReward = rewardFixtures.find((item) => item.status === 'DEFERRED');
    const deferredRow = page.getByRole('row').filter({ hasText: deferredReward.userId });
    const retried = page.waitForResponse((response) => response.url().endsWith(`/${deferredReward.id}/retry`));
    await deferredRow.getByRole('button').click();
    await retried;
    await deferredRow.getByText('PENDING', { exact: true }).waitFor();
    assert.deepEqual(state.retries, [deferredReward.id]);
    assert.equal(await xp.inputValue(), '29');
  }, { clock: true });

  await scenario(browser, 'unsaved-navigation-and-reload-confirmation', async ({ page, state }) => {
    const xp = page.getByLabel('EXP mỗi tin hợp lệ', { exact: true });
    await xp.fill('33');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('link', { name: 'Loại ticket', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/levels');
    assert.equal(await xp.inputValue(), '33');
    const readsBefore = state.configReads;
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: /Tải lại cấu hình/ }).first().click();
    assert.equal(await xp.inputValue(), '33');
    assert.equal(state.configReads, readsBefore);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Đặt lại bản soạn về mặc định', exact: true }).click();
    assert.equal(await xp.inputValue(), '33');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Đặt lại bản soạn về mặc định', exact: true }).click();
    assert.equal(await xp.inputValue(), '20');
    assert.equal(await page.getByRole('switch', { name: 'Bật Level Chat', exact: true }).isChecked(), false);
    await page.locator('.level-field-warning').filter({ hasText: 'Danh sách trống: không cộng EXP ở bất kỳ kênh nào.' }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Tải lại cấu hình/ }).first().click();
    await page.waitForFunction(() => document.querySelector('#level-xpPerMessage')?.value === '20');
    await xp.fill('34');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('link', { name: 'Loại ticket', exact: true }).click();
    await page.waitForURL('**/options');
  });

  await scenario(browser, 'command-palette-keyboard-navigation', async ({ page }) => {
    await page.getByRole('heading', { name: 'Level Chat', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Loại ticket', exact: true }).click();
    await page.waitForURL('**/options');
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Tìm kiếm nhanh', exact: true });
    const query = page.getByRole('combobox', { name: 'Tìm trang hoặc nội dung', exact: true });
    await dialog.waitFor();
    assert.equal(await query.evaluate((element) => element === document.activeElement), true);
    await query.fill('Level Chat');
    await page.getByRole('option', { name: /Level Chat/ }).waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/levels');
    await dialog.waitFor({ state: 'hidden' });
    await page.keyboard.press('Control+k');
    await dialog.waitFor();
    await query.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Đóng tìm kiếm' }).evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await query.evaluate((element) => element === document.activeElement), true);
    await query.fill('Options');
    await page.getByRole('option', { name: /Options/ }).waitFor();
    const clearedSelection = await query.evaluate(async (input) => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      return {
        selected: document.querySelector('[role="option"][aria-selected="true"]')?.textContent || '',
        busy: document.querySelector('#command-results').getAttribute('aria-busy'),
      };
    });
    assert.ok(clearedSelection.busy === 'true' || !clearedSelection.selected.includes('Options'), 'Clearing a query must not leave the previous result ready for immediate Enter');
    await query.fill('Level Chat');
    await page.getByRole('option', { name: /Level Chat/ }).waitFor();
    await screenshot(page, 'browser-command-palette');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  });

  await scenario(browser, 'mobile-layout-menu-and-themes', async ({ page }) => {
    await page.getByRole('heading', { name: 'Level Chat', exact: true }).waitFor();
    await page.getByLabel('EXP mỗi tin hợp lệ', { exact: true }).waitFor();
    const assertFits = async () => {
      const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, JSON.stringify(dimensions));
    };
    await assertFits();
    await screenshot(page, 'browser-levels-mobile-dark');
    await page.getByRole('button', { name: 'Chế độ sáng', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await assertFits();
    await screenshot(page, 'browser-levels-mobile-light');
    await screenshotPreview(page, 'browser-rank-preview-mobile-light');
    await page.getByRole('button', { name: 'Chế độ tối', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await screenshotPreview(page, 'browser-rank-preview-mobile-dark');
    await assertFits();
    await page.getByRole('button', { name: 'Chế độ sáng', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.getByRole('heading', { name: 'Level Chat', exact: true }).scrollIntoViewIfNeeded();
    const toggle = page.getByRole('button', { name: 'Mở / thu gọn menu', exact: true });
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('#primary-sidebar').contains(document.activeElement));
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.querySelector('#primary-sidebar').contains(document.activeElement)), true);
    }
    await screenshot(page, 'browser-mobile-menu');
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
    assert.equal(await page.locator('#main-content').evaluate((element) => element.inert), false);
    const search = page.getByRole('button', { name: 'Tìm kiếm nhanh', exact: true });
    await search.click();
    await page.getByRole('dialog', { name: 'Tìm kiếm nhanh', exact: true }).waitFor();
    await page.keyboard.press('Escape');
  }, { mobile: true });
}

await mkdir(reportDirectory, { recursive: true });
let server;
let browser;
const previousApiTarget = process.env.API_TARGET;
try {
  // Even a missing route fixture can never proxy to a developer's active API.
  process.env.API_TARGET = 'http://127.0.0.1:9';
  server = await createServer({
    root: webRoot, configFile: join(webRoot, 'vite.config.js'),
    server: { host: '127.0.0.1', port, strictPort: true },
    plugins: [{
      name: 'block-unmocked-test-api',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (/^\/(?:api|auth|socket\.io)(?:\/|\?)/.test(request.url || '')) {
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ success: false, message: 'No live API is available in this browser smoke test' }));
          } else next();
        });
      },
    }],
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  await runScenarios(browser);
} finally {
  await browser?.close();
  await server?.close();
  if (previousApiTarget === undefined) delete process.env.API_TARGET;
  else process.env.API_TARGET = previousApiTarget;
  await writeFile(join(reportDirectory, 'browser-smoke-results.json'), `${JSON.stringify({
    executedAt: new Date().toISOString(), origin, results,
    isolation: 'Actual Vue/Vite app; test-only auth/config/operations fixtures; fresh browser profiles; sockets and external hosts blocked.',
    limitations: 'Chromium only; fixture-backed UI checks do not verify live OAuth, database, Discord, Minecraft or external font availability.',
  }, null, 2)}\n`);
}
if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1;
