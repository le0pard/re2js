/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
import { RE2Flags } from './RE2Flags'
import { Unicode } from './Unicode'
/**
 * Compiler from {@code Regexp} (RE2 abstract syntax) to {@code RE2} (compiled regular expression).
 *
 * The only entry point is {@link #compileRegexp}.
 * @class
 */
export class Compiler {
    constructor() {
        this.prog = new Prog()
        this.newInst(Inst.FAIL)
    }
    static compileRegexp(re) {
        const c = new Compiler()
        const f = c.compile(re)
        c.prog.patch(f.out, c.newInst(Inst.MATCH).i)
        c.prog.start = f.i
        return c.prog
    }
    newInst(op) {
        this.prog.addInst(op)
        return new Compiler.Frag(this.prog.numInst() - 1, 0, true)
    }
    nop() {
        const f = this.newInst(Inst.NOP)
        f.out = f.i << 1
        return f
    }
    fail() {
        return new Compiler.Frag()
    }
    cap(arg) {
        const f = this.newInst(Inst.CAPTURE)
        f.out = f.i << 1
        this.prog.getInst(f.i).arg = arg
        if (this.prog.numCap < arg + 1) {
            this.prog.numCap = arg + 1
        }
        return f
    }
    cat(f1, f2) {
        if (f1.i === 0 || f2.i === 0) {
            return this.fail()
        }
        this.prog.patch(f1.out, f2.i)
        return new Compiler.Frag(f1.i, f2.out, f1.nullable && f2.nullable)
    }
    alt(f1, f2) {
        if (f1.i === 0) {
            return f2
        }
        if (f2.i === 0) {
            return f1
        }
        const f = this.newInst(Inst.ALT)
        const i = this.prog.getInst(f.i)
        i.out = f1.i
        i.arg = f2.i
        f.out = this.prog.append(f1.out, f2.out)
        f.nullable = f1.nullable || f2.nullable
        return f
    }
    loop(f1, nongreedy) {
        const f = this.newInst(Inst.ALT)
        const i = this.prog.getInst(f.i)
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
        const f = this.newInst(Inst.ALT)
        const i = this.prog.getInst(f.i)
        if (nongreedy) {
            i.arg = f1.i
            f.out = f.i << 1
        } else {
            i.out = f1.i
            f.out = f.i << 1 | 1
        }
        f.out = this.prog.append(f.out, f1.out)
        return f
    }
    star(f1, nongreedy) {
        if (f1.nullable) {
            return this.quest(this.plus(f1, nongreedy), nongreedy)
        }
        return this.loop(f1, nongreedy)
    }
    plus(f1, nongreedy) {
        return new Compiler.Frag(f1.i, this.loop(f1, nongreedy).out, f1.nullable)
    }
    empty(op) {
        const f = this.newInst(Inst.EMPTY_WIDTH)
        this.prog.getInst(f.i).arg = op
        f.out = f.i << 1
        return f
    }
    rune$int$int(rune, flags) {
        return this.rune$int_A$int([rune], flags)
    }
    rune$int_A$int(runes, flags) {
        const f = this.newInst(Inst.RUNE)
        f.nullable = false
        const i = this.prog.getInst(f.i)
        i.runes = runes
        flags &= RE2Flags.FOLD_CASE
        if (runes.length !== 1 || Unicode.simpleFold(runes[0]) === runes[0]) {
            flags &= ~RE2Flags.FOLD_CASE
        }
        i.arg = flags
        f.out = f.i << 1
        if (((flags & RE2Flags.FOLD_CASE) === 0 && runes.length === 1) || (runes.length === 2 && runes[0] === runes[1])) {
            i.op = Inst.RUNE1
        } else if (runes.length === 2 && runes[0] === 0 && runes[1] === Unicode.MAX_RUNE) {
            i.op = Inst.RUNE_ANY
        } else if (runes.length === 4 && runes[0] === 0 && runes[1] === '\n'.charCodeAt(0) - 1 && runes[2] === '\n'.charCodeAt(0) + 1 && runes[3] === Unicode.MAX_RUNE) {
            i.op = Inst.RUNE_ANY_NOT_NL
        }
        return f
    }
    rune(runes, flags) {
        if (((runes != null && runes instanceof Array && (runes.length == 0 || runes[0] == null || (typeof runes[0] === 'number'))) || runes === null) && ((typeof flags === 'number') || flags === null)) {
            return this.rune$int_A$int(runes, flags)
        } else if (((typeof runes === 'number') || runes === null) && ((typeof flags === 'number') || flags === null)) {
            return this.rune$int$int(runes, flags)
        } else {throw new Error('invalid overload')}
    }
    static ANY_RUNE_NOT_NL_$LI$() {
 if (Compiler.ANY_RUNE_NOT_NL == null) {
        Compiler.ANY_RUNE_NOT_NL = [0, '\n'.charCodeAt(0) - 1, '\n'.charCodeAt(0) + 1, Unicode.MAX_RUNE]
    } return Compiler.ANY_RUNE_NOT_NL
}
    static ANY_RUNE_$LI$() {
 if (Compiler.ANY_RUNE == null) {
        Compiler.ANY_RUNE = [0, Unicode.MAX_RUNE]
    } return Compiler.ANY_RUNE
}
    compile(re) {
        switch ((re.op)) {
            case Regexp.Op.NO_MATCH:
                return this.fail()
            case Regexp.Op.EMPTY_MATCH:
                return this.nop()
            case Regexp.Op.LITERAL:
                if (re.runes.length === 0) {
                    return this.nop()
                } else {
                    let f = null
                    for (let index = 0; index < re.runes.length; index++) {
                        let r = re.runes[index]
                        {
                            const f1 = this.rune$int$int(r, re.flags)
                            f = (f == null) ? f1 : this.cat(f, f1)
                        }
                    }
                    return f
                }
            case Regexp.Op.CHAR_CLASS:
                return this.rune$int_A$int(re.runes, re.flags)
            case Regexp.Op.ANY_CHAR_NOT_NL:
                return this.rune$int_A$int(Compiler.ANY_RUNE_NOT_NL_$LI$(), 0)
            case Regexp.Op.ANY_CHAR:
                return this.rune$int_A$int(Compiler.ANY_RUNE_$LI$(), 0)
            case Regexp.Op.BEGIN_LINE:
                return this.empty(Utils.EMPTY_BEGIN_LINE)
            case Regexp.Op.END_LINE:
                return this.empty(Utils.EMPTY_END_LINE)
            case Regexp.Op.BEGIN_TEXT:
                return this.empty(Utils.EMPTY_BEGIN_TEXT)
            case Regexp.Op.END_TEXT:
                return this.empty(Utils.EMPTY_END_TEXT)
            case Regexp.Op.WORD_BOUNDARY:
                return this.empty(Utils.EMPTY_WORD_BOUNDARY)
            case Regexp.Op.NO_WORD_BOUNDARY:
                return this.empty(Utils.EMPTY_NO_WORD_BOUNDARY)
            case Regexp.Op.CAPTURE:
                {
                    const bra = this.cap(re.cap << 1)
                    const sub = this.compile(re.subs[0])
                    const ket = this.cap(re.cap << 1 | 1)
                    return this.cat(this.cat(bra, sub), ket)
                }

            case Regexp.Op.STAR:
                return this.star(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
            case Regexp.Op.PLUS:
                return this.plus(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
            case Regexp.Op.QUEST:
                return this.quest(this.compile(re.subs[0]), (re.flags & RE2Flags.NON_GREEDY) !== 0)
            case Regexp.Op.CONCAT:
                if (re.subs.length === 0) {
                    return this.nop()
                } else {
                    let f = null
                    for (let index = 0; index < re.subs.length; index++) {
                        let sub = re.subs[index]
                        {
                            const f1 = this.compile(sub)
                            f = (f == null) ? f1 : this.cat(f, f1)
                        }
                    }
                    return f
                }
            case Regexp.Op.ALTERNATE:
                {
                    if (re.subs.length === 0) {
                        return this.nop()
                    } else {
                        let f = null
                        for (let index = 0; index < re.subs.length; index++) {
                            let sub = re.subs[index]
                            {
                                const f1 = this.compile(sub)
                                f = (f == null) ? f1 : this.alt(f, f1)
                            }
                        }
                        return f
                    }
                }

            default:
                throw Object.defineProperty(new Error('regexp: unhandled case in compile'), '__classes', { configurable: true, value: ['java.lang.Throwable', 'java.lang.IllegalStateException', 'java.lang.Object', 'java.lang.RuntimeException', 'java.lang.Exception'] })
        }
    }
}
Compiler['__class'] = 'quickstart.Compiler';
(function(Compiler) {
    /**
     * A fragment of a compiled regular expression program.
     *
     * @see http://swtch.com/~rsc/regexp/regexp1.html
     * @class
     */
    class Frag {
        constructor(i, out, nullable) {
            if (((typeof i === 'number') || i === null) && ((typeof out === 'number') || out === null) && ((typeof nullable === 'boolean') || nullable === null)) {
                let __args = arguments
                if (this.i === undefined) {
                    this.i = 0
                }
                if (this.out === undefined) {
                    this.out = 0
                }
                if (this.nullable === undefined) {
                    this.nullable = false
                }
                this.i = i
                this.out = out
                this.nullable = nullable
            } else if (((typeof i === 'number') || i === null) && ((typeof out === 'number') || out === null) && nullable === undefined) {
                let __args = arguments
                {
                    let __args = arguments
                    let nullable = false
                    if (this.i === undefined) {
                        this.i = 0
                    }
                    if (this.out === undefined) {
                        this.out = 0
                    }
                    if (this.nullable === undefined) {
                        this.nullable = false
                    }
                    this.i = i
                    this.out = out
                    this.nullable = nullable
                }
                if (this.i === undefined) {
                    this.i = 0
                }
                if (this.out === undefined) {
                    this.out = 0
                }
                if (this.nullable === undefined) {
                    this.nullable = false
                }
            } else if (((typeof i === 'number') || i === null) && out === undefined && nullable === undefined) {
                let __args = arguments
                {
                    let __args = arguments
                    let out = 0
                    {
                        let __args = arguments
                        let nullable = false
                        if (this.i === undefined) {
                            this.i = 0
                        }
                        if (this.out === undefined) {
                            this.out = 0
                        }
                        if (this.nullable === undefined) {
                            this.nullable = false
                        }
                        this.i = i
                        this.out = out
                        this.nullable = nullable
                    }
                    if (this.i === undefined) {
                        this.i = 0
                    }
                    if (this.out === undefined) {
                        this.out = 0
                    }
                    if (this.nullable === undefined) {
                        this.nullable = false
                    }
                }
                if (this.i === undefined) {
                    this.i = 0
                }
                if (this.out === undefined) {
                    this.out = 0
                }
                if (this.nullable === undefined) {
                    this.nullable = false
                }
            } else if (i === undefined && out === undefined && nullable === undefined) {
                let __args = arguments
                {
                    let __args = arguments
                    let i = 0
                    let out = 0
                    {
                        let __args = arguments
                        let nullable = false
                        if (this.i === undefined) {
                            this.i = 0
                        }
                        if (this.out === undefined) {
                            this.out = 0
                        }
                        if (this.nullable === undefined) {
                            this.nullable = false
                        }
                        this.i = i
                        this.out = out
                        this.nullable = nullable
                    }
                    if (this.i === undefined) {
                        this.i = 0
                    }
                    if (this.out === undefined) {
                        this.out = 0
                    }
                    if (this.nullable === undefined) {
                        this.nullable = false
                    }
                }
                if (this.i === undefined) {
                    this.i = 0
                }
                if (this.out === undefined) {
                    this.out = 0
                }
                if (this.nullable === undefined) {
                    this.nullable = false
                }
            } else {throw new Error('invalid overload')}
        }
    }
    Compiler.Frag = Frag
    Frag['__class'] = 'quickstart.Compiler.Frag'
})(Compiler || (Compiler = {}))
import { Utils } from './Utils'
import { Regexp } from './Regexp'
import { Inst } from './Inst'
import { Prog } from './Prog'
