

class RE2 {
  constructor(expr) {
    let re2 = RE2.compile(expr);
    // Copy everything.
    this.expr = re2.expr;
    this.prog = re2.prog;
    this.cond = re2.cond;
    this.numSubexp = re2.numSubexp;
    this.longest = re2.longest;
    this.prefix = re2.prefix;
    this.prefixUTF8 = re2.prefixUTF8;
    this.prefixComplete = re2.prefixComplete;
    this.prefixRune = re2.prefixRune;
    this.pooled = new Machine(); // Assuming Machine is also a class in your JavaScript context.
    this.namedGroups = new Map();
  }

  _copyFrom(re2) {
    // Copy everything.
    this.expr = re2.expr;
    this.prog = re2.prog;
    this.cond = re2.cond;
    this.numSubexp = re2.numSubexp;
    this.longest = re2.longest;
    this.prefix = re2.prefix;
    this.prefixUTF8 = re2.prefixUTF8;
    this.prefixComplete = re2.prefixComplete;
    this.prefixRune = re2.prefixRune;
  }
}

export { RE2 }
