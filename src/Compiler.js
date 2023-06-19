import { Prog } from './Prog'
import { Inst } from './Inst'

class Frag {
  constructor(i = 0, out = 0, nullable = false) {
    this.i = i
    this.out = out
    this.nullable = nullable
  }
}

class Compiler {
  constructor() {
    this.prog = new Prog() // Program being built
    this.newInst(Inst.FAIL) // always the first instruction
  }

  static compileRegexp(re) {
    let c = new Compiler()
    let f = c.compile(re)
    c.prog.patch(f.out, c.newInst(Inst.MATCH).i)
    c.prog.start = f.i
    return c.prog
  }

  newInst(op) {
    // TODO: impose length limit.
    this.prog.addInst(op)
    return new Frag(this.prog.numInst() - 1, 0, true)
  }

  // Returns a no-op fragment.  Sometimes unavoidable.
  nop() {
    let f = this.newInst(Inst.NOP)
    f.out = f.i << 1
    return f
  }

  fail() {
    return new Frag()
  }

  cap(arg) {
    let f = this.newInst(Inst.CAPTURE)
    f.out = f.i << 1
    this.prog.getInst(f.i).arg = arg
    if (this.prog.numCap < arg + 1) {
      this.prog.numCap = arg + 1
    }
    return f
  }

  cat(f1, f2) {
    // concat of failure is failure
    if (f1.i === 0 || f2.i === 0) {
      return this.fail()
    }
    // TODO: elide nop
    this.prog.patch(f1.out, f2.i)
    return new Frag(f1.i, f2.out, f1.nullable && f2.nullable)
  }

  alt(f1, f2) {
    // alt of failure is other
    if (f1.i === 0) {
      return f2
    }
    if (f2.i === 0) {
      return f1
    }
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    i.out = f1.i
    i.arg = f2.i
    f.out = this.prog.append(f1.out, f2.out)
    f.nullable = f1.nullable || f2.nullable
    return f
  }

  loop(f1, nongreedy) {
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = f.i << 1 | 1
    }
    this.prog.patch(f1.out, f.i)
    return f
  }

  quest(f1, nongreedy) {
    let f = this.newInst(Inst.ALT)
    let i = this.prog.getInst(f.i)
    if (nongreedy) {
      i.arg = f1.i
      f.out = f.i << 1
    } else {
      i.out = f1.i
      f.out = f.i << 1 | 1
    }
    this.prog.patch(f1.out, f.i)
    f.nullable = true
    return f
  }

  star(f1, nongreedy) {
    let f = this.loop(f1, nongreedy)
    f.nullable = true
    return f
  }

  plus(f1, nongreedy) {
    return this.cat(f1, this.loop(f1, nongreedy))
  }

  empty(op) {
    let f = this.newInst(op)
    f.out = f.i << 1
    return f
  }

  rune(rune, flags) {
    let f = this.newInst(Inst.RUNE)
    let i = this.prog.getInst(f.i)
    i.runes = rune
    i.flags = flags
    f.out = f.i << 1
    f.nullable = false
    return f
  }

  compile(re) {
    //... more advanced implementation required based on 're' structure ...
    // This requires knowledge about how 're' is structured, and then translating
    // corresponding Regexp structure to equivalent JavaScript representation.
  }
}

export { Compiler }
