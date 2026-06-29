import { chromium } from 'playwright';
import logger from '../utils/logger.js';

export class BrowserAgent {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.gameUrl = process.env.GAME_URL || 'https://beanomia.com';
  }

  async init() {
    logger.info('Launching browser...');
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true',
      slowMo: parseInt(process.env.SLOW_MO || '100'),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // anti-detection
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      // Simpan session agar tidak perlu login ulang
      storageState: this._getStoragePath(),
    });

    this.page = await this.context.newPage();

    // Intercept dan log network calls game
    this.page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('beanomia') && !url.includes('.png') && !url.includes('.js')) {
        logger.debug(`[NET] ${response.status()} ${url}`);
      }
    });

    logger.info('Browser ready');
    return this;
  }

  _getStoragePath() {
    try {
      const fs = await import('fs');
      const path = 'state/browser_session.json';
      if (fs.existsSync(path)) return path;
    } catch {}
    return undefined;
  }

  async saveSession() {
    try {
      await this.context.storageState({ path: 'state/browser_session.json' });
      logger.debug('Browser session saved');
    } catch (e) {
      logger.warn('Could not save browser session: ' + e.message);
    }
  }

  async goto(path = '') {
    const url = `${this.gameUrl}${path}`;
    logger.debug(`Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.page.waitForTimeout(1500);
  }

  async screenshot(name = 'screenshot') {
    const p = `logs/${name}_${Date.now()}.png`;
    await this.page.screenshot({ path: p, fullPage: false });
    return p;
  }

  async getPageContent() {
    return await this.page.content();
  }

  async getPageText() {
    return await this.page.evaluate(() => document.body.innerText);
  }

  // Ambil semua teks + elemen interaktif untuk AI analysis
  async getGameState() {
    return await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], .btn'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          text: el.textContent?.trim().slice(0, 80),
          class: el.className?.slice(0, 60),
          disabled: el.disabled,
        }));

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], .modal, .popup'))
        .filter(el => el.offsetParent !== null)
        .map(el => el.textContent?.trim().slice(0, 200));

      const notifications = Array.from(document.querySelectorAll('.toast, .notification, .alert'))
        .map(el => el.textContent?.trim());

      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText?.slice(0, 3000),
        buttons: buttons.slice(0, 30),
        dialogs,
        notifications,
      };
    });
  }

  async clickButton(text, options = {}) {
    const selectors = [
      `button:has-text("${text}")`,
      `[role="button"]:has-text("${text}")`,
      `.btn:has-text("${text}")`,
      `a:has-text("${text}")`,
    ];

    for (const sel of selectors) {
      try {
        const el = await this.page.waitForSelector(sel, { timeout: 3000, state: 'visible' });
        if (el) {
          await el.click(options);
          logger.debug(`Clicked: "${text}"`);
          await this.page.waitForTimeout(800);
          return true;
        }
      } catch {}
    }
    logger.warn(`Button not found: "${text}"`);
    return false;
  }

  async clickSelector(selector, options = {}) {
    try {
      await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
      await this.page.click(selector, options);
      await this.page.waitForTimeout(500);
      return true;
    } catch (e) {
      logger.debug(`Selector not found: ${selector}`);
      return false;
    }
  }

  async waitForSelector(selector, timeout = 10000) {
    try {
      return await this.page.waitForSelector(selector, { timeout, state: 'visible' });
    } catch {
      return null;
    }
  }

  async connectWallet() {
    logger.info('Attempting wallet connection...');
    // Cek apakah sudah connected
    const connected = await this.page.$('[data-wallet-connected], .wallet-address, .connected-wallet');
    if (connected) {
      logger.info('Wallet already connected');
      return true;
    }

    // Klik connect wallet button
    const clicked = await this.clickButton('Connect Wallet') ||
                   await this.clickButton('Connect') ||
                   await this.clickSelector('[data-testid="connect-wallet"]');

    if (!clicked) {
      logger.warn('Could not find wallet connect button - may need manual connection');
      await this.screenshot('wallet_connect_failed');
      return false;
    }

    // Tunggu wallet modal
    await this.page.waitForTimeout(2000);
    // Phantom/Backpack biasanya auto-approve jika sudah authorized
    // User perlu approve pertama kali secara manual
    await this.page.waitForTimeout(3000);

    logger.info('Wallet connection initiated - approve in your wallet extension if prompted');
    return true;
  }

  async close() {
    await this.saveSession();
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }
}
