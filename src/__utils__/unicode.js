import { Utils } from '../Utils.js'
import { Unicode } from '../Unicode.js'
import { UnicodeTables } from '../UnicodeTables.js'

// Go's unicode.IsUpper: whether |r| is an upper case letter (category Lu). Ported tests use it
// to describe the classes they expect.
export const isUpper = (r) => Unicode.is(UnicodeTables.CATEGORIES.get('Lu'), r)

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
