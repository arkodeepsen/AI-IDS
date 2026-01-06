# AI-Based Intrusion Detection System (IDS) - Implementation Guide

## 📋 Project Overview

An AI-powered network intrusion detection system built with **Next.js 16**, **PostgreSQL** (via Prisma with Neon serverless adapter), and multiple **Machine Learning algorithms** for robust anomaly detection. The system includes RLHF (Reinforcement Learning from Human Feedback) for continuous improvement, auto-response capabilities, and a Chrome extension for real-time monitoring.

---

## 🏗️ Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 |
| Language | TypeScript |
| Database | PostgreSQL + Prisma ORM + Neon Serverless |
| AI Integration | Google Gemini API |
| ML Algorithms | Isolation Forest, Autoencoder, K-Means, KNN |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Icons | Lucide React |

---

## 📁 Project Structure

```
Major-Project/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── alerts/               # Alert management
│   │   ├── analyze/              # Gemini AI analysis
│   │   ├── auto-response/        # Auto-response management
│   │   ├── detect/               # Core detection endpoint
│   │   ├── detections/           # Detection history (DB)
│   │   ├── metrics/              # ML model metrics
│   │   ├── rlhf/                 # RLHF feedback API
│   │   ├── stats/                # System statistics
│   │   └── training/             # Training data management
│   ├── page.tsx                  # Main dashboard
│   ├── layout.tsx                # Root layout
│   └── globals.css               # Global styles
│
├── components/
│   ├── controls/                 # Control panels
│   │   ├── AutoResponseControl.tsx    # Auto-response settings UI
│   │   ├── RLHFFeedbackPanel.tsx      # RLHF weight visualization
│   │   ├── TrainingDataManager.tsx    # Training data management
│   │   └── index.ts              # Barrel exports
│   ├── AIAssistant.tsx           # Gemini AI chat assistant
│   ├── AlertsPanel.tsx           # Security alerts panel
│   ├── DatasetInfo.tsx           # Dataset information display
│   ├── DetectionFeed.tsx         # Real-time detection feed
│   ├── ModelComparison.tsx       # ML model comparison
│   ├── Navigation.tsx            # Main navigation
│   ├── StatsCards.tsx            # Statistics cards
│   └── TrafficChart.tsx          # Traffic visualization
│
├── lib/
│   ├── ml/                       # Machine Learning Layer
│   │   ├── isolation-forest.ts   # Isolation Forest algorithm
│   │   ├── autoencoder.ts        # Neural network autoencoder
│   │   ├── kmeans.ts             # K-Means clustering
│   │   ├── knn.ts                # K-Nearest Neighbors
│   │   ├── ensemble.ts           # Ensemble detector (combines all)
│   │   ├── features.ts           # Feature extraction utilities
│   │   ├── training-data.ts      # Training data generation
│   │   ├── metrics.ts            # Model performance metrics
│   │   └── index.ts              # Barrel exports
│   │
│   ├── services/                 # Business Logic Services
│   │   ├── detection.ts          # Central detection service
│   │   ├── rlhf.ts               # RLHF feedback system
│   │   ├── auto-response.ts      # Automatic threat response
│   │   ├── auto-training.ts      # Auto-retraining pipeline
│   │   └── index.ts              # Barrel exports
│   │
│   ├── gemini.ts                 # Google Gemini AI integration
│   ├── prisma.ts                 # Prisma client configuration
│   ├── types.ts                  # TypeScript type definitions
│   └── utils.ts                  # Utility functions
│
├── chrome-extension/             # Browser Extension
│   ├── manifest.json             # Manifest V3 configuration
│   ├── background/
│   │   └── service-worker.js     # Background monitoring
│   ├── popup/
│   │   ├── popup.html            # Popup UI
│   │   ├── popup.css             # Popup styles
│   │   └── popup.js              # Popup logic
│   ├── options/
│   │   ├── options.html          # Settings page
│   │   └── options.js            # Settings logic
│   └── icons/                    # Extension icons
│
├── prisma/
│   └── schema.prisma             # Database schema
│
└── data/                         # Stored data (JSON files)
```

---

## 🧠 Machine Learning Architecture

### Ensemble Detector

The system uses an **ensemble approach** combining four ML algorithms for robust detection:

```
┌─────────────────────────────────────────────────────────────┐
│                    ENSEMBLE DETECTOR                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Isolation   │  │  Autoencoder │  │   K-Means    │      │
│  │   Forest     │  │   (Neural)   │  │  Clustering  │      │
│  │   (30%)      │  │    (25%)     │  │    (20%)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └────────────┬────┴────────┬────────┘               │
│                      │             │                        │
│              ┌───────┴───────┐     │                        │
│              │   Weighted    │     │                        │
│              │   Ensemble    │◄────┘                        │
│              │    Score      │                              │
│              └───────┬───────┘                              │
│                      │                                      │
│              ┌───────┴───────┐                              │
│              │      KNN      │                              │
│              │    (25%)      │                              │
│              │ + Attack Type │                              │
│              └───────────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Algorithm Details

#### 1. Isolation Forest (`lib/ml/isolation-forest.ts`)
- **Purpose**: Unsupervised anomaly detection
- **Method**: Isolates anomalies by random partitioning
- **Config**: 50 trees, 128 sample size
- **Output**: Anomaly score (0-1)

#### 2. Autoencoder (`lib/ml/autoencoder.ts`)
- **Purpose**: Neural network-based anomaly detection
- **Method**: Reconstruction error analysis
- **Architecture**: 7 → 3 → 7 (encoder-decoder)
- **Output**: Reconstruction error as anomaly score

#### 3. K-Means Clustering (`lib/ml/kmeans.ts`)
- **Purpose**: Cluster-based anomaly detection
- **Method**: Distance from nearest cluster centroid
- **Config**: 5 clusters, 50 iterations
- **Output**: Normalized distance score

#### 4. KNN Classifier (`lib/ml/knn.ts`)
- **Purpose**: Supervised classification with attack type prediction
- **Method**: Neighbor-based weighted voting
- **Config**: k=5 neighbors
- **Features**:
  - Attack type classification
  - Online learning support
  - Distance-weighted voting

### Feature Extraction

Network packets are transformed into 7-dimensional feature vectors:

```typescript
// lib/ml/features.ts
export function extractFeatures(packet: NetworkPacket): number[] {
  return [
    normalizedPort(packet.sourcePort),
    normalizedPort(packet.destPort),
    normalizedProtocol(packet.protocol),
    normalizedPacketSize(packet.packetSize),
    ipEntropy(packet.sourceIP),
    ipEntropy(packet.destIP),
    flagScore(packet.flags)
  ];
}
```

---

## 🔄 RLHF (Reinforcement Learning from Human Feedback)

### Overview

The RLHF system allows model weights to be adjusted based on user feedback:

```
┌──────────────────────────────────────────────────────────┐
│                    RLHF Pipeline                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Detection → User Feedback → Weight Adjustment → Retrain │
│                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Detection  │───▶│   Feedback  │───▶│   Adjust    │  │
│  │   Result    │    │  Correct/   │    │   Model     │  │
│  │             │    │  Incorrect  │    │   Weights   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Service: `lib/services/rlhf.ts`

```typescript
// Key Methods
rlhfService.addFeedback({ detectionId, isCorrect, modelMethod });
rlhfService.adjustWeights();      // Auto-called every 10 feedback entries
rlhfService.getWeights();         // Get current ensemble weights
rlhfService.getMetrics();         // Accuracy statistics
rlhfService.resetWeights();       // Reset to defaults
```

### Weight Adjustment Algorithm

1. Collect feedback on detection accuracy per method
2. Calculate accuracy rate for each ML method
3. Blend current weights with performance-based weights
4. Normalize to sum to 1.0
5. Apply learning rate (default: 0.05) for gradual adjustment

---

## 🛡️ Auto-Response System

### Overview

Automatic threat prevention without human intervention:

```
┌──────────────────────────────────────────────────────────┐
│                 AUTO-RESPONSE PIPELINE                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Detection → Threat Evaluation → Action Decision → Log   │
│                                                          │
│  Threat Levels:                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ CRITICAL │ │   HIGH   │ │  MEDIUM  │ │   LOW    │    │
│  │ Auto-    │ │ Auto-    │ │ Optional │ │ Monitor  │    │
│  │ Block    │ │ Block    │ │ Alert    │ │ Only     │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Service: `lib/services/auto-response.ts`

```typescript
// Configuration
interface AutoResponseConfig {
  enabled: boolean;
  threatThreshold: number;      // 0-1, default 0.85
  autoBlockDuration: number;    // minutes (0 = permanent)
  blockOnCritical: boolean;     // default: true
  blockOnHigh: boolean;         // default: true
  blockOnMedium: boolean;       // default: false
  whitelistedIPs: string[];
}

// Key Methods
autoResponseService.evaluateThreat(detection);  // Returns action
autoResponseService.blockIP(ip, options);
autoResponseService.unblockIP(ip, reason);
autoResponseService.isBlocked(ip);
autoResponseService.getBlockedIPs();
autoResponseService.getConfig();
autoResponseService.updateConfig(updates);
```

### Blocking Logic

```typescript
shouldAutoBlock(detection) {
  if (!detection.isAnomaly) return false;
  if (detection.confidence < threatThreshold * 100) return false;
  
  switch (detection.threatLevel) {
    case 'critical': return config.blockOnCritical;
    case 'high': return config.blockOnHigh;
    case 'medium': return config.blockOnMedium;
    default: return false;
  }
}
```

---

## 📚 Auto-Training Pipeline

### Overview

Automatic model retraining when new anomalies are detected:

```
┌──────────────────────────────────────────────────────────┐
│               AUTO-TRAINING PIPELINE                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ Collect  │───▶│  Verify  │───▶│ Retrain  │           │
│  │ Detection│    │  Labels  │    │  Model   │           │
│  │  Data    │    │          │    │          │           │
│  └──────────┘    └──────────┘    └──────────┘           │
│                                                          │
│  Storage: JSON files in /data directory                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Service: `lib/services/auto-training.ts`

```typescript
// Configuration
interface TrainingConfig {
  enabled: boolean;
  minSamplesForRetrain: number;     // default: 100
  autoRetrainOnNewAnomalies: boolean;
  maxStoredSamples: number;          // default: 10000
  includeNormalTraffic: boolean;
  normalTrafficRatio: number;        // default: 0.5
}

// Key Methods
autoTrainingService.addDetectionData(detection);
autoTrainingService.verifyDataPoint(id, isCorrect, correctLabel);
autoTrainingService.executeRetraining();
autoTrainingService.getTrainingData(options);
autoTrainingService.exportTrainingData();  // JSON export
autoTrainingService.importTrainingData(json);
autoTrainingService.getStats();
```

### Data Point Structure

```typescript
interface TrainingDataPoint {
  id: string;
  features: number[];
  label: 'normal' | 'anomaly';
  attackType?: AttackType;
  confidence: number;
  verified: boolean;
  createdAt: Date;
  detectionId?: string;
}
```

---

## 🌐 Chrome Extension

### Features

- Real-time threat monitoring
- Live detection feed
- Auto-refresh every 5 seconds
- Threat level visualization
- Badge notifications for anomalies
- Settings customization

### Structure

```
chrome-extension/
├── manifest.json           # Manifest V3
├── background/
│   └── service-worker.js   # Background monitoring
├── popup/
│   ├── popup.html          # Main UI
│   ├── popup.css           # Styles
│   └── popup.js            # Logic
├── options/
│   ├── options.html        # Settings page
│   └── options.js          # Settings logic
└── icons/                  # Icon assets
```

### Permissions

```json
{
  "permissions": ["storage", "notifications", "alarms"],
  "host_permissions": [
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*"
  ]
}
```

### Installation

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `chrome-extension` folder

---

## 🔌 API Reference

### Detection API

#### `POST /api/detect`
Run detection on simulated network traffic.

```typescript
// Request
{
  count?: number;         // Number of packets (default: 10)
  method?: DetectionMethod; // 'Ensemble' | 'Isolation Forest' | etc.
}

// Response
{
  results: DetectionResult[];
  summary: {
    total: number;
    anomalies: number;
    normal: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  weights: EnsembleWeights;
}
```

#### `POST /api/detections`
Persist detection to database.

---

### RLHF API

#### `POST /api/rlhf`
Submit feedback for a detection.

```typescript
// Request
{
  detectionId: string;
  isCorrect: boolean;
  correctLabel?: 'normal' | 'anomaly';
  correctAttackType?: AttackType;
  notes?: string;
}
```

#### `GET /api/rlhf`
Get RLHF metrics and current weights.

---

### Auto-Response API

#### `GET /api/auto-response`
Get auto-response configuration and stats.

#### `POST /api/auto-response`
```typescript
// Actions
{ action: 'block', ipAddress: string, reason: string }
{ action: 'unblock', ipAddress: string }
{ action: 'updateConfig', config: Partial<AutoResponseConfig> }
```

---

### Training API

#### `GET /api/training`
Get training data and statistics.

#### `POST /api/training`
```typescript
// Actions
{ action: 'verify', id: string, isCorrect: boolean, correctLabel?: string }
{ action: 'retrain' }
{ action: 'export' }
{ action: 'import', data: TrainingDataExport }
{ action: 'clear' }
```

---

### Metrics API

#### `GET /api/metrics`
Get performance metrics for all ML models.

```typescript
// Response
{
  metrics: [
    {
      method: 'Isolation Forest',
      accuracy: 0.94,
      precision: 0.92,
      recall: 0.89,
      f1Score: 0.91,
      falsePositiveRate: 0.08,
      detectionTime: 2.3
    },
    // ... for each model including KNN
  ]
}
```

---

## 🗃️ Database Schema

```prisma
// prisma/schema.prisma

model Detection {
  id              String    @id @default(uuid())
  timestamp       DateTime  @default(now())
  sourceIP        String
  destIP          String
  sourcePort      Int
  destPort        Int
  protocol        String
  packetSize      Int
  isAnomaly       Boolean
  threatLevel     String
  attackType      String?
  confidence      Float
  detectionMethod String
  modelScores     Json?
  autoResponse    String?
  createdAt       DateTime  @default(now())
}

model BlockedIP {
  id          String    @id @default(uuid())
  ipAddress   String    @unique
  reason      String
  attackType  String?
  confidence  Float
  blockedAt   DateTime  @default(now())
  expiresAt   DateTime?
  autoBlocked Boolean   @default(false)
}

model TrainingData {
  id         String   @id @default(uuid())
  features   Json
  label      String
  attackType String?
  confidence Float
  verified   Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

---

## 🔧 Configuration

### Environment Variables

```env
# .env

# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Google Gemini AI
GEMINI_API_KEY="your-gemini-api-key"
```

### Prisma with Neon Adapter

```typescript
// lib/prisma.ts
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

// Handle build time when DATABASE_URL might not be available
const prisma = connectionString
  ? new PrismaClient({
      adapter: new PrismaNeon({ connectionString }),
    })
  : new PrismaClient();

export default prisma;
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database (Neon recommended)
- Google Gemini API key

### Installation

```bash
# Clone repository
git clone <repository-url>
cd Major-Project

# Install dependencies
npm install
# or
bun install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Run development server
npm run dev
# or
bun dev
```

### Build for Production

```bash
npm run build
npm start
```

---

## 📊 Dashboard Features

### Main Tabs

1. **Overview** - System stats, traffic charts, threat distribution
2. **Detections** - Real-time detection feed with filtering
3. **ML Models** - Model comparison and metrics
4. **Alerts** - Security alerts management
5. **AI Assistant** - Gemini-powered threat analysis
6. **Auto-Response** - Block management and configuration
7. **Training** - Training data management and export

### Components

| Component | Description |
|-----------|-------------|
| `StatsCards` | Key metrics (packets, anomalies, accuracy) |
| `TrafficChart` | Real-time traffic visualization |
| `DetectionFeed` | Live detection results |
| `ModelComparison` | ML model performance comparison |
| `AlertsPanel` | Security alerts with severity levels |
| `AIAssistant` | Gemini AI chat for threat analysis |
| `RLHFFeedbackPanel` | Weight visualization and adjustment |
| `AutoResponseControl` | Blocked IPs and threshold settings |
| `TrainingDataManager` | Export/import training data |

---

## 🔒 Security Considerations

1. **Whitelisting** - Configure trusted IPs to prevent false blocks
2. **Threshold Tuning** - Adjust threat threshold based on environment
3. **RLHF Review** - Regularly review model weights after feedback
4. **Data Privacy** - Training data may contain sensitive information
5. **API Security** - Add authentication for production deployments

---

## 📈 Future Enhancements

- [ ] Real network packet capture (pcap integration)
- [ ] Additional ML models (LSTM, Transformer)
- [ ] Multi-tenant support
- [ ] Alert notifications (email, Slack, webhook)
- [ ] Firewall integration (iptables, Windows Firewall)
- [ ] Mobile app for monitoring
- [ ] Distributed detection across multiple nodes

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 👥 Contributors

AI-Based IDS Development Team

---

*Last Updated: January 6, 2026*
