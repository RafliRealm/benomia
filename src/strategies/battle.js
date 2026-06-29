import logger from '../utils/logger.js';
import stateManager from '../utils/state.js';
import aiEngine from '../agent/ai.js';

export class BattleStrategy {
  constructor(browser) {
    this.browser = browser;
    this.consecutiveLosses = 0;
    this.maxConsecutiveLosses = 5;
  }

  async execute() {
    logger.info('=== BATTLE PHASE ===');

    if (this.consecutiveLosses >= this.maxConsecutiveLosses) {
      logger.warn(`${this.consecutiveLosses} consecutive losses - switching to catch/fuse to strengthen team`);
      this.consecutiveLosses = 0;
      stateManager.setPhase('catch');
      return false;
    }

    await this.browser.goto('/battle');
    await this.browser.page.waitForTimeout(2000);

    // Setup tim terbaik sebelum battle
    await this._optimizeTeam();

    // Cari opponent
    const opponent = await this._findOpponent();
    if (!opponent) {
      logger.info('No opponents available, waiting...');
      await this.browser.page.waitForTimeout(5000);
      return false;
    }

    // Mulai battle
    const result = await this._doBattle(opponent);

    if (result.won) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
    }

    stateManager.recordBattle(result);
    return result.won;
  }

  async _optimizeTeam() {
    const beans = stateManager.get('beans');
    if (!beans?.length) return;

    // Sort beans: rarity desc, level desc
    const RARITY_SCORE = { Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };
    const sorted = [...beans].sort((a, b) => {
      const rA = RARITY_SCORE[a.rarity] || 1;
      const rB = RARITY_SCORE[b.rarity] || 1;
      if (rB !== rA) return rB - rA;
      return (b.level || 1) - (a.level || 1);
    });

    const maxTeam = parseInt(process.env.MAX_TEAM_SIZE || '6');
    const newTeam = sorted.slice(0, maxTeam).map(b => b.id);
    stateManager.updateTeam(newTeam);

    logger.debug(`Team optimized: ${sorted.slice(0, maxTeam).map(b => `${b.name}(${b.rarity})`).join(', ')}`);
  }

  async _findOpponent() {
    const state = await this.browser.getGameState();

    // Cari tombol challenge/duel
    const challengeButtons = state.buttons.filter(b => {
      const t = b.text?.toLowerCase() || '';
      return t.includes('battle') || t.includes('duel') ||
             t.includes('challenge') || t.includes('fight');
    });

    if (!challengeButtons.length) {
      logger.debug('No battle buttons found');
      return null;
    }

    // Pilih opponent pertama yang tersedia
    return challengeButtons[0];
  }

  async _doBattle(opponent) {
    const startTime = Date.now();
    let earned = 0;
    let won = false;

    try {
      // Klik challenge
      await this.browser.clickButton(opponent.text);
      await this.browser.page.waitForTimeout(2000);

      // Loop battle turns
      const maxTurns = 30;
      for (let turn = 0; turn < maxTurns; turn++) {
        const state = await this.browser.getGameState();

        // Cek apakah battle selesai
        const battleEnd = this._checkBattleEnd(state);
        if (battleEnd) {
          won = battleEnd.won;
          earned = battleEnd.earned;
          logger.debug(`Battle ended turn ${turn}: ${won ? 'WIN' : 'LOSS'}`);
          break;
        }

        // Pilih move terbaik
        await this._chooseBestMove(state);
        await this.browser.page.waitForTimeout(1500);
      }

      // Dismiss result
      await this.browser.clickButton('Continue') ||
      await this.browser.clickButton('Next') ||
      await this.browser.clickButton('Close');

    } catch (e) {
      logger.error(`Battle error: ${e.message}`);
    }

    return {
      won,
      earned,
      duration: Date.now() - startTime,
      opponent: opponent.text,
    };
  }

  async _chooseBestMove(state) {
    // Prioritas: attack move yang kuat dulu
    const attackPriority = ['Ultimate', 'Special', 'Attack', 'Skill', 'Strike', 'Blast'];
    const defensePriority = ['Heal', 'Shield', 'Defend'];

    // Cek HP tim (jika rendah, heal)
    const lowHp = state.bodyText?.toLowerCase().includes('low hp') ||
                  state.bodyText?.includes('10%') ||
                  state.bodyText?.includes('5%');

    const priority = lowHp
      ? [...defensePriority, ...attackPriority]
      : [...attackPriority, ...defensePriority];

    for (const move of priority) {
      const found = state.buttons.find(b =>
        b.text?.toLowerCase().includes(move.toLowerCase()) && !b.disabled
      );
      if (found) {
        await this.browser.clickButton(found.text);
        logger.debug(`Used move: ${found.text}`);
        return;
      }
    }

    // Fallback: klik button pertama yang aktif
    const firstActive = state.buttons.find(b => !b.disabled && b.text);
    if (firstActive) {
      await this.browser.clickButton(firstActive.text);
    }
  }

  _checkBattleEnd(state) {
    const text = state.bodyText?.toLowerCase() || '';
    const notifications = state.notifications.join(' ').toLowerCase();
    const combined = text + ' ' + notifications;

    if (combined.includes('victory') || combined.includes('won') || combined.includes('winner')) {
      // Parse earned tokens
      const earnMatch = combined.match(/earned?\s+([\d.]+)\s*\$?bean/i) ||
                        combined.match(/([\d.]+)\s*\$beanomia/i);
      const earned = earnMatch ? parseFloat(earnMatch[1]) : 0;
      return { won: true, earned };
    }

    if (combined.includes('defeat') || combined.includes('lost') || combined.includes('lose')) {
      return { won: false, earned: 0 };
    }

    return null;
  }
}
