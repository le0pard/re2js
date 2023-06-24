// GENERATED BY make_perl_groups.pl; DO NOT EDIT.
// make_perl_groups.pl > CharGroup.js

class CharGroup {
  constructor(sign, cls) {
    this.sign = sign
    this.cls = cls
  }
}

const code1 = [ /* \d */
	0x30, 0x39
]

const code2 = [ /* \s */
	0x9, 0xd,
	0x20, 0x20
]

const code3 = [ /* \w */
	0x30, 0x39,
	0x41, 0x5a,
	0x5f, 0x5f,
	0x61, 0x7a
]

const PERL_GROUPS = new Map([
['\\d', new CharGroup(+1, code1)],
['\\D', new CharGroup(-1, code1)],
['\\s', new CharGroup(+1, code2)],
['\\S', new CharGroup(-1, code2)],
['\\w', new CharGroup(+1, code3)],
['\\W', new CharGroup(-1, code3)]
])
const code4 = [ /* [:alnum:] */
	0x30, 0x39,
	0x41, 0x5a,
	0x61, 0x7a
]

const code5 = [ /* [:alpha:] */
	0x41, 0x5a,
	0x61, 0x7a
]

const code6 = [ /* [:ascii:] */
	0x0, 0x7f
]

const code7 = [ /* [:blank:] */
	0x9, 0x9,
	0x20, 0x20
]

const code8 = [ /* [:cntrl:] */
	0x0, 0x1f,
	0x7f, 0x7f
]

const code9 = [ /* [:digit:] */
	0x30, 0x39
]

const code10 = [ /* [:graph:] */
	0x21, 0x7e
]

const code11 = [ /* [:lower:] */
	0x61, 0x7a
]

const code12 = [ /* [:print:] */
	0x20, 0x7e
]

const code13 = [ /* [:punct:] */
	0x21, 0x2f,
	0x3a, 0x40,
	0x5b, 0x60,
	0x7b, 0x7e
]

const code14 = [ /* [:space:] */
	0x9, 0xd,
	0x20, 0x20
]

const code15 = [ /* [:upper:] */
	0x41, 0x5a
]

const code16 = [ /* [:word:] */
	0x30, 0x39,
	0x41, 0x5a,
	0x5f, 0x5f,
	0x61, 0x7a
]

const code17 = [ /* [:xdigit:] */
	0x30, 0x39,
	0x41, 0x46,
	0x61, 0x66
]

const POSIX_GROUPS = new Map([
['[:alnum:]', new CharGroup(+1, code4)],
['[:^alnum:]', new CharGroup(-1, code4)],
['[:alpha:]', new CharGroup(+1, code5)],
['[:^alpha:]', new CharGroup(-1, code5)],
['[:ascii:]', new CharGroup(+1, code6)],
['[:^ascii:]', new CharGroup(-1, code6)],
['[:blank:]', new CharGroup(+1, code7)],
['[:^blank:]', new CharGroup(-1, code7)],
['[:cntrl:]', new CharGroup(+1, code8)],
['[:^cntrl:]', new CharGroup(-1, code8)],
['[:digit:]', new CharGroup(+1, code9)],
['[:^digit:]', new CharGroup(-1, code9)],
['[:graph:]', new CharGroup(+1, code10)],
['[:^graph:]', new CharGroup(-1, code10)],
['[:lower:]', new CharGroup(+1, code11)],
['[:^lower:]', new CharGroup(-1, code11)],
['[:print:]', new CharGroup(+1, code12)],
['[:^print:]', new CharGroup(-1, code12)],
['[:punct:]', new CharGroup(+1, code13)],
['[:^punct:]', new CharGroup(-1, code13)],
['[:space:]', new CharGroup(+1, code14)],
['[:^space:]', new CharGroup(-1, code14)],
['[:upper:]', new CharGroup(+1, code15)],
['[:^upper:]', new CharGroup(-1, code15)],
['[:word:]', new CharGroup(+1, code16)],
['[:^word:]', new CharGroup(-1, code16)],
['[:xdigit:]', new CharGroup(+1, code17)],
['[:^xdigit:]', new CharGroup(-1, code17)]
])

export { CharGroup, PERL_GROUPS, POSIX_GROUPS }
