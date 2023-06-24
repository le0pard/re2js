/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
export class CharGroup {
    constructor(sign, cls) {
        if (this.sign === undefined) {
            this.sign = 0
        }
        if (this.cls === undefined) {
            this.cls = null
        }
        this.sign = sign
        this.cls = cls
    }
    static __static_initialize() {
 if (!CharGroup.__static_initialized) {
        CharGroup.__static_initialized = true
        CharGroup.__static_initializer_0()
        CharGroup.__static_initializer_1()
    }
}
    static code1_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code1 == null) {
        CharGroup.code1 = [48, 57]
    } return CharGroup.code1
}
    static code2_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code2 == null) {
        CharGroup.code2 = [9, 10, 12, 13, 32, 32]
    } return CharGroup.code2
}
    static code3_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code3 == null) {
        CharGroup.code3 = [48, 57, 65, 90, 95, 95, 97, 122]
    } return CharGroup.code3
}
    static PERL_GROUPS_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.PERL_GROUPS == null) {
        CharGroup.PERL_GROUPS = ({})
    } return CharGroup.PERL_GROUPS
}
    static __static_initializer_0() {
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\d'] = new CharGroup(+1, CharGroup.code1_$LI$()));
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\D'] = new CharGroup(-1, CharGroup.code1_$LI$()));
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\s'] = new CharGroup(+1, CharGroup.code2_$LI$()));
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\S'] = new CharGroup(-1, CharGroup.code2_$LI$()));
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\w'] = new CharGroup(+1, CharGroup.code3_$LI$()));
        /* put */ (CharGroup.PERL_GROUPS_$LI$()['\\W'] = new CharGroup(-1, CharGroup.code3_$LI$()))
    }
    static code4_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code4 == null) {
        CharGroup.code4 = [48, 57, 65, 90, 97, 122]
    } return CharGroup.code4
}
    static code5_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code5 == null) {
        CharGroup.code5 = [65, 90, 97, 122]
    } return CharGroup.code5
}
    static code6_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code6 == null) {
        CharGroup.code6 = [0, 127]
    } return CharGroup.code6
}
    static code7_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code7 == null) {
        CharGroup.code7 = [9, 9, 32, 32]
    } return CharGroup.code7
}
    static code8_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code8 == null) {
        CharGroup.code8 = [0, 31, 127, 127]
    } return CharGroup.code8
}
    static code9_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code9 == null) {
        CharGroup.code9 = [48, 57]
    } return CharGroup.code9
}
    static code10_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code10 == null) {
        CharGroup.code10 = [33, 126]
    } return CharGroup.code10
}
    static code11_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code11 == null) {
        CharGroup.code11 = [97, 122]
    } return CharGroup.code11
}
    static code12_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code12 == null) {
        CharGroup.code12 = [32, 126]
    } return CharGroup.code12
}
    static code13_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code13 == null) {
        CharGroup.code13 = [33, 47, 58, 64, 91, 96, 123, 126]
    } return CharGroup.code13
}
    static code14_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code14 == null) {
        CharGroup.code14 = [9, 13, 32, 32]
    } return CharGroup.code14
}
    static code15_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code15 == null) {
        CharGroup.code15 = [65, 90]
    } return CharGroup.code15
}
    static code16_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code16 == null) {
        CharGroup.code16 = [48, 57, 65, 90, 95, 95, 97, 122]
    } return CharGroup.code16
}
    static code17_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.code17 == null) {
        CharGroup.code17 = [48, 57, 65, 70, 97, 102]
    } return CharGroup.code17
}
    static POSIX_GROUPS_$LI$() {
 CharGroup.__static_initialize(); if (CharGroup.POSIX_GROUPS == null) {
        CharGroup.POSIX_GROUPS = ({})
    } return CharGroup.POSIX_GROUPS
}
    static __static_initializer_1() {
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:alnum:]'] = new CharGroup(+1, CharGroup.code4_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^alnum:]'] = new CharGroup(-1, CharGroup.code4_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:alpha:]'] = new CharGroup(+1, CharGroup.code5_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^alpha:]'] = new CharGroup(-1, CharGroup.code5_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:ascii:]'] = new CharGroup(+1, CharGroup.code6_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^ascii:]'] = new CharGroup(-1, CharGroup.code6_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:blank:]'] = new CharGroup(+1, CharGroup.code7_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^blank:]'] = new CharGroup(-1, CharGroup.code7_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:cntrl:]'] = new CharGroup(+1, CharGroup.code8_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^cntrl:]'] = new CharGroup(-1, CharGroup.code8_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:digit:]'] = new CharGroup(+1, CharGroup.code9_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^digit:]'] = new CharGroup(-1, CharGroup.code9_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:graph:]'] = new CharGroup(+1, CharGroup.code10_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^graph:]'] = new CharGroup(-1, CharGroup.code10_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:lower:]'] = new CharGroup(+1, CharGroup.code11_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^lower:]'] = new CharGroup(-1, CharGroup.code11_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:print:]'] = new CharGroup(+1, CharGroup.code12_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^print:]'] = new CharGroup(-1, CharGroup.code12_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:punct:]'] = new CharGroup(+1, CharGroup.code13_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^punct:]'] = new CharGroup(-1, CharGroup.code13_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:space:]'] = new CharGroup(+1, CharGroup.code14_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^space:]'] = new CharGroup(-1, CharGroup.code14_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:upper:]'] = new CharGroup(+1, CharGroup.code15_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^upper:]'] = new CharGroup(-1, CharGroup.code15_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:word:]'] = new CharGroup(+1, CharGroup.code16_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^word:]'] = new CharGroup(-1, CharGroup.code16_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:xdigit:]'] = new CharGroup(+1, CharGroup.code17_$LI$()));
        /* put */ (CharGroup.POSIX_GROUPS_$LI$()['[:^xdigit:]'] = new CharGroup(-1, CharGroup.code17_$LI$()))
    }
}
CharGroup.__static_initialized = false
CharGroup['__class'] = 'quickstart.CharGroup'
CharGroup.__static_initialize()
