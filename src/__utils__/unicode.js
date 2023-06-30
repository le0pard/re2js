import { Utils } from '../Utils'

export const utf16IndicesToUtf8 = (idx16, text) => {
  let idx8 = new Array(idx16.length)
  for (let i = 0; i < idx16.length; ++i) {
    if (idx16[i] === -1) {
      idx8[i] = -1
    } else {
      let subText = text.substring(0, idx16[i])
      idx8[i] = Utils.stringToUtf8ByteArray(subText).length
    }
  }
  return idx8
}
