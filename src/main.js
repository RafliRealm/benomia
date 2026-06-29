import 'dotenv/config';
import { BrowserAgent } from './agent/browser.js';
import aiEngine from './agent/ai.js';
import { CatchStrategy } from './strategies/catch.js';
import { FuseStrategy } from './strategies/fuse.js';
import { BattleStrategy } from './strategies/battle.js';
import stateManager from './utils/state.js';
import logger from './utils/logger.js';

const LOOP_INTERVAL = 5000;       // ms antar loop
const STATS_INTERVAL = 10;        // print stats setiap N loop
const BATTLE_MIN_BEANS = 3;       // min beans sebelum battle
const FUSE_CHECK_INTERVAL = 5;    // cek fuse setiap N loop

class BeanomiaAgent {
  constructor() {
    this.browser = new BrowserAgent();
    this.running = false;
    this.loopCount = 0;
    this.strategies = {};
  }

  async start() {
    logger.info('🫘 =============================================');
    logger.info('🫘  BEANOMIA AI AGENT - Starting Up');
    logger.info('🫘 =============================================');

    // Init browser
    await this.browser.init();

    // Init strategies
    this.strategies = {
      catch: new CatchStrategy(this.browser),
      fuse: new FuseStrategy(this.browser),
      battle: new BattleStrategy(this.browser),
    };

    // Navigate ke game
    await this.browser.goto('/');
    await this.browser.page.waitForTimeout(2000);

    // Connect wallet
    logger.info('Connecting wallet...');
    await this.browser.connectWallet();
    await this.browser.page.waitForTimeout(3000);

    // Start main loop
    this.running = true;
    this._setupShutdown();

    logger.info('Agent loop started - press Ctrl+C to stop');
    await this._mainLoop();
  }

  async _mainLoop() {
    while (this.running) {
      try {
        this.loopCount++;

        // Print stats berkala
        if (this.loopCount % STATS_INTERVAL === 0) {
          this._printStats();
        }

        // Get current game state
        const gameState = await this.browser.getGameState();
        const currentPhase = stateManager.get('strategy').phase;
        const beans = stateManager.get('beans');

        // Tentukan fase berdasarkan progress
        const recommendedPhase = this._recommendPhase(beans, currentPhase);
        if (recommendedPhase !== currentPhase) {
          stateManager.setPhase(recommendedPhase);
        }

        // AI decision (setiap 3 loop atau saat ada dialog)
        let decision = null;
        const hasDialog = gameState.dialogs.length > 0;
        if (this.loopCount % 3 === 0 || hasDialog) {
          decision = await aiEngine.decide(gameState, recommendedPhase);
        }

        // Execute strategy berdasarkan phase
        await this._executePhase(recommendedPhase, decision, gameState);

        await this._sleep(LOOP_INTERVAL);

      } catch (e) {
        logger.error(`Loop error: ${e.message}`);
        if (process.env.DEBUG === 'true') logger.error(e.stack);

        // Screenshot untuk debug
        try {
          await this.browser.screenshot(`error_loop_${this.loopCount}`);
        } catch {}

        await this._sleep(10000); // wait longer after error
      }
    }
  }

  _recommendPhase(beans, current) {
    const count = beans?.length || 0;

    // Prioritas: pastikan ada cukup beans dulu
    if (count < BATTLE_MIN_BEANS) return 'catch';

    // Cek apakah perlu fuse
    if (this.loopCount % FUSE_CHECK_INTERVAL === 0) {
      const hasDuplicates = this._checkDuplicates(beans);
      if (hasDuplicates) return 'fuse';
    }

    // Default: battle untuk earn
    if (count >= BATTLE_MIN_BEANS) {
      return process.env.AUTO_BATTLE !== 'false' ? 'battle' : 'catch';
    }

    return current || 'catch';
  }

  _checkDuplicates(beans) {
    if (!beans?.length) return false;
    const threshold = parseInt(process.env.FUSE_THRESHOLD || '3');
    const counts = {};
    for (const b of beans) {
      const key = b.name?.toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
    return Object.values(counts).some(c => c >= threshold);
  }

  async _executePhase(phase, aiDecision, gameState) {
    // Override dengan AI decision jika ada dan prioritasnya tinggi
    if (aiDecision && aiDecision.priority >= 7) {
      logger.debug(`AI override: ${aiDecision.action}`);
      await this._handleAIAction(aiDecision, gameState);
      return;
    }

    switch (phase) {
      case 'catch':
        if (process.env.AUTO_CATCH !== 'false') {
          await this.strategies.catch.execute();
        }
        break;

      case 'fuse':
        if (process.env.AUTO_FUSE !== 'false') {
          await this.strategies.fuse.execute();
          // Setelah fuse, kembali ke battle
          stateManager.setPhase('battle');
        }
        break;

      case 'battle':
        if (process.env.AUTO_BATTLE !== 'false') {
          await this.strategies.battle.execute();
        }
        break;

      default:
        logger.warn(`Unknown phase: ${phase}`);
        stateManager.setPhase('catch');
    }
  }

  async _handleAIAction(decision, gameState) {
    switch (decision.action) {
      case 'navigate':
        await this.browser.goto(`/${decision.target}`);
        break;

      case 'catch':
        await this.strategies.catch.execute();
        break;

      case 'fuse':
        await this.strategies.fuse.execute();
        break;

      case 'battle':
        await this.strategies.battle.execute();
        break;

      case 'wait':
        logger.info(`Waiting: ${decision.reasoning}`);
        await this._sleep(5000);
        break;

      case 'observe':
        await this.browser.screenshot(`observe_${this.loopCount}`);
        break;

      default:
        // Coba klik target sebagai button
        if (decision.target) {
          await this.browser.clickButton(decision.target);
        }
    }
  }

  _printStats() {
    const summary = stateManager.getSummary();
    logger.info('─────────────────────────────');
    logger.info(`📊 STATS (loop #${this.loopCount})`);
    logger.info(`   Beans: ${summary.beans} | Team: ${summary.team}`);
    logger.info(`   Catches: ${summary.catches} | Fuses: ${summary.fuses}`);
    logger.info(`   Battles: ${summary.battles} | Win Rate: ${summary.winRate}`);
    logger.info(`   Earnings: ${summary.earnings} $BEANOMIA`);
    logger.info(`   Phase: ${summary.phase.toUpperCase()}`);
    logger.info('─────────────────────────────');
  }

  _setupShutdown() {
    const shutdown = async (signal) => {
      logger.info(`\nReceived ${signal}, shutting down gracefully...`);
      this.running = false;
      this._printStats();
      await this.browser.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// Entry point
const agent = new BeanomiaAgent();
agent.start().catch(e => {
  logger.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
