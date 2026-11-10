// A second realm (a global environment with its own built-ins, so its objects fail instanceof
// checks against this realm's RegExp, Uint8Array, String...) is available in browsers through
// an iframe. Tests that need one are skipped elsewhere.
export const hasOtherRealm = typeof document !== 'undefined'

let iframe = null

// Evaluates |code| in the iframe's realm and returns the result.
export const evalInOtherRealm = (code) => {
  if (iframe === null) {
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
  }
  return iframe.contentWindow.eval(code)
}
