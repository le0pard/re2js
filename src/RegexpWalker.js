/**
 * Walks a Regexp tree without recursion, visiting nodes in the same order a recursive walk
 * would (RE2: re2/walker-inl.h, "Helper class for traversing Regexps without recursion").
 *
 * The handler sees a node without subexpressions once, through `leaf(re)`, which returns its
 * result. Any other node is seen up to three times:
 * - `enter(re)` before its children. It returns the state kept for `re` while its children are
 *   visited; a state whose `result` is already set skips the children.
 * - `child(re, state, result, i)` after child `i` produced `result`. Setting `state.result`
 *   stops visiting the remaining children.
 * - `leave(re, state)` after the last child; it returns the result for `re`.
 *
 * Counted repetitions expand into one nesting level per copy, so the simplified tree can be
 * thousands of levels deep; recursion over it would overflow the JS stack, which has no fixed
 * relation to the parser's nesting limit. This walk keeps its frames on the heap instead.
 */
class RegexpWalker {
  static walk(root, handler) {
    const stack = []
    let re = root
    let result
    for (;;) {
      if (re.subs.length === 0) {
        result = handler.leaf(re)
      } else {
        const state = handler.enter(re)
        if (state.result === void 0) {
          stack.push({ re, state, i: 0 })
          re = re.subs[0]
          continue
        }
        result = state.result
      }

      // Hand the result to the parent, then move to the next sibling or finish the parent.
      for (;;) {
        if (stack.length === 0) {
          return result
        }
        const frame = stack[stack.length - 1]
        handler.child(frame.re, frame.state, result, frame.i)
        frame.i++
        if (frame.state.result === void 0 && frame.i < frame.re.subs.length) {
          re = frame.re.subs[frame.i]
          break
        }
        stack.pop()
        result =
          frame.state.result !== void 0 ? frame.state.result : handler.leave(frame.re, frame.state)
      }
    }
  }
}

export { RegexpWalker }
