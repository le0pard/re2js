<script>
  import { onMount } from 'svelte'
  import { RE2JS } from 're2js'
  import debounce from 'lodash/debounce'
  import round from 'lodash/round'

  let regex = $state('(?<name>[a-zA-Z0-9._%+-]+)@(?<domain>[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})')
  let string = $state('max.power@example.com')

  let caseInsensitiveFlag = $state(false)
  let dotallFlag = $state(false)
  let multilineFlag = $state(false)
  let disableUnicodeGroupsflag = $state(false)
  let longestMatchFlag = $state(false)

  let results = $state({})

  const execRE2JS = (regexInput, stringInput, flagsInput = 0) => {
    try {
      const start = performance.now()
      const p = RE2JS.compile(regexInput, flagsInput)
      const m = p.matcher(stringInput)
      const found = m.find()
      const end = performance.now()

      results = {
        success: true,
        time: end - start,
        matches: m.matches(),
        contains: found,
        startWith: m.lookingAt(),
        groupCount: p.groupCount(),
        namedGroups: p.namedGroups(),
        groupsResuls: found
          ? Array.from(Array(p.groupCount() + 1)).map((_, index) => m.group(index))
          : null
      }
    } catch (err) {
      results = {
        success: false,
        error: err.message.toString()
      }
    }
  }

  const execRE2JSDebounce = debounce(execRE2JS, 300)

  const { CASE_INSENSITIVE, DOTALL, MULTILINE, DISABLE_UNICODE_GROUPS, LONGEST_MATCH } = RE2JS

  $effect(() => {
    let flags = 0
    if (caseInsensitiveFlag) {
      flags = flags | CASE_INSENSITIVE
    }
    if (dotallFlag) {
      flags = flags | DOTALL
    }
    if (multilineFlag) {
      flags = flags | MULTILINE
    }
    if (disableUnicodeGroupsflag) {
      flags = flags | DISABLE_UNICODE_GROUPS
    }
    if (longestMatchFlag) {
      flags = flags | LONGEST_MATCH
    }
    // debounce result
    execRE2JSDebounce(regex, string, flags)
  })

  onMount(() => {
    globalThis.RE2JS = RE2JS // expose RE2JS to global scope
    console.log(
      '%c Feel free to try RE2JS here 😎',
      `color: light-dark(
      oklch(50% 0.15 100),
      oklch(90% 0.15 100)
    )`
    )
  })
</script>

<svelte:head>
  <title>RE2JS Playground</title>
  <meta name="description" content="RE2JS Playground" />
</svelte:head>

<article class="grid regex-block">
  <div>
    <label for="regex">Regular expression</label>
    <input
      type="text"
      id="regex"
      name="regex"
      placeholder="Insert your regular expression here"
      bind:value={regex}
      aria-invalid={results && !results.success}
    />

    <label for="string">Test string</label>
    <textarea
      class="string-input"
      id="string"
      name="string"
      placeholder="Insert your test string here"
      bind:value={string}
    ></textarea>
  </div>

  <div>
    <fieldset>
      <legend>Regular expression flags</legend>
      <label for="caseInsensitiveFlag">
        <input
          type="checkbox"
          id="caseInsensitiveFlag"
          name="caseInsensitiveFlag"
          bind:checked={caseInsensitiveFlag}
        />
        Case insensitive matching
      </label>
      <label for="dotallFlag">
        <input type="checkbox" id="dotallFlag" name="dotallFlag" bind:checked={dotallFlag} />
        "." matches all characters
      </label>
      <label for="multilineFlag">
        <input
          type="checkbox"
          id="multilineFlag"
          name="multilineFlag"
          bind:checked={multilineFlag}
        />
        Multiline matching
      </label>
      <label for="disableUnicodeGroupsflag">
        <input
          type="checkbox"
          id="disableUnicodeGroupsflag"
          name="disableUnicodeGroupsflag"
          bind:checked={disableUnicodeGroupsflag}
        />
        Disable unicode groups
      </label>
      <label for="longestMatchFlag">
        <input
          type="checkbox"
          id="longestMatchFlag"
          name="longestMatchFlag"
          bind:checked={longestMatchFlag}
        />
        Matches longest possible string
      </label>
    </fieldset>

    <a href="https://github.com/google/re2/wiki/Syntax" target="_blank" rel="noreferrer noopener">
      <small>Google RE2 Syntax Documentation</small>
    </a>
  </div>
</article>

{#if results}
  <article>
    {#if results.success}
      <table role="grid">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="key-cell">Time</td>
            <td class="val-cell">{round(results.time, 5)} ms</td>
          </tr>
          <tr>
            <td class="key-cell">Fully match regex pattern ? <small>(matches)</small></td>
            <td class="val-cell">
              <span
                class="status-tag"
                class:status-tag__yes={results.matches}
                class:status-tag__no={!results.matches}>{results.matches ? 'yes' : 'no'}</span
              >
            </td>
          </tr>
          <tr>
            <td class="key-cell">Contain regex pattern ? <small>(find)</small></td>
            <td class="val-cell">
              <span
                class="status-tag"
                class:status-tag__yes={results.contains}
                class:status-tag__no={!results.contains}>{results.contains ? 'yes' : 'no'}</span
              >
            </td>
          </tr>
          <tr>
            <td class="key-cell">Start with regex pattern ? <small>(lookingAt)</small></td>
            <td class="val-cell">
              <span
                class="status-tag"
                class:status-tag__yes={results.startWith}
                class:status-tag__no={!results.startWith}>{results.startWith ? 'yes' : 'no'}</span
              >
            </td>
          </tr>
          <tr>
            <td class="key-cell">Group Count <small>(groupCount)</small></td>
            <td class="val-cell">{results.groupCount}</td>
          </tr>
          <tr>
            <td class="key-cell">Named Groups <small>(namedGroups)</small></td>
            <td class="val-cell">
              <div class="long-text">{JSON.stringify(results.namedGroups)}</div>
            </td>
          </tr>
          <tr>
            <td class="key-cell">Groups Content <small>(group)</small></td>
            <td class="val-cell">
              {#if results.groupsResuls}
                <div class="long-text">{JSON.stringify(results.groupsResuls)}</div>
              {:else}
                <span class="status-tag status-tag__no">no match</span>
              {/if}
            </td>
          </tr>
        </tbody>
      </table>
    {:else if results.error}
      <div class="error-message">
        {results.error}
      </div>
    {/if}
  </article>
{/if}

<style>
  .string-input {
    resize: vertical;
  }

  .key-cell {
    width: 40%;
  }

  .val-cell {
    width: 60%;
  }

  .status-tag {
    color: #f0f0f0;
    text-transform: uppercase;
    letter-spacing: 0.15rem;
    padding: 3px 5px 2px 5px;
    font-size: 0.8rem;
  }

  .status-tag__yes {
    background-color: var(--pico-ins-color);
  }

  .status-tag__no {
    background-color: var(--pico-del-color);
  }

  .long-text {
    word-wrap: break-word; /* Older browsers */
    overflow-wrap: break-word; /* Modern browsers */
    word-break: break-all; /* To prevent long words from overflowing */
  }

  .error-message {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #f0f0f0;
    background-color: var(--pico-del-color);
    letter-spacing: 0.15rem;
    padding: 3px 5px 2px 5px;
    font-size: 0.8rem;
  }

  @media (width > 992px) {
    .regex-block {
      grid-template-columns: 60% 40%;
    }
  }
</style>
