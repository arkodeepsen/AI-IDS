/**
 * Autoencoder Implementation
 * Anomaly detection using reconstruction error
 */

export class Autoencoder {
    private encoderWeights: number[][] = [];
    private decoderWeights: number[][] = [];
    private encoderBias: number[] = [];
    private decoderBias: number[] = [];
    private inputSize: number;
    private hiddenSize: number;
    private threshold: number = 0.1;
    private trained: boolean = false;

    constructor(inputSize: number = 7, hiddenSize: number = 3) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.initializeWeights();
    }

    private initializeWeights(): void {
        // Xavier initialization
        const scale1 = Math.sqrt(2 / (this.inputSize + this.hiddenSize));
        const scale2 = Math.sqrt(2 / (this.hiddenSize + this.inputSize));

        this.encoderWeights = Array(this.hiddenSize).fill(0).map(() =>
            Array(this.inputSize).fill(0).map(() => (Math.random() - 0.5) * scale1)
        );
        this.decoderWeights = Array(this.inputSize).fill(0).map(() =>
            Array(this.hiddenSize).fill(0).map(() => (Math.random() - 0.5) * scale2)
        );
        this.encoderBias = Array(this.hiddenSize).fill(0);
        this.decoderBias = Array(this.inputSize).fill(0);
    }

    private relu(x: number): number {
        return Math.max(0, x);
    }

    private sigmoid(x: number): number {
        return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
    }

    encode(input: number[]): number[] {
        return this.encoderWeights.map((weights, i) =>
            this.relu(weights.reduce((sum, w, j) => sum + w * input[j], 0) + this.encoderBias[i])
        );
    }

    decode(hidden: number[]): number[] {
        return this.decoderWeights.map((weights, i) =>
            this.sigmoid(weights.reduce((sum, w, j) => sum + w * hidden[j], 0) + this.decoderBias[i])
        );
    }

    reconstruct(input: number[]): number[] {
        return this.decode(this.encode(input));
    }

    fit(data: number[][], epochs: number = 100, learningRate: number = 0.01): void {
        for (let epoch = 0; epoch < epochs; epoch++) {
            for (const sample of data) {
                // Forward pass
                const hidden = this.encode(sample);
                const output = this.decode(hidden);

                // Calculate gradients and update (simplified backprop)
                const outputError = sample.map((x, i) => output[i] - x);

                // Update decoder
                for (let i = 0; i < this.inputSize; i++) {
                    for (let j = 0; j < this.hiddenSize; j++) {
                        this.decoderWeights[i][j] -= learningRate * outputError[i] * hidden[j];
                    }
                    this.decoderBias[i] -= learningRate * outputError[i];
                }
            }
        }

        // Set threshold based on training data reconstruction errors
        const errors = data.map(sample => this.reconstructionError(sample));
        this.threshold = this.percentile(errors, 95);
        this.trained = true;
    }

    reconstructionError(input: number[]): number {
        const output = this.reconstruct(input);
        return Math.sqrt(input.reduce((sum, x, i) => sum + Math.pow(x - output[i], 2), 0) / input.length);
    }

    predict(input: number[]): number {
        const error = this.reconstructionError(input);
        return error / (this.threshold || 0.1);
    }

    private percentile(arr: number[], p: number): number {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    isTrained(): boolean {
        return this.trained;
    }

    getThreshold(): number {
        return this.threshold;
    }
}
