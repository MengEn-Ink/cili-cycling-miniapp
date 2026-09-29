interface WxCloudApi {
  init(options: { env: string; traceUser?: boolean }): void;
  callFunction(options: { name: string; data?: unknown }): Promise<{ result?: unknown }>;
  uploadFile(options: { cloudPath: string; filePath: string }): Promise<{ fileID: string }>;
}

interface WxApi {
  cloud?: WxCloudApi;
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
