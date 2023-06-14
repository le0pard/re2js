import { Utils } from './Utils'

class CharClass {

  constructor(r = Utils.EMPTY_INTS) {
    this.r = r
    this.len = r.length
  }
}

export { CharClass }
