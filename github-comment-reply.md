This looks like a simple fix, but I don't think this is the right approach.

Masking `defaultCharSingleByte` with `& 0xFF` would preserve the existing behavior, but it would also silently accept values that are not valid single-byte characters. It would make different Unicode characters produce the same byte. For example, both `"ý"` and `"�"` can end up represented by byte `253`, which makes the configured fallback ambiguous.

This issue was mostly hidden before `invalidCharHandler` because the encoder only emitted the fallback byte. The new handler needs to be able to distinguish an unmappable character from a valid character that happens to map to the fallback byte, so silently truncating the configured value is especially problematic here.

I think the better fix is to reject invalid SBCS configuration instead of normalizing it. `defaultCharSingleByte` must now be exactly one character whose code unit is in the `0x00`–`0xFF` range. Values such as `"?"` and `"é"` remain valid, while values such as `"�"` and `"😀"` fail with a clear `TypeError`.

This intentionally changes the old behavior, but the old behavior was based on an implicit byte truncation and could produce ambiguous results. I also added a regression test covering the invalid configuration.

The fix and regression test have now been implemented in commit `2d7871eefa780dbc34a88443e9a714dc9657c601`.
