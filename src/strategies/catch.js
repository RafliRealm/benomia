import logger from '../utils/logger.js';
import stateManager from '../utils/state.js';

export class CatchStrategy {
  constructor(browser) {
    this.browser = browser;
  }

  async execute() {
    logger.info('=== CATCH PHASE ===');
    await this.browser.goto('/play');
    await this.browser.page.waitForTimeout(2000);

    // Cari wild beans di map
    const found = await this._findWildBeans();
    if (!found.length) {
      logger.info('No wild beans found, roaming...');
      await this._roam();
      return false;
    }

    let caught = 0;
    for (const bean of found) {
      const success = await this._catchBean(bean);
      if (success) caught++;
    }

    logger.info(`Caught ${caught}/${found.length} beans this round`);
    return caught > 0;
  }

  async _findWildBeans() {
    // Cari elemen bean di map
    const beans = await this.browser.page.evaluate(() => {
      const selectors = [
        '.wild-bean', '[data-type="wild"]', '.bean-encounter',
        '.creature', '[class*="wild"]', '[class*="bean"]',
      ];
      const found = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if (el.offsetParent !== null) {
            found.push({
              selector: sel,
              text: el.textContent?.trim().slice(0, 50),
              class: el.className,
            });
          }
        });
      }
      return found;
    });

    logger.debug(`Found ${beans.length} potential wild beans`);
    return beans;
  }

  async _catchBean(beanEl) {
    try {
      // Klik bean untuk encounter
      await this.browser.clickSelector(beanEl.selector);
      await this.browser.page.waitForTimeout(1500);

      // Cek encounter dialog
      const state = await this.browser.getGameState();
      const hasCatchOption = state.buttons.some(b =>
        b.text?.toLowerCase().includes('catch') ||
        b.text?.toLowerCase().includes('throw') ||
        b.text?.toLowerCase().includes('capture')
      );

      if (!hasCatchOption) return false;

      // Klik catch
      await this.browser.clickButton('Catch') ||
      await this.browser.clickButton('Throw') ||
      await this.browser.clickButton('Capture');

      await this.browser.page.waitForTimeout(2000);

      // Cek hasil
      const result = await this.browser.getGameState();
      const caught = result.notifications.some(n =>
        n?.toLowerCase().includes('caught') ||
        n?.toLowerCase().includes('captured')
      );

      if (caught) {
        // Parse bean info dari notification
        const beanName = this._parseBeanName(result.notifications);
        stateManager.recordCatch({
          id: Date.now().toString(),
          name: beanName || beanEl.text || 'Unknown Bean',
          rarity: this._detectRarity(result.bodyText),
          level: 1,
          caughtAt: new Date().toISOString(),
        });
        return true;
      }

      // Dismiss dialog jika gagal catch
      await this.browser.clickButton('Run') ||
      await this.browser.clickButton('Flee') ||
      await this.browser.clickButton('Close');

      return false;
    } catch (e) {
      logger.debug(`Catch attempt failed: ${e.message}`);
      return false;
    }
  }

  async _roam() {
    // Klik random area di map untuk explore
    const directions = [
      { x: 640, y: 360 }, { x: 400, y: 300 },
      { x: 880, y: 400 }, { x: 640, y: 200 },
    ];
    const dir = directions[Math.floor(Math.random() * directions.length)];
    await this.browser.page.mouse.click(dir.x, dir.y);
    await this.browser.page.waitForTimeout(3000);
  }

  _parseBeanName(notifications) {
    for (const n of notifications) {
      const match = n?.match(/caught\s+(?:a\s+)?([A-Z][a-zA-Z]+)/i);
      if (match) return match[1];
    }
    return null;
  }

  _detectRarity(text) {
    if (!text) return 'Common';
    const lower = text.toLowerCase();
    if (lower.includes('legendary')) return 'Legendary';
    if (lower.includes('epic')) return 'Epic';
    if (lower.includes('rare')) return 'Rare';
    if (lower.includes('uncommon')) return 'Uncommon';
    return 'Common';
  }
}
