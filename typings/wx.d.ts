interface WxCloudUploadTask extends Promise<{ fileID: string }> {
  abort?(): void;
  onProgressUpdate?(callback: (event: { progress?: number }) => void): void;
  offProgressUpdate?(callback: (event: { progress?: number }) => void): void;
}

interface WxCloudApi {
  init(options: { env: string; traceUser?: boolean }): void;
  callFunction(options: { name: string; data?: unknown }): Promise<{ result?: unknown }>;
  uploadFile(options: {
    cloudPath: string;
    filePath: string;
    success?(result: { fileID: string }): void;
    fail?(error: unknown): void;
  }): WxCloudUploadTask;
  deleteFile(options: {
    fileList: string[];
  }): Promise<{ fileList?: { fileID?: string; status?: number; errMsg?: string }[] }>;
}

interface WxFileSystemManager {
  stat(options: {
    path: string;
    success?(result: { stats?: { size?: number } }): void;
    fail?(error: unknown): void;
  }): void;
  [key: string]: any;
}

interface WxApi {
  cloud?: WxCloudApi;
  getFileInfo(options: {
    filePath: string;
    digestAlgorithm?: string;
  }): Promise<{ size?: number; digest?: string }>;
  getFileSystemManager(): WxFileSystemManager;
  requestSubscribeMessage(options: {
    tmplIds: string[];
    success?(result: Record<string, string>): void;
    fail?(error: unknown): void;
    complete?(): void;
  }): void;
  [key: string]: any;
}

declare const wx: WxApi;
declare function App<T = any>(o: T & ThisType<any>): void;
declare function Page<T = any>(o: T & ThisType<any>): void;
declare function Component<T = any>(o: T & ThisType<any>): void;
