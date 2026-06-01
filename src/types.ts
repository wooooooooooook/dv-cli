export interface TaskContext {
  maxIterations?: number;
}

export interface PlaywrightRunArgs extends TaskContext {
  page: any;
  context?: any;
}

export interface TaskResult {
  success: boolean;
  message?: string;
  imagePath?: string;
  options?: any;
}