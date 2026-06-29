import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const STATE_FILE = process.env.STATE_FILE || 'state/game_state.json';

const DEFAULT_STATE = {
  lastUpdated: null,
  session: {
    startTime: null,
    totalBattles: 0,
    totalCatches: 0,
    totalFuses: 0,
    earningsToday: 0,
  },
  beans: [],           // array of { id, name, rarity, level, stats }
  team: [],            // bean IDs yang aktif di tim
  inventory: {
    catchItems: 0,
    fuseItems: 0,
    tokens: 0,
  },
  battleHistory: [],   // last 50 battles
  strategy: {
    phase: 'catch',    // catch | fuse | battle
    nextAction: null,
  },
};

export class StateManager {
  constructor() {
    this.state = this._load();
  }

  _load() {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(STATE_FILE)) {
      try {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const saved = JSON.parse(raw);
        logger.debug(`State loaded: ${saved.beans?.length || 0} beans, phase=${saved.strategy?.phase}`);
        return { ...DEFAULT_STATE, ...saved };
      } catch (e) {
        logger.warn('State file corrupt, starting fresh');
      }
    }
    return { ...DEFAULT_STATE };
  }

  save() {
    this.state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  get(key) {
    return key ? this.state[key] : this.state;
  }

  set(key, value) {
    this.state[key] = value;
    this.save();
  }

  updateBeans(beans) {
    this.state.beans = beans;
    this.save();
    logger.info(`Bean collection updated: ${beans.length} beans total`);
  }

  updateTeam(teamIds) {
    this.state.team = teamIds;
    this.save();
  }

  recordCatch(bean) {
    this.state.session.totalCatches++;
    const existing = this.state.beans.find(b => b.id === bean.id);
    if (!existing) {
      this.state.beans.push(bean);
    }
    this.save();
    logger.info(`Caught: ${bean.name} (${bean.rarity}) - total catches: ${this.state.session.totalCatches}`);
  }

  recordFuse(inputBeans, resultBean) {
    this.state.session.totalFuses++;
    // Remove fused beans, add result
    this.state.beans = this.state.beans.filter(b => !inputBeans.includes(b.id));
    this.state.beans.push(resultBean);
    this.save();
    logger.info(`Fused ${inputBeans.length} beans → ${resultBean.name} (${resultBean.rarity})`);
  }

  recordBattle(result) {
    this.state.session.totalBattles++;
    if (result.earned) {
      this.state.session.earningsToday += result.earned;
      this.state.inventory.tokens += result.earned;
    }
    // Keep last 50 battles
    this.state.battleHistory.unshift({ ...result, timestamp: new Date().toISOString() });
    this.state.battleHistory = this.state.battleHistory.slice(0, 50);
    this.save();

    const status = result.won ? '🏆 WIN' : '💀 LOSS';
    logger.info(`Battle ${status} | Earned: ${result.earned || 0} $BEANOMIA | W/L: ${this._winRate()}`);
  }

  _winRate() {
    const recent = this.state.battleHistory.slice(0, 20);
    if (!recent.length) return 'N/A';
    const wins = recent.filter(b => b.won).length;
    return `${wins}/${recent.length}`;
  }

  setPhase(phase) {
    this.state.strategy.phase = phase;
    this.save();
    logger.info(`Strategy phase → ${phase.toUpperCase()}`);
  }

  getSummary() {
    const s = this.state.session;
    const recent = this.state.battleHistory.slice(0, 10);
    const wins = recent.filter(b => b.won).length;
    return {
      beans: this.state.beans.length,
      team: this.state.team.length,
      catches: s.totalCatches,
      fuses: s.totalFuses,
      battles: s.totalBattles,
      earnings: s.earningsToday,
      winRate: recent.length ? `${wins}/${recent.length}` : 'N/A',
      phase: this.state.strategy.phase,
    };
  }
}

export default new StateManager();
