import logger from '../utils/logger.js';
import stateManager from '../utils/state.js';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const FUSE_THRESHOLD = parseInt(process.env.FUSE_THRESHOLD || '3');
const KEEP_RARE = process.env.KEEP_RARE_BEANS !== 'false';

export class FuseStrategy {
  constructor(browser) {
    this.browser = browser;
  }

  async execute() {
    logger.info('=== FUSE PHASE ===');
    await this.browser.goto('/fuse');
    await this.browser.page.waitForTimeout(2000);

    const state = await this.browser.getGameState();
    const beans = stateManager.get('beans');

    // Cari kandidat fuse: beans duplikat yang aman untuk di-fuse
    const candidates = this._findFuseCandidates(beans);

    if (!candidates.length) {
      logger.info('No fuse candidates found');
      return false;
    }

    logger.info(`Found ${candidates.length} fuse candidate groups`);
    let fused = 0;

    for (const group of candidates) {
      const success = await this._performFuse(group);
      if (success) fused++;
    }

    logger.info(`Completed ${fused} fuse operations`);
    return fused > 0;
  }

  _findFuseCandidates(beans) {
    if (!beans?.length) return [];

    // Group beans by name
    const groups = {};
    for (const bean of beans) {
      const key = bean.name?.toLowerCase() || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(bean);
    }

    const candidates = [];
    for (const [name, group] of Object.entries(groups)) {
      const rarity = group[0]?.rarity || 'Common';
      const rarityIdx = RARITY_ORDER.indexOf(rarity);

      // Skip rare+ beans jika setting aktif
      if (KEEP_RARE && rarityIdx >= 2) {
        logger.debug(`Skipping fuse for ${name} (${rarity}) - keeping rare+`);
        continue;
      }

      // Fuse jika ada cukup duplikat
      if (group.length >= FUSE_THRESHOLD) {
        candidates.push({
          name,
          rarity,
          beans: group,
          fuseCount: Math.floor(group.length / FUSE_THRESHOLD),
        });
      }
    }

    // Sort: fuse common dulu, baru uncommon
    candidates.sort((a, b) =>
      RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
    );

    return candidates;
  }

  async _performFuse(group) {
    logger.info(`Fusing ${group.fuseCount}x ${group.name} (${group.rarity})`);

    try {
      // Pilih beans untuk fuse di UI
      const toFuse = group.beans.slice(0, FUSE_THRESHOLD);

      for (const bean of toFuse) {
        // Klik bean di fuse UI
        const clicked = await this.browser.clickSelector(
          `[data-bean-id="${bean.id}"], [data-id="${bean.id}"]`
        );

        if (!clicked) {
          // Fallback: klik by name
          await this.browser.page.evaluate((name) => {
            const els = document.querySelectorAll('[class*="bean"], [class*="creature"]');
            for (const el of els) {
              if (el.textContent?.includes(name)) {
                el.click();
                break;
              }
            }
          }, bean.name);
        }

        await this.browser.page.waitForTimeout(500);
      }

      // Klik tombol fuse
      const fuseClicked = await this.browser.clickButton('Fuse') ||
                          await this.browser.clickButton('Evolve') ||
                          await this.browser.clickButton('Merge');

      if (!fuseClicked) {
        logger.warn('Fuse button not found');
        return false;
      }

      await this.browser.page.waitForTimeout(3000); // animasi fuse

      // Cek hasil
      const result = await this.browser.getGameState();
      const evolved = result.notifications.some(n =>
        n?.toLowerCase().includes('evolved') ||
        n?.toLowerCase().includes('fused') ||
        n?.toLowerCase().includes('merged')
      );

      if (evolved) {
        const nextRarity = RARITY_ORDER[RARITY_ORDER.indexOf(group.rarity) + 1] || group.rarity;
        stateManager.recordFuse(
          toFuse.map(b => b.id),
          {
            id: Date.now().toString(),
            name: group.name,
            rarity: nextRarity,
            level: 1,
            evolvedAt: new Date().toISOString(),
          }
        );
        return true;
      }

      return false;
    } catch (e) {
      logger.error(`Fuse error: ${e.message}`);
      return false;
    }
  }
}
