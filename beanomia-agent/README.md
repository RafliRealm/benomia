# 🫘 Beanomia AI Agent

AI agent otomatis untuk bermain [Beanomia](https://beanomia.com) — Solana creature-collector game.  
Agent ini menggunakan **Playwright** (browser automation) + **Claude AI** (decision engine) untuk catch, fuse, dan battle secara efektif.

---

## ✨ Fitur

| Fitur | Keterangan |
|-------|-----------|
| 🎯 **Auto Catch** | Roam map dan catch wild Beans otomatis |
| 🔀 **Auto Fuse** | Fuse beans duplikat dengan strategi optimal |
| ⚔️ **Auto Battle** | Battle dengan pemilihan move cerdas |
| 🧠 **AI Brain** | Claude AI membuat keputusan kontekstual |
| 📊 **Progress Tracker** | State tersimpan antar session |
| 🔄 **Phase Manager** | Otomatis switch catch→fuse→battle |
| 📸 **Debug Screenshot** | Screenshot otomatis saat error |

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
git clone https://github.com/RafliRealm/beanomia-agent
cd beanomia-agent
npm install
npm run install:browsers
```

### 2. Setup config

```bash
cp .env.example .env
nano .env
```

Isi minimal:
```env
WALLET_PRIVATE_KEY=your_solana_wallet_private_key
ANTHROPIC_API_KEY=your_claude_api_key
HEADLESS=false   # false dulu untuk lihat agent bekerja
```

### 3. Jalankan agent

```bash
# Mode normal (browser terlihat)
npm start

# Mode headless (untuk VPS/server)
npm run start:headless

# Mode debug
npm run start:debug
```

---

## 🖥️ Deploy di VPS (Tencent Cloud / Ubuntu)

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chromium dependencies
sudo apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libgbm1 libasound2 libxrandr2 libxss1

# Install project
npm install && npm run install:browsers

# Jalankan headless
HEADLESS=true npm start

# Atau dengan PM2 (recommended)
npm install -g pm2
pm2 start "HEADLESS=true npm start" --name beanomia-agent
pm2 logs beanomia-agent
```

---

## ⚙️ Konfigurasi Strategy

Edit `.env` untuk tune perilaku agent:

```env
# Fuse hanya jika punya 3+ duplikat
FUSE_THRESHOLD=3

# Jangan fuse beans Rare/Epic/Legendary
KEEP_RARE_BEANS=true

# Max 6 beans di tim aktif
MAX_TEAM_SIZE=6

# Battle delay (dalam menit)
BATTLE_INTERVAL=5
```

---

## 🧠 Cara Kerja AI Decision Engine

```
Game State (DOM/buttons/text)
         ↓
   BrowserAgent.getGameState()
         ↓
   AIDecisionEngine.decide()  ←── Claude AI (claude-sonnet-4-6)
         ↓
   Phase Manager
   ┌─────┬──────┬────────┐
   │CATCH│ FUSE │ BATTLE │
   └─────┴──────┴────────┘
         ↓
   StateManager.save()
```

**Phase logic otomatis:**
- Beans < 3 → **CATCH** (kumpulkan dulu)
- Ada 3+ duplikat → **FUSE** (evolve team)
- Beans ≥ 3 → **BATTLE** (earn $BEANOMIA)

---

## 📁 Struktur Project

```
beanomia-agent/
├── src/
│   ├── main.js              # Orchestrator utama
│   ├── agent/
│   │   ├── browser.js       # Playwright wrapper
│   │   └── ai.js            # Claude AI decision engine
│   ├── strategies/
│   │   ├── catch.js         # Catch wild beans
│   │   ├── fuse.js          # Fuse & evolve beans
│   │   └── battle.js        # Battle & earn tokens
│   └── utils/
│       ├── logger.js        # Winston logger
│       └── state.js         # Game state persistence
├── state/
│   ├── game_state.json      # Progress tersimpan
│   └── browser_session.json # Session wallet (auto-generated)
├── logs/
│   └── agent.log
├── .env.example
└── package.json
```

---

## 🔧 Troubleshooting

**Wallet tidak connect otomatis?**  
→ Jalankan sekali dengan `HEADLESS=false`, approve di browser, session tersimpan otomatis.

**Agent tidak menemukan wild beans?**  
→ Tambah `SLOW_MO=500` di `.env` — mungkin game butuh waktu load lebih lama.

**Terlalu banyak kalah battle?**  
→ Agent auto-switch ke catch/fuse jika kalah 5x berturut-turut. Biarkan strengthen dulu.

**Jalan di VPS RAM 2GB?**  
→ Pakai `HEADLESS=true`, tutup service lain sementara. Chromium butuh ~400MB.

---

## ⚠️ Disclaimer

Agent ini untuk tujuan eksperimen/pembelajaran. Gunakan dengan wallet terpisah (bukan wallet utama). Selalu review kode sebelum memasukkan private key.

---

## 📝 License

MIT — bebas dimodifikasi untuk kebutuhan pribadi.
