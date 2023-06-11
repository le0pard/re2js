// https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
const highSurrogate = (codePoint) => Math.floor((codePoint - 0x10000) / 0x400) + 0xD800

const lowSurrogate = (codePoint) => ((codePoint - 0x10000) % 0x400) + 0xDC00
