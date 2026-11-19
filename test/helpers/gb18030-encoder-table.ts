// The Encoding Standard preserves these GB18030-2005 encodings even though
// the GB18030-2022 index assigns their bytes to different code points.
// https://encoding.spec.whatwg.org/#gb18030-encoder
const encoderTable = [
  ["\uE78D", "a6 d9"],
  ["\uE78E", "a6 da"],
  ["\uE78F", "a6 db"],
  ["\uE790", "a6 dc"],
  ["\uE791", "a6 dd"],
  ["\uE792", "a6 de"],
  ["\uE793", "a6 df"],
  ["\uE794", "a6 ec"],
  ["\uE795", "a6 ed"],
  ["\uE796", "a6 f3"],
  ["\uE81E", "fe 59"],
  ["\uE826", "fe 61"],
  ["\uE82B", "fe 66"],
  ["\uE82C", "fe 67"],
  ["\uE832", "fe 6d"],
  ["\uE843", "fe 7e"],
  ["\uE854", "fe 90"],
  ["\uE864", "fe a0"]
]

export default encoderTable
