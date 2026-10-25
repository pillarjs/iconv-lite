"use strict"

// Shared workloads and timing loop for Node and browser comparisons.
const samples = {
  gbk: "这是中文字符测试。。！@￥%12",
  gb18030: "这是中文字符测试😱𠕇abc12",
  big5: "中文測試Ê\u0304𠕇abc12",
  shiftjis: "日本語の文字列テストabc12",
  eucjp: "日本語の文字列テスト˘abc12",
  cp949: "한국어문자열테스트abc12",
  ascii: "This is a test string 32 chars.."
}

let sink = 0

function measure (fn, milliseconds) {
  let count = 0
  const start = performance.now()
  let elapsed
  do {
    for (let i = 0; i < 64; i++) {
      const value = fn()
      const index = count++ % (value.length || 1)
      // Consume varying output positions, not just the allocated result's length.
      sink ^= typeof value === "string" ? value.charCodeAt(index) : value[index]
    }
    elapsed = performance.now() - start
  } while (elapsed < milliseconds)
  return count * 1000 / elapsed
}

function median (values) {
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function workloads (iconv) {
  const cases = []
  for (const [label, sample] of Object.entries(samples)) {
    const encoding = label === "ascii" ? "gbk" : label
    for (const [size, repeat] of [["small", 1], ["large", 100]]) {
      const text = sample.repeat(repeat)
      const bytes = Uint8Array.from(iconv.encode(text, encoding))
      cases.push({ name: `${label}/${size}/encode`, run: () => iconv.encode(text, encoding) })
      cases.push({ name: `${label}/${size}/decode`, run: () => iconv.decode(bytes, encoding) })
    }
  }
  for (const encoding of ["big5", "gb18030"]) {
    const bytes = Uint8Array.from(iconv.encode(samples[encoding], encoding))
    cases.push({
      name: `${encoding}/byte-chunks/decode`,
      run () {
        const decoder = iconv.getDecoder(encoding)
        let text = ""
        for (let i = 0; i < bytes.length; i++) text += decoder.write(bytes.subarray(i, i + 1))
        return text + decoder.end()
      }
    })
  }
  return cases
}

async function compare (before, after, { rounds = 7, milliseconds = 100, report } = {}) {
  if (!Number.isInteger(rounds) || rounds < 1 || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error("rounds must be a positive integer and milliseconds must be positive")
  }
  const oldCases = workloads(before)
  const newCases = workloads(after)
  const results = []
  for (let i = 0; i < oldCases.length; i++) {
    const a = oldCases[i]
    const b = newCases[i]
    const expected = a.run()
    const actual = b.run()
    if (typeof expected === "string"
      ? expected !== actual
      : expected.length !== actual.length || expected.some((byte, index) => byte !== actual[index])) {
      throw new Error(`Different output in ${a.name}`)
    }
    measure(a.run, 100)
    measure(b.run, 100)
    const oldRates = []
    const newRates = []
    for (let round = 0; round < rounds; round++) {
      // Alternate the order to reduce bias from warmup and background activity.
      if (round % 2) {
        newRates.push(measure(b.run, milliseconds))
        oldRates.push(measure(a.run, milliseconds))
      } else {
        oldRates.push(measure(a.run, milliseconds))
        newRates.push(measure(b.run, milliseconds))
      }
    }
    const oldRate = median(oldRates)
    const newRate = median(newRates)
    const row = {
      name: a.name,
      before: Math.round(oldRate),
      after: Math.round(newRate),
      change: Number(((newRate / oldRate - 1) * 100).toFixed(1)),
      beforeSamples: oldRates,
      afterSamples: newRates
    }
    results.push(row)
    if (report) report(row)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return results
}

module.exports = { compare, get checksum () { return sink } }
