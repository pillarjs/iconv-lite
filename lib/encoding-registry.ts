import type { AddEncodingOptions, EncodingDefinition, EncodingDefinitions } from "./types.js"
import { canonicalizeEncoding } from "./utils.js"

// Validate a complete registration before publishing it to an Iconv instance.
export default class EncodingRegistry {
  static extend<Bytes extends Uint8Array> (registry: EncodingDefinitions<Bytes>, definitions: EncodingDefinitions<Bytes>, options: AddEncodingOptions = {}) {
    if (!definitions || typeof definitions !== "object" || Array.isArray(definitions)) {
      throw new TypeError("Encoding definitions must be an object")
    }
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        (options.replace !== undefined && typeof options.replace !== "boolean")) {
      throw new TypeError("Encoding registration options must contain a boolean replace option")
    }

    const additions: EncodingDefinitions<Bytes> = Object.create(null)
    for (const [label, definition] of Object.entries(definitions)) {
      const name = this.#key(label, registry)
      if (Object.hasOwn(additions, name) && !this.#same(additions[name], definition)) {
        throw new Error("Duplicate encoding label: " + label)
      }
      additions[name] = definition
    }

    const next = Object.assign(Object.create(null) as EncodingDefinitions<Bytes>, registry, additions)
    let changed = false
    for (const name of Object.keys(additions)) {
      const definition = this.#definition(additions[name], next)
      if (Object.hasOwn(registry, name) && this.#same(registry[name], definition)) {
        next[name] = registry[name]
        continue
      }
      if (Object.hasOwn(registry, name) && !options.replace) {
        throw new Error("Encoding already registered: " + name)
      }
      next[name] = definition
      changed = true
    }

    for (const name of Object.keys(additions)) this.#validateAlias(name, next)
    return changed ? next : registry
  }

  static #key (label: string, registry: object) {
    if (typeof label !== "string") throw new TypeError("Encoding labels must be strings")
    // Internal codec keys (such as _sbcs) are referenced verbatim by definitions.
    if (Object.hasOwn(registry, label)) return label
    const name = canonicalizeEncoding(label)
    if (!/^[a-z0-9]+$/.test(name)) throw new TypeError("Invalid encoding label: " + label)
    return name
  }

  static #definition<Bytes extends Uint8Array> (definition: EncodingDefinition<Bytes>, registry: EncodingDefinitions<Bytes>): EncodingDefinition<Bytes> {
    if (typeof definition === "string") return this.#key(definition, registry)
    if (typeof definition === "function") {
      // Check constructibility without running a codec or allocating its tables.
      try { Reflect.construct(Object, [], definition) } catch {
        throw new TypeError("Encoding codecs must be constructors")
      }
      return definition
    }
    if (definition && typeof definition === "object" && !Array.isArray(definition) &&
        Object.hasOwn(definition, "type") && typeof definition.type === "string") {
      return { ...definition, type: this.#key(definition.type, registry) }
    }
    throw new TypeError("An encoding definition must be a codec constructor, alias, or object with a type")
  }

  static #same (left: unknown, right: unknown) {
    if (left === right) return true
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length &&
      keys.every(key => Object.hasOwn(right, key) && Object.is(Reflect.get(left, key), Reflect.get(right, key)))
  }

  static #validateAlias<Bytes extends Uint8Array> (name: string, registry: EncodingDefinitions<Bytes>) {
    const seen = new Set()
    while (true) {
      if (seen.has(name)) throw new Error("Encoding alias cycle: " + name)
      seen.add(name)
      const definition = registry[name]
      if (typeof definition === "function") return
      if (typeof definition === "string") name = definition
      else if (definition && typeof definition.type === "string") name = definition.type
      else throw new Error("Encoding alias target not found: " + name)
    }
  }
}
