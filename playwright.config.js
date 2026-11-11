import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const isCI = Boolean(process.env.CI);
const port = 8000;

export default defineConfig({
    testDir: 'tests',
    // En local, les traces vont dans le dossier temporaire (un dossier synchronisé, comme
    // OneDrive, peut verrouiller les fichiers pendant leur nettoyage).
    outputDir: isCI ? 'test-results' : path.join(os.tmpdir(), 'multi-track-audio-reader-tests'),
    // Les 7 pistes (~32 Mo) sont téléchargées et décodées avant chaque test.
    timeout: 90_000,
    expect: { timeout: 10_000 },
    retries: isCI ? 1 : 0,
    // Chaque page décode ~630 Mo de pistes : au-delà de 2 pages en parallèle, la machine
    // sature et les tests ralentissent jusqu'à expirer.
    workers: 2,
    reporter: isCI ? [['github'], ['list']] : 'list',

    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
        launchOptions: {
            // Le contexte audio démarre sans attendre de geste utilisateur réel.
            args: ['--autoplay-policy=no-user-gesture-required'],
        },
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Chromium de Playwright par défaut ; PW_CHROME=1 utilise le Chrome déjà
                // installé, sans télécharger de navigateur.
                channel: process.env.PW_CHROME ? 'chrome' : undefined,
            },
        },
    ],

    // Site statique : un simple serveur HTTP suffit.
    webServer: {
        command: `${process.platform === 'win32' ? 'python' : 'python3'} -m http.server ${port} --bind 127.0.0.1`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !isCI,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 30_000,
    },
});
