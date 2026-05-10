/**
 * Isolation Forest — anomaly detection via random partitioning across N trees.
 *
 * Anomalies isolate in shallower paths than normal points, so a short
 * average path length yields a high anomaly score. Trained unsupervised on
 * normal samples; works without labels.
 */

interface SerialisedNode {
  size: number;
  splitAttribute?: number;
  splitValue?: number;
  left?: SerialisedNode;
  right?: SerialisedNode;
}

export interface SerialisedIsolationForest {
  numTrees: number;
  sampleSize: number;
  trees: SerialisedNode[];
}

export class IsolationTree {
  private splitAttribute?: number;
  private splitValue?: number;
  private left?: IsolationTree;
  private right?: IsolationTree;
  private size: number;

  constructor(data: number[][], depth: number, maxDepth: number) {
    this.size = data.length;

    if (depth >= maxDepth || data.length <= 1) {
      return;
    }

    const numFeatures = data[0]?.length ?? 0;
    this.splitAttribute = Math.floor(Math.random() * numFeatures);

    const values = data.map(point => point[this.splitAttribute!]);
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === max) return;

    this.splitValue = min + Math.random() * (max - min);

    const leftData: number[][] = [];
    const rightData: number[][] = [];
    for (const point of data) {
      if (point[this.splitAttribute!] < this.splitValue!) leftData.push(point);
      else rightData.push(point);
    }

    if (leftData.length > 0) {
      this.left = new IsolationTree(leftData, depth + 1, maxDepth);
    }
    if (rightData.length > 0) {
      this.right = new IsolationTree(rightData, depth + 1, maxDepth);
    }
  }

  pathLength(point: number[], currentDepth: number): number {
    if (this.splitAttribute === undefined || this.splitValue === undefined) {
      return currentDepth + this.avgPathLength(this.size);
    }

    if (point[this.splitAttribute] < this.splitValue) {
      return this.left ? this.left.pathLength(point, currentDepth + 1) : currentDepth + 1;
    } else {
      return this.right ? this.right.pathLength(point, currentDepth + 1) : currentDepth + 1;
    }
  }

  private avgPathLength(n: number): number {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }

  serialise(): SerialisedNode {
    return {
      size: this.size,
      splitAttribute: this.splitAttribute,
      splitValue: this.splitValue,
      left: this.left?.serialise(),
      right: this.right?.serialise(),
    };
  }

  static deserialise(node: SerialisedNode): IsolationTree {
    const tree = Object.create(IsolationTree.prototype) as IsolationTree;
    Object.assign(tree, {
      size: node.size,
      splitAttribute: node.splitAttribute,
      splitValue: node.splitValue,
      left: node.left ? IsolationTree.deserialise(node.left) : undefined,
      right: node.right ? IsolationTree.deserialise(node.right) : undefined,
    });
    return tree;
  }
}

export class IsolationForest {
  private numTrees: number;
  private sampleSize: number;
  private trees: IsolationTree[] = [];
  private trained = false;

  constructor(numTrees = 100, sampleSize = 256) {
    this.numTrees = numTrees;
    this.sampleSize = sampleSize;
  }

  fit(data: number[][]): void {
    if (data.length === 0) {
      this.trained = false;
      return;
    }
    this.trees = [];
    const maxDepth = Math.ceil(Math.log2(this.sampleSize));

    for (let i = 0; i < this.numTrees; i++) {
      const sample = this.subsample(data, this.sampleSize);
      this.trees.push(new IsolationTree(sample, 0, maxDepth));
    }
    this.trained = true;
  }

  private subsample(data: number[][], size: number): number[][] {
    const result: number[][] = [];
    const n = Math.min(size, data.length);
    const indices = new Set<number>();
    while (indices.size < n) {
      indices.add(Math.floor(Math.random() * data.length));
    }
    for (const i of indices) result.push(data[i]);
    return result;
  }

  predict(point: number[]): number {
    if (!this.trained || this.trees.length === 0) return 0.5;

    let total = 0;
    for (const tree of this.trees) total += tree.pathLength(point, 0);
    const avgPath = total / this.trees.length;

    const c = this.avgPathLength(this.sampleSize);
    return Math.pow(2, -avgPath / c);
  }

  private avgPathLength(n: number): number {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
  }

  isTrained(): boolean {
    return this.trained;
  }

  serialise(): SerialisedIsolationForest {
    return {
      numTrees: this.numTrees,
      sampleSize: this.sampleSize,
      trees: this.trees.map(t => t.serialise()),
    };
  }

  static deserialise(data: SerialisedIsolationForest): IsolationForest {
    const f = new IsolationForest(data.numTrees, data.sampleSize);
    f.trees = data.trees.map(t => IsolationTree.deserialise(t));
    f.trained = true;
    return f;
  }
}
