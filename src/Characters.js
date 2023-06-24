/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * Wraps Character methods to be overridden for GWT.
 * @class
 */
export class Characters {
    constructor() {
    }
    static toLowerCase(codePoint) {
        return /* codePointAt */ String.fromCharCode.apply(null, [codePoint]).substr(0, 1).toLowerCase().charCodeAt(0)
    }
    static toUpperCase(codePoint) {
        return /* codePointAt */ String.fromCharCode.apply(null, [codePoint]).substr(0, 1).toUpperCase().charCodeAt(0)
    }
}
Characters['__class'] = 'quickstart.Characters'
