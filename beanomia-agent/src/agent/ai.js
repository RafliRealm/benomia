import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import stateManager from '../utils/state.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert AI agent playing Beanomia, a Solana browser-based creature-collector game.

GAME MECHANICS:
- CATCH: Find and catch wild Beans in the game world
- FUSE: Combine duplicate/weak Beans to create stronger evolved Beans
- BATTLE: Duel other tamers using your Bean squad to earn $BEANOMIA tokens
- EARN: Accumulate $BEANOMIA through victories

RARITY TIERS (weakest to strongest):
Common → Uncommon → Rare → Epic → Legendary

STRATEGY PRIORITIES:
1. Always build a strong team of 6 Beans before heavy battling
2. Fuse duplicate Common/Uncommon Beans when you have 3+ of same type
3. Keep all Rare+ Beans - never fuse them unless you have 5+ copies
4. Battle frequently once team is established - this is the main earning mechanic
5. Prioritize Beans with high ATK + SPD stats for battle team

DECISION FORMAT:
Always respond with a JSON object containing:
{
  "action": "catch|fuse|battle|navigate|wait|observe",
  "target": "specific bean name, button text, or page to navigate to",
  "reasoning": "brief explanation",
  "priority": 1-10,
  "nextSteps": ["step1", "step2"]
}`;

export class AIDecisionEngine {
  constructor() {
    this.messageHistory = [];
    this.maxHistory = 10;
  }

  async decide(gameState, currentPhase) {
    const summary = stateManager.getSummary();

    const userMessage = `
CURRENT GAME STATE:
URL: ${gameState.url}
Page Content: ${gameState.bodyText}
Available Buttons: ${JSON.stringify(gameState.buttons.filter(b => !b.disabled).slice(0, 15))}
Active Dialogs: ${JSON.stringify(gameState.dialogs)}
Notifications: ${JSON.stringify(gameState.notifications)}

AGENT PROGRESS:
- Current Phase: ${currentPhase}
- Total Beans: ${summary.beans}
- Team Size: ${summary.team}
- Total Catches: ${summary.catches}
- Total Fuses: ${summary.fuses}
- Total Battles: ${summary.battles}
- Earnings Today: ${summary.earnings} $BEANOMIA
- Recent Win Rate: ${summary.winRate}

What should the agent do next? Respond only with valid JSON.`;

    // Trim history to avoid token overflow
    this.messageHistory = this.messageHistory.slice(-this.maxHistory);
    this.messageHistory.push({ role: 'user', content: userMessage });

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: this.messageHistory,
      });

      const responseText = response.content[0].text;
      this.messageHistory.push({ role: 'assistant', content: responseText });

      // Parse JSON decision
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0]);
        logger.info(`AI Decision: ${decision.action.toUpperCase()} → ${decision.target} (priority: ${decision.priority})`);
        logger.debug(`Reasoning: ${decision.reasoning}`);
        return decision;
      }
    } catch (e) {
      logger.error(`AI decision error: ${e.message}`);
    }

    // Fallback decision
    return {
      action: 'observe',
      target: 'current page',
      reasoning: 'AI error - observing to recover',
      priority: 1,
      nextSteps: ['screenshot', 'wait'],
    };
  }

  async analyzeScreenshot(screenshotPath, question) {
    const fs = await import('fs');
    const imageData = fs.readFileSync(screenshotPath).toString('base64');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData },
          },
          { type: 'text', text: question },
        ],
      }],
    });

    return response.content[0].text;
  }

  async analyzeBattleSetup(teamBeans, opponentBeans) {
    const prompt = `
Analyze this Beanomia battle matchup and pick the optimal team order:

MY TEAM: ${JSON.stringify(teamBeans, null, 2)}
OPPONENT: ${JSON.stringify(opponentBeans, null, 2)}

Respond with JSON: { "optimalOrder": [beanId1, beanId2, ...], "strategy": "brief tip" }`;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text;
      const json = text.match(/\{[\s\S]*\}/);
      return json ? JSON.parse(json[0]) : null;
    } catch {
      return null;
    }
  }

  clearHistory() {
    this.messageHistory = [];
  }
}

export default new AIDecisionEngine();
