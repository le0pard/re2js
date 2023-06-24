/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
import { CharacterHelper } from './CharacterHelper'
import { Utils } from './Utils'
/**
 * MachineInput abstracts different representations of the input text supplied to the Machine. It
 * provides one-character lookahead.
 * @class
 */
export class MachineInput {
  static EOF_$LI$() {
    if (MachineInput.EOF == null) {
      MachineInput.EOF = -1 << 3
    }
    return MachineInput.EOF
  }
  static fromUTF8$byte_A(b) {
    return new MachineInput.UTF8Input(b)
  }
  static fromUTF8$byte_A$int$int(b, start, end) {
    return new MachineInput.UTF8Input(b, start, end)
  }
  static fromUTF8(b, start, end) {
    if (
      ((b != null &&
        b instanceof Array &&
        (b.length == 0 || b[0] == null || typeof b[0] === 'number')) ||
        b === null) &&
      (typeof start === 'number' || start === null) &&
      (typeof end === 'number' || end === null)
    ) {
      return MachineInput.fromUTF8$byte_A$int$int(b, start, end)
    } else if (
      ((b != null &&
        b instanceof Array &&
        (b.length == 0 || b[0] == null || typeof b[0] === 'number')) ||
        b === null) &&
      start === undefined &&
      end === undefined
    ) {
      return MachineInput.fromUTF8$byte_A(b)
    } else {
      throw new Error('invalid overload')
    }
  }
  static fromUTF16$java_lang_CharSequence(s) {
    return new MachineInput.UTF16Input(s, 0, s.length)
  }
  static fromUTF16$java_lang_CharSequence$int$int(s, start, end) {
    return new MachineInput.UTF16Input(s, start, end)
  }
  static fromUTF16(s, start, end) {
    if (
      ((s != null &&
        ((s.constructor != null &&
          s.constructor['__interfaces'] != null &&
          s.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0) ||
          typeof s === 'string')) ||
        s === null) &&
      (typeof start === 'number' || start === null) &&
      (typeof end === 'number' || end === null)
    ) {
      return MachineInput.fromUTF16$java_lang_CharSequence$int$int(s, start, end)
    } else if (
      ((s != null &&
        ((s.constructor != null &&
          s.constructor['__interfaces'] != null &&
          s.constructor['__interfaces'].indexOf('java.lang.CharSequence') >= 0) ||
          typeof s === 'string')) ||
        s === null) &&
      start === undefined &&
      end === undefined
    ) {
      return MachineInput.fromUTF16$java_lang_CharSequence(s)
    } else {
      throw new Error('invalid overload')
    }
  }
}
MachineInput['__class'] = 'quickstart.MachineInput'
;(function (MachineInput) {
  class UTF8Input extends MachineInput {
    constructor(b, start, end) {
      if (
        ((b != null &&
          b instanceof Array &&
          (b.length == 0 || b[0] == null || typeof b[0] === 'number')) ||
          b === null) &&
        (typeof start === 'number' || start === null) &&
        (typeof end === 'number' || end === null)
      ) {
        let __args = arguments
        super()
        if (this.b === undefined) {
          this.b = null
        }
        if (this.start === undefined) {
          this.start = 0
        }
        if (this.end === undefined) {
          this.end = 0
        }
        if (end > b.length) {
          throw Object.defineProperty(
            new Error('end is greater than length: ' + end + ' > ' + b.length),
            '__classes',
            {
              configurable: true,
              value: [
                'java.lang.Throwable',
                'java.lang.IndexOutOfBoundsException',
                'java.lang.Object',
                'java.lang.ArrayIndexOutOfBoundsException',
                'java.lang.RuntimeException',
                'java.lang.Exception'
              ]
            }
          )
        }
        this.b = b
        this.start = start
        this.end = end
      } else if (
        ((b != null &&
          b instanceof Array &&
          (b.length == 0 || b[0] == null || typeof b[0] === 'number')) ||
          b === null) &&
        start === undefined &&
        end === undefined
      ) {
        let __args = arguments
        super()
        if (this.b === undefined) {
          this.b = null
        }
        if (this.start === undefined) {
          this.start = 0
        }
        if (this.end === undefined) {
          this.end = 0
        }
        this.b = b
        this.start = 0
        this.end = b.length
      } else {
        throw new Error('invalid overload')
      }
    }
    /**
     *
     * @param {number} i
     * @return {number}
     */
    step(i) {
      i += this.start
      if (i >= this.end) {
        return MachineInput.EOF_$LI$()
      }
      let x = this.b[i++] & 255
      if ((x & 128) === 0) {
        return (x << 3) | 1
      } else if ((x & 224) === 192) {
        x = x & 31
        if (i >= this.end) {
          return MachineInput.EOF_$LI$()
        }
        x = (x << 6) | (this.b[i++] & 63)
        return (x << 3) | 2
      } else if ((x & 240) === 224) {
        x = x & 15
        if (i + 1 >= this.end) {
          return MachineInput.EOF_$LI$()
        }
        x = (x << 6) | (this.b[i++] & 63)
        x = (x << 6) | (this.b[i++] & 63)
        return (x << 3) | 3
      } else {
        x = x & 7
        if (i + 2 >= this.end) {
          return MachineInput.EOF_$LI$()
        }
        x = (x << 6) | (this.b[i++] & 63)
        x = (x << 6) | (this.b[i++] & 63)
        x = (x << 6) | (this.b[i++] & 63)
        return (x << 3) | 4
      }
    }
    /**
     *
     * @return {boolean}
     */
    canCheckPrefix() {
      return true
    }
    /**
     *
     * @param {RE2} re2
     * @param {number} pos
     * @return {number}
     */
    index(re2, pos) {
      pos += this.start
      const i = Utils.indexOf(this.b, re2.prefixUTF8, pos)
      return i < 0 ? i : i - pos
    }
    /**
     *
     * @param {number} pos
     * @return {number}
     */
    context(pos) {
      pos += this.start
      let r1 = -1
      if (pos > this.start && pos <= this.end) {
        let start = pos - 1
        r1 = this.b[start--]
        if (r1 >= 128) {
          let lim = pos - 4
          if (lim < this.start) {
            lim = this.start
          }
          while (start >= lim && (this.b[start] & 192) === 128) {
            {
              start--
            }
          }

          if (start < this.start) {
            start = this.start
          }
          r1 = this.step(start) >> 3
        }
      }
      const r2 = pos < this.end ? this.step(pos) >> 3 : -1
      return Utils.emptyOpContext(r1, r2)
    }
    /**
     *
     * @return {number}
     */
    endPos() {
      return this.end
    }
  }
  MachineInput.UTF8Input = UTF8Input
  UTF8Input['__class'] = 'quickstart.MachineInput.UTF8Input'
  class UTF16Input extends MachineInput {
    constructor(str, start, end) {
      super()
      if (this.str === undefined) {
        this.str = null
      }
      if (this.start === undefined) {
        this.start = 0
      }
      if (this.end === undefined) {
        this.end = 0
      }
      this.str = str
      this.start = start
      this.end = end
    }
    /**
     *
     * @param {number} pos
     * @return {number}
     */
    step(pos) {
      pos += this.start
      if (pos < this.end) {
        const rune = CharacterHelper.codePointAt(this.str, pos)
        return (rune << 3) | CharacterHelper.charCount(rune)
      } else {
        return MachineInput.EOF_$LI$()
      }
    }
    /**
     *
     * @return {boolean}
     */
    canCheckPrefix() {
      return true
    }
    /**
     *
     * @param {RE2} re2
     * @param {number} pos
     * @return {number}
     */
    index(re2, pos) {
      pos += this.start
      const i = this.indexOf(this.str, re2.prefix, pos)
      return i < 0 ? i : i - pos
    }
    /**
     *
     * @param {number} pos
     * @return {number}
     */
    context(pos) {
      pos += this.start
      const r1 =
        pos > 0 && pos <= this.str.length ? CharacterHelper.codePointBefore(this.str, pos) : -1
      const r2 = pos < this.str.length ? CharacterHelper.codePointAt(this.str, pos) : -1
      return Utils.emptyOpContext(r1, r2)
    }
    /**
     *
     * @return {number}
     */
    endPos() {
      return this.end
    }
    indexOf(hayStack, needle, pos) {
      if (typeof hayStack === 'string') {
        return hayStack.indexOf(needle, pos)
      }
      if (hayStack != null && hayStack instanceof Object) {
        return hayStack.indexOf(needle, pos)
      }
      return this.indexOfFallback(hayStack, needle, pos)
    }
    indexOfFallback(hayStack, needle, fromIndex) {
      if (fromIndex >= hayStack.length) {
        return /* isEmpty */ needle.length === 0 ? 0 : -1
      }
      if (fromIndex < 0) {
        fromIndex = 0
      }
      if (/* isEmpty */ needle.length === 0) {
        return fromIndex
      }
      const first = needle.charAt(0)
      const max = hayStack.length - needle.length
      for (let i = fromIndex; i <= max; i++) {
        {
          if (
            ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(hayStack.charAt(i)) !=
            ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(first)
          ) {
            while (
              ++i <= max &&
              ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(hayStack.charAt(i)) !=
                ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(first)
            ) {
              {
              }
            }
          }
          if (i <= max) {
            let j = i + 1
            const end = j + needle.length - 1
            for (
              let k = 1;
              j < end &&
              ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(hayStack.charAt(j)) ==
                ((c) => (c.charCodeAt == null ? c : c.charCodeAt(0)))(needle.charAt(k));
              j++, k++
            ) {
              {
              }
            }
            if (j === end) {
              return i
            }
          }
        }
      }
      return -1
    }
  }
  MachineInput.UTF16Input = UTF16Input
  UTF16Input['__class'] = 'quickstart.MachineInput.UTF16Input'
})(MachineInput || (MachineInput = {}))

