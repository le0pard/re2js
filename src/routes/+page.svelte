<svelte:options immutable="{true}" />

<script>
	import { RE2JS } from 're2js'
	import debounce from 'lodash/debounce'

	let regex = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
	let string = 'example@example.com'

	let case_insensitive_flag = false
	let dotall_flag = false
	let multiline_flag = false
	let disable_unicode_groups_flag = false
	let longest_match_flag = false

	let results = null

	const execRE2JS = debounce((regexInput, stringInput, flagsInput = 0) => {
		try {
			const p = RE2JS.compile(regexInput, flagsInput)
			const m = p.matcher(stringInput)
			const found = m.find()

			results = {
				success: true,
				matches: m.matches(),
				contains: found,
				group: found ? m.group() : null,
				startWith: m.lookingAt(),
				groupCount: p.groupCount(),
				namedGroups: p.namedGroups()
			}
		} catch(err) {
			results = {
				success: false,
				error: err.message
			}
		}
	}, 300)

	$: {
		let flags = 0
		if (case_insensitive_flag) {
			flags = flags | RE2JS.CASE_INSENSITIVE
		}
		if (dotall_flag) {
			flags = flags | RE2JS.DOTALL
		}
		if (multiline_flag) {
			flags = flags | RE2JS.MULTILINE
		}
		if (disable_unicode_groups_flag) {
			flags = flags | RE2JS.DISABLE_UNICODE_GROUPS
		}
		if (longest_match_flag) {
			flags = flags | RE2JS.LONGEST_MATCH
		}
		// debounce result
		execRE2JS(regex, string, flags)
	}
</script>

<svelte:head>
	<title>RE2JS Playground</title>
	<meta name="description" content="RE2JS Playground" />
</svelte:head>

<article class="grid regex-block">
	<div>
		<label for="regex">Regular expression</label>
		<input type="text" id="regex" name="regex" placeholder="Insert your regular expression here" bind:value={regex} aria-invalid={results && !results.success}>

		<label for="string">Test string</label>
		<textarea class="string-input" id="string" name="string" placeholder="Insert your test string here" bind:value={string}></textarea>
	</div>

	<div>
		<fieldset>
			<legend>Regular expression flags</legend>
			<label for="case_insensitive_flag">
				<input type="checkbox" id="case_insensitive_flag" name="case_insensitive_flag" bind:checked={case_insensitive_flag}>
				Case insensitive matching
			</label>
			<label for="dotall_flag">
				<input type="checkbox" id="dotall_flag" name="dotall_flag" bind:checked={dotall_flag}>
				"." matches all characters
			</label>
			<label for="multiline_flag">
				<input type="checkbox" id="multiline_flag" name="multiline_flag" bind:checked={multiline_flag}>
				Multiline matching
			</label>
			<label for="disable_unicode_groups_flag">
				<input type="checkbox" id="disable_unicode_groups_flag" name="disable_unicode_groups_flag" bind:checked={disable_unicode_groups_flag}>
				Disable unicode groups
			</label>
			<label for="longest_match_flag">
				<input type="checkbox" id="longest_match_flag" name="longest_match_flag" bind:checked={longest_match_flag}>
				Matches longest possible string
			</label>
		</fieldset>

		<a href="https://github.com/google/re2/wiki/Syntax" target="_blank">
			<small>Google RE2 Syntax Documentation</small>
		</a>
	</div>
</article>

{#if results}
	<article>
		<table role="grid">
			<thead>
				<tr>
					<th scope="col">Check</th>
					<th scope="col">Result</th>
				</tr>
			</thead>
			<tbody>
			{#if results.success}
				<tr>
					<td class="key-cell">Matches?</td>
					<td class="val-cell">{results.matches}</td>
				</tr>
				<tr>
					<td class="key-cell">Contains?</td>
					<td class="val-cell">{results.contains}</td>
				</tr>
				<tr>
					<td class="key-cell">Start with?</td>
					<td class="val-cell">{results.startWith}</td>
				</tr>
				<tr>
					<td class="key-cell">Group Count</td>
					<td class="val-cell">{results.groupCount}</td>
				</tr>
				<tr>
					<td class="key-cell">Named Groups</td>
					<td class="val-cell">{JSON.stringify(results.namedGroups)}</td>
				</tr>
				<tr>
					<td class="key-cell">Group Content (zero group)</td>
					<td class="val-cell">
						<div class="group-text">{results.group}</div>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="2">{results.error}</td>
				</tr>
			{/if}
			</tbody>
		</table>
	</article>
{/if}

<style>
	.string-input {
		resize: vertical;
	}

	.key-cell {
		width: 30%;
	}

	.val-cell {
		width: 70%;
	}

	.group-text {
		word-wrap: break-word;      /* Older browsers */
		overflow-wrap: break-word;  /* Modern browsers */
		word-break: break-all;      /* To prevent long words from overflowing */
	}

	@media (width > 992px) {
		.regex-block {
			grid-template-columns: 60% 40%;
		}
	}
</style>
