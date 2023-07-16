<svelte:options immutable="{true}" />

<script>
	import { RE2JS } from 're2js'
	import debounce from 'lodash/debounce'
	import round from 'lodash/round'

	let regex = '(?P<name>[a-zA-Z0-9._%+-]+)@(?P<domain>[a-zA-Z0-9.-]+\\\.[a-zA-Z]{2,})'
	let string = 'max.power@example.com'

	let case_insensitive_flag = false
	let dotall_flag = false
	let multiline_flag = false
	let disable_unicode_groups_flag = false
	let longest_match_flag = false

	let results = null

	const execRE2JS = debounce((regexInput, stringInput, flagsInput = 0) => {
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
				groupsResuls: found ? Array.from(
					Array(p.groupCount() + 1)).map((_, index) => m.group(index)
				) : null
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
						<td class="key-cell">Fully match regex pattern ?</td>
						<td class="val-cell">
							<span class="status-tag" class:status-tag__yes="{results.matches}" class:status-tag__no="{!results.matches}">{results.matches ? 'yes' : 'no'}</span>
						</td>
					</tr>
					<tr>
						<td class="key-cell">Contain regex pattern ?</td>
						<td class="val-cell">
							<span class="status-tag" class:status-tag__yes="{results.contains}" class:status-tag__no="{!results.contains}">{results.contains ? 'yes' : 'no'}</span>
						</td>
					</tr>
					<tr>
						<td class="key-cell">Start with regex pattern ?</td>
						<td class="val-cell">
							<span class="status-tag" class:status-tag__yes="{results.startWith}" class:status-tag__no="{!results.startWith}">{results.startWith ? 'yes' : 'no'}</span>
						</td>
					</tr>
					<tr>
						<td class="key-cell">Group Count</td>
						<td class="val-cell">{results.groupCount}</td>
					</tr>
					<tr>
						<td class="key-cell">Named Groups</td>
						<td class="val-cell">
							<div class="long-text">{JSON.stringify(results.namedGroups)}</div>
						</td>
					</tr>
					<tr>
						<td class="key-cell">Groups Content</td>
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
		{:else}
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
		width: 30%;
	}

	.val-cell {
		width: 70%;
	}

	.status-tag {
		color: #f0f0f0;
		text-transform: uppercase;
		letter-spacing: 0.15rem;
		padding: 3px 5px 2px 5px;
		font-size: 0.8rem;
	}

	.status-tag__yes {
		background-color: var(--ins-color);
	}

	.status-tag__no {
		background-color: var(--del-color);
	}

	.long-text {
		word-wrap: break-word;      /* Older browsers */
		overflow-wrap: break-word;  /* Modern browsers */
		word-break: break-all;      /* To prevent long words from overflowing */
	}

	.error-message {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #f0f0f0;
		background-color: var(--del-color);
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
