import { test, expect } from '@playwright/test';

// État du moteur audio, lu directement dans le module de la page.
async function playbackState(page) {
    return page.evaluate(async () => (await import('/audioLogic.js')).getPlaybackState());
}

test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error')
            errors.push(message.text());
    });
    page.errors = errors;

    await page.goto('/');
    await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 60_000 });
});

test.afterEach(async ({ page }) => {
    expect(page.errors, 'erreurs dans la console').toEqual([]);
});

test('la page charge les 7 pistes et la barre de temps', async ({ page }) => {
    await expect(page.locator('.track-control')).toHaveCount(7);
    await expect(page.getByRole('group', { name: 'Batterie' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Saxophone alto / Flûte' })).toBeVisible();
    await expect(page.locator('#transport')).toBeVisible();
    await expect(page.locator('#time-total')).not.toHaveText('0:00');
});

test('Play démarre la lecture et la position avance', async ({ page }) => {
    const play = page.getByRole('button', { name: 'Lecture / pause' });
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'true');

    await expect.poll(async () => (await playbackState(page)).position, { timeout: 10_000 })
        .toBeGreaterThan(1);

    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('changer de niveau pendant la lecture garde la lecture en cours', async ({ page }) => {
    await page.getByRole('button', { name: 'Lecture / pause' }).click();

    const drums = page.getByRole('group', { name: 'Batterie' });
    const level = drums.getByRole('button', { name: /^Niveau 1 sur 3/ });
    await level.click();

    await expect(drums.getByRole('button', { name: /^Niveau 2 sur 3/ })).toBeVisible();
    await expect(drums.locator('#levelButton-0 img')).toHaveAttribute('src', /lvl2\.png$/);
    expect((await playbackState(page)).isPlaying).toBe(true);
});

test('Solo coupe les autres pistes et Muet coupe la piste', async ({ page }) => {
    const drums = page.getByRole('group', { name: 'Batterie' });
    const bass = page.getByRole('group', { name: 'Basse' });

    await drums.getByRole('button', { name: 'Solo', exact: true }).click();
    await expect(drums.getByRole('button', { name: 'Solo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#volume-slider-1')).toHaveClass(/silenced/);
    await expect(page.locator('#volume-slider-0')).not.toHaveClass(/silenced/);

    await drums.getByRole('button', { name: 'Solo', exact: true }).click();
    await bass.getByRole('button', { name: 'Muet', exact: true }).click();
    await expect(bass.getByRole('button', { name: 'Muet', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#volume-slider-1')).toHaveClass(/silenced/);
});

test('la boucle A-B garde la position entre A et B', async ({ page }) => {
    await page.getByRole('button', { name: 'Lecture / pause' }).click();
    await expect.poll(async () => (await playbackState(page)).position).toBeGreaterThan(1);

    await page.getByRole('button', { name: /début de la boucle/ }).click();
    await expect.poll(async () => (await playbackState(page)).position).toBeGreaterThan(
        (await playbackState(page)).loop.start + 1.5);
    await page.getByRole('button', { name: /fin de la boucle/ }).click();

    await expect(page.locator('#loop-toggle-button')).toHaveAttribute('aria-pressed', 'true');
    const { loop } = await playbackState(page);
    expect(loop.active).toBe(true);

    // Plus d'un tour de boucle : la position doit toujours rester dans [A, B].
    const length = loop.end - loop.start;
    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout((length * 1000) / 3);
        const { position } = await playbackState(page);
        expect(position).toBeGreaterThanOrEqual(loop.start);
        expect(position).toBeLessThan(loop.end);
    }
});

test('le bouton de partition télécharge le bon PDF', async ({ page }) => {
    const drums = page.getByRole('group', { name: 'Batterie' });
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        drums.getByRole('button', { name: 'Télécharger la partition' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('drums_lvl1.pdf');
});
