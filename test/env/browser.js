// The browser assertion package uses process when formatting errors.
import process from "process/browser"

globalThis.process = process
