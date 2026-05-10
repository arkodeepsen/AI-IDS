/**
 * Gradient Boosted Trees
 *
 * A small XGBoost-style implementation in pure TypeScript. The library
 * package would pull in a native binding that complicates the demo build, so
 * we ship a hand-rolled boosted ensemble instead. Predictions are squashed
 * through a sigmoid to land in [0,1] for ensemble combination.
 */

interface BoostedLeaf {
  kind: 'leaf';
  value: number;
}

interface BoostedSplit {
  kind: 'split';
  feature: number;
  threshold: number;
  left: BoostedNode;
  right: BoostedNode;
}

type BoostedNode = BoostedLeaf | BoostedSplit;

class RegressionStump {
  root: BoostedNode = { kind: 'leaf', value: 0 };
  private maxDepth: number;
  private minSamples: number;

  constructor(maxDepth = 4, minSamples = 4) {
    this.maxDepth = maxDepth;
    this.minSamples = minSamples;
  }

  fit(features: number[][], residuals: number[]): void {
    this.root = this.build(features, residuals, 0);
  }

  predict(point: number[]): number {
    let node: BoostedNode = this.root;
    while (node.kind === 'split') {
      node = point[node.feature] < node.threshold ? node.left : node.right;
    }
    return node.value;
  }

  private build(features: number[][], residuals: number[], depth: number): BoostedNode {
    const n = features.length;
    const mean = n > 0 ? residuals.reduce((a, b) => a + b, 0) / n : 0;
    if (n < this.minSamples || depth >= this.maxDepth) {
      return { kind: 'leaf', value: mean };
    }

    const split = this.bestSplit(features, residuals);
    if (!split) return { kind: 'leaf', value: mean };

    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (features[i][split.feature] < split.threshold) leftIdx.push(i);
      else rightIdx.push(i);
    }
    if (leftIdx.length === 0 || rightIdx.length === 0) {
      return { kind: 'leaf', value: mean };
    }

    return {
      kind: 'split',
      feature: split.feature,
      threshold: split.threshold,
      left: this.build(
        leftIdx.map(i => features[i]),
        leftIdx.map(i => residuals[i]),
        depth + 1
      ),
      right: this.build(
        rightIdx.map(i => features[i]),
        rightIdx.map(i => residuals[i]),
        depth + 1
      ),
    };
  }

  private bestSplit(
    features: number[][],
    residuals: number[]
  ): { feature: number; threshold: number } | null {
    const numFeatures = features[0].length;
    let bestGain = -Infinity;
    let best: { feature: number; threshold: number } | null = null;

    const totalSum = residuals.reduce((a, b) => a + b, 0);
    const totalSqSum = residuals.reduce((a, b) => a + b * b, 0);
    const baseVar = totalSqSum - (totalSum * totalSum) / residuals.length;

    for (let f = 0; f < numFeatures; f++) {
      const values = [...new Set(features.map(row => row[f]))].sort((a, b) => a - b);
      const candidates =
        values.length > 6
          ? Array.from({ length: 6 }, (_, i) => values[Math.floor((i + 1) * values.length / 7)])
          : values;

      for (const t of candidates) {
        let leftSum = 0,
          leftN = 0,
          leftSqSum = 0;
        for (let i = 0; i < features.length; i++) {
          if (features[i][f] < t) {
            leftSum += residuals[i];
            leftSqSum += residuals[i] * residuals[i];
            leftN++;
          }
        }
        const rightN = features.length - leftN;
        if (leftN === 0 || rightN === 0) continue;

        const rightSum = totalSum - leftSum;
        const rightSqSum = totalSqSum - leftSqSum;
        const leftVar = leftSqSum - (leftSum * leftSum) / leftN;
        const rightVar = rightSqSum - (rightSum * rightSum) / rightN;
        const gain = baseVar - (leftVar + rightVar);

        if (gain > bestGain) {
          bestGain = gain;
          best = { feature: f, threshold: t };
        }
      }
    }

    return best;
  }
}

export class GradientBoosting {
  private stumps: RegressionStump[] = [];
  private learningRate: number;
  private numRounds: number;
  private maxDepth: number;
  private base = 0;
  private trained = false;

  constructor(numRounds = 50, learningRate = 0.1, maxDepth = 4) {
    this.numRounds = numRounds;
    this.learningRate = learningRate;
    this.maxDepth = maxDepth;
  }

  fit(features: number[][], labels: boolean[]): void {
    if (features.length === 0) return;
    const y: number[] = labels.map(l => (l ? 1 : 0));
    const meanY = y.reduce((a: number, b: number) => a + b, 0) / y.length;
    // Logit of base rate so the very first prediction starts near the mean.
    this.base = Math.log((meanY + 1e-6) / (1 - meanY + 1e-6));

    const f = features.map(() => this.base);
    this.stumps = [];

    for (let r = 0; r < this.numRounds; r++) {
      // Negative gradient for log-loss with sigmoid link is (y - p).
      const residuals = f.map((logit, i) => y[i] - this.sigmoid(logit));
      const stump = new RegressionStump(this.maxDepth, 4);
      stump.fit(features, residuals);

      for (let i = 0; i < f.length; i++) {
        f[i] += this.learningRate * stump.predict(features[i]);
      }
      this.stumps.push(stump);
    }
    this.trained = true;
  }

  predict(point: number[]): number {
    if (!this.trained) return 0.5;
    let logit = this.base;
    for (const stump of this.stumps) {
      logit += this.learningRate * stump.predict(point);
    }
    return this.sigmoid(logit);
  }

  isTrained(): boolean {
    return this.trained;
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, x))));
  }
}
