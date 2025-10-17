export interface QuaggaCodeResult {
  code?: string;
}

export interface QuaggaDetectedData {
  codeResult?: QuaggaCodeResult;
}

export interface QuaggaModule {
  init(config: unknown, callback: (err?: Error) => void): void;
  start(): void;
  stop(): void;
  onDetected(callback: (data: QuaggaDetectedData) => void): void;
  offDetected(callback: (data: QuaggaDetectedData) => void): void;
  onProcessed(callback: () => void): void;
  offProcessed(callback: () => void): void;
}
