/* Generated from Java with JSweet 3.1.0 - http://www.jsweet.org */
/**
 * An exception thrown by the parser if the pattern was invalid.
 *
 * Following {@code java.util.regex.PatternSyntaxException}, this is an unchecked exception.
 * @param {string} error
 * @param {string} input
 * @class
 * @extends Error
 */
export class PatternSyntaxException extends Error {
    constructor(error, input) {
        if (((typeof error === 'string') || error === null) && ((typeof input === 'string') || input === null)) {
            let __args = arguments
            super('error parsing regexp: ' + error + ': `' + input + '`')
            this.message = 'error parsing regexp: ' + error + ': `' + input + '`'
            if (this.error === undefined) {
                this.error = null
            }
            if (this.input === undefined) {
                this.input = null
            }
            this.error = error
            this.input = input
        } else if (((typeof error === 'string') || error === null) && input === undefined) {
            let __args = arguments
            super('error parsing regexp: ' + error)
            this.message = 'error parsing regexp: ' + error
            if (this.error === undefined) {
                this.error = null
            }
            if (this.input === undefined) {
                this.input = null
            }
            this.error = error
            this.input = ''
        } else {throw new Error('invalid overload')}
    }
    /**
     * Retrieves the error index.
     *
     * @return {number} The approximate index in the pattern of the error, or <tt>-1</tt> if the index is not
     * known
     */
    getIndex() {
        return -1
    }
    /**
     * Retrieves the description of the error.
     *
     * @return {string} The description of the error
     */
    getDescription() {
        return this.error
    }
    /**
     * Retrieves the erroneous regular-expression pattern.
     *
     * @return {string} The erroneous pattern
     */
    getPattern() {
        return this.input
    }
}
PatternSyntaxException['__class'] = 'quickstart.PatternSyntaxException'
