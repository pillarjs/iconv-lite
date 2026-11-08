// wpt-runner has no published declarations. Describe the API used by our runners.
declare module "wpt-runner" {
  interface Reporter {
    startSuite(testPath: string): void
    pass(name: string): void
    fail(name: string): void
    reportStack(stack: string): void
  }

  interface Options {
    rootURL?: string
    setup?: (window: Window & typeof globalThis) => void
    filter?: (testPath: string, url: string) => boolean | Promise<boolean>
    reporter?: Reporter
  }

  export default function run (testsPath: string, options?: Options): Promise<number>
}
