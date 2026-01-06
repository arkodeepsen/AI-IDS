/**
 * Isolation Forest Algorithm
 * Anomaly detection using random partitioning
 */

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

    const numFeatures = data[0]?.length || 0;
    this.splitAttribute = Math.floor(Math.random() * numFeatures);
    
    const values = data.map(point => point[this.splitAttribute!]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    if (min === max) return;
    
    this.splitValue = min + Math.random() * (max - min);
    
    const leftData = data.filter(point => point[this.splitAttribute!] < this.splitValue!);
    const rightData = data.filter(point => point[this.splitAttribute!] >= this.splitValue!);
    
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
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }
}

export class IsolationForest {
  private numTrees: number;
  private sampleSize: number;
  private trees: IsolationTree[] = [];
  private trained: boolean = false;

  constructor(numTrees: number = 100, sampleSize: number = 256) {
    this.numTrees = numTrees;
    this.sampleSize = sampleSize;
  }

  fit(data: number[][]): void {
    this.trees = [];
    const maxDepth = Math.ceil(Math.log2(this.sampleSize));
    
    for (let i = 0; i < this.numTrees; i++) {
      const sample = this.subsample(data, this.sampleSize);
      this.trees.push(new IsolationTree(sample, 0, maxDepth));
    }
    this.trained = true;
  }

  private subsample(data: number[][], size: number): number[][] {
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(size, data.length));
  }

  predict(point: number[]): number {
    if (!this.trained) return 0.5;
    
    const avgPathLength = this.trees.reduce((sum, tree) => 
      sum + tree.pathLength(point, 0), 0) / this.numTrees;
    
    const c = this.avgPathLength(this.sampleSize);
    return Math.pow(2, -avgPathLength / c);
  }

  private avgPathLength(n: number): number {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  isTrained(): boolean {
    return this.trained;
  }
}
