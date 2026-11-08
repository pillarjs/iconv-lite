// TypeScript 5.9 predates these APIs. Runtime checks retain the fallbacks for Node 22.
export interface NativeUint8Array extends Uint8Array {
  toHex(): string
  toBase64(options?: { alphabet?: "base64" | "base64url", omitPadding?: boolean }): string
}

export interface NativeUint8ArrayConstructor extends Uint8ArrayConstructor {
  fromHex(text: string): Uint8Array<ArrayBuffer>
  fromBase64(text: string, options?: {
    alphabet?: "base64" | "base64url"
    lastChunkHandling?: "loose" | "strict" | "stop-before-partial"
  }): Uint8Array<ArrayBuffer>
}
