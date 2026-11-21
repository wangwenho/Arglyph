// VS Code provides acquireVsCodeApi() as a global inside a webview.
// It may only be called once per page.
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
