/**
 * Random Forest classifier
 *
 * Pure TypeScript implementation. Each tree is grown on a bootstrap sample
 * with feature subsampling at every split. Predictions return the proportion
 * of trees that voted "anomaly", which lets the ensemble use it as a [0,1]
 * anomaly score alongside the unsupervised models.
 */

interface SplitNode {
  kind: 'split';
  feature: number;
  threshold: number;
  left: TreeNode;
  right: TreeNode;
}

interface LeafNode {
  kind: 'leaf';
  /** Probability this leaf is an attack (1 = attack, 0 = normal). */
  attackProb: number;
  /** Most common attack type at this leaf, if any. */
  attackType?: string;
}

type TreeNode = SplitNode | LeafNode;

interface DecisionTreeOptions {
  maxDepth: number;
  minSamplesSplit: number;
  featuresPerSplit: number;
}

class DecisionTree {
  private root: TreeNode = { kind: 'leaf', attackProb: 0 };
  private options: DecisionTreeOptions;

  constructor(options: DecisionTreeOptions) {
    this.options = options;
  }

  fit(features: number[][], labels: number[], attackTypes?: string[]): void {
    this.root = this.build(features, labels, attackTypes ?? [], 0);
  }

  predictProb(point: number[]): { attackProb: number; attackType?: string } {
    let node: TreeNode = this.root;
    while (node.kind === 'split') {
      node = point[node.feature] < node.threshold ? node.left : node.right;
    }
    return { attackProb: node.attackProb, attackType: node.attackType };
  }

  private build(
    features: number[][],
    labels: number[],
    attackTypes: string[],
    depth: number
  ): TreeNode {
    const n = features.length;
    if (n === 0) {
      return { kind: 'leaf', attackProb: 0 };
    }

    const attackCount = labels.reduce((acc, l) => acc + l, 0);
    const attackProb = attackCount / n;
    const attackType = this.majorityAttackType(labels, attackTypes);

    if (
      depth >= this.options.maxDepth ||
      n < this.options.minSamplesSplit ||
      attackCount === 0 ||
      attackCount === n
    ) {
      return { kind: 'leaf', attackProb, attackType };
    }

    const split = this.bestSplit(features, labels);
    if (!split) {
      return { kind: 'leaf', attackProb, attackType };
    }

    const leftIdx: number[] = [];
    const rightIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (features[i][split.feature] < split.threshold) leftIdx.push(i);
      else rightIdx.push(i);
    }

    if (leftIdx.length === 0 || rightIdx.length === 0) {
      return { kind: 'leaf', attackProb, attackType };
    }

    const pick = (idx: number[]) => ({
      f: idx.map(i => features[i]),
      l: idx.map(i => labels[i]),
      a: idx.map(i => attackTypes[i] ?? ''),
    });

    const left = pick(leftIdx);
    const right = pick(rightIdx);

    return {
      kind: 'split',
      feature: split.feature,
      threshold: split.threshold,
      left: this.build(left.f, left.l, left.a, depth + 1),
      right: this.build(right.f, right.l, right.a, depth + 1),
    };
  }

  private bestSplit(
    features: number[][],
    labels: number[]
  ): { feature: number; threshold: number } | null {
    const numFeatures = features[0].length;
    const featureIdx = this.sampleFeatures(numFeatures, this.options.featuresPerSplit);

    let bestGini = Infinity;
    let best: { feature: number; threshold: number } | null = null;

    for (const f of featureIdx) {
      const values = features.map(row => row[f]);
      const sorted = [...new Set(values)].sort((a, b) => a - b);
      // Try a handful of candidate thresholds; full grid search is wasteful
      // on continuous features.
      const candidates = sorted.length > 8
        ? Array.from({ length: 8 }, (_, i) => sorted[Math.floor((i + 1) * sorted.length / 9)])
        : sorted;

      for (const t of candidates) {
        const gini = this.weightedGini(features, labels, f, t);
        if (gini < bestGini) {
          bestGini = gini;
          best = { feature: f, threshold: t };
        }
      }
    }

    return best;
  }

  private sampleFeatures(total: number, count: number): number[] {
    const idx = Array.from({ length: total }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.max(1, Math.min(count, total)));
  }

  private weightedGini(
    features: number[][],
    labels: number[],
    feature: number,
    threshold: number
  ): number {
    let leftAttack = 0,
      leftN = 0,
      rightAttack = 0,
      rightN = 0;
    for (let i = 0; i < features.length; i++) {
      if (features[i][feature] < threshold) {
        leftN++;
        if (labels[i]) leftAttack++;
      } else {
        rightN++;
        if (labels[i]) rightAttack++;
      }
    }
    const gini = (a: number, n: number) => {
      if (n === 0) return 0;
      const p = a / n;
      return 1 - p * p - (1 - p) * (1 - p);
    };
    const total = leftN + rightN;
    return (leftN / total) * gini(leftAttack, leftN) + (rightN / total) * gini(rightAttack, rightN);
  }

  private majorityAttackType(labels: number[], attackTypes: string[]): string | undefined {
    const counts: Record<string, number> = {};
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] && attackTypes[i]) {
        counts[attackTypes[i]] = (counts[attackTypes[i]] ?? 0) + 1;
      }
    }
    let best: string | undefined;
    let bestN = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    return best;
  }
}

export class RandomForest {
  private trees: DecisionTree[] = [];
  private trained = false;

  constructor(
    private numTrees: number = 30,
    private maxDepth: number = 8,
    private minSamplesSplit: number = 4,
    private featureFraction: number = 0.7
  ) {}

  fit(features: number[][], labels: boolean[], attackTypes?: string[]): void {
    if (features.length === 0) {
      this.trained = false;
      return;
    }

    const numFeatures = features[0].length;
    const featuresPerSplit = Math.max(1, Math.round(numFeatures * this.featureFraction));

    const intLabels = labels.map(l => (l ? 1 : 0));
    const types = attackTypes ?? labels.map(() => '');

    this.trees = [];
    for (let t = 0; t < this.numTrees; t++) {
      const idx: number[] = [];
      for (let i = 0; i < features.length; i++) {
        idx.push(Math.floor(Math.random() * features.length));
      }
      const sampleX = idx.map(i => features[i]);
      const sampleY = idx.map(i => intLabels[i]);
      const sampleA = idx.map(i => types[i]);

      const tree = new DecisionTree({
        maxDepth: this.maxDepth,
        minSamplesSplit: this.minSamplesSplit,
        featuresPerSplit,
      });
      tree.fit(sampleX, sampleY, sampleA);
      this.trees.push(tree);
    }
    this.trained = true;
  }

  /** Returns the probability the point is an attack, in [0,1]. */
  predict(point: number[]): { attackProb: number; attackType?: string } {
    if (!this.trained || this.trees.length === 0) {
      return { attackProb: 0.5 };
    }

    let totalProb = 0;
    const typeVotes: Record<string, number> = {};

    for (const tree of this.trees) {
      const out = tree.predictProb(point);
      totalProb += out.attackProb;
      if (out.attackType) {
        typeVotes[out.attackType] = (typeVotes[out.attackType] ?? 0) + 1;
      }
    }

    let bestType: string | undefined;
    let bestVotes = 0;
    for (const [t, v] of Object.entries(typeVotes)) {
      if (v > bestVotes) {
        bestType = t;
        bestVotes = v;
      }
    }

    return {
      attackProb: totalProb / this.trees.length,
      attackType: bestType,
    };
  }

  isTrained(): boolean {
    return this.trained;
  }
}
