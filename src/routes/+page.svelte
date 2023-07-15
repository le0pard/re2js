<script>
	let regex = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
	let string = 'example@example.com'
	let case_insensitive_flag = false
	let dotall_flag = false
	let multiline_flag = false
	let disable_unicode_groups_flag = false
	let longest_match_flag = false
</script>

<svelte:head>
	<title>RE2JS Playground</title>
	<meta name="description" content="RE2JS Playground" />
</svelte:head>

<article class="grid">
	<div>
		<label for="regex">Regular expression</label>
		<input type="text" id="regex" name="regex" placeholder="Insert your regular expression here" bind:value={regex}>

		<label for="string">Test string</label>
		<textarea id="string" name="string" placeholder="Insert your test string here" bind:value={string}></textarea>
	</div>

	<fieldset>
		<legend>Regular expression flags</legend>
		<label for="case_insensitive_flag">
			<input type="checkbox" id="case_insensitive_flag" name="case_insensitive_flag" checked={case_insensitive_flag}>
			Case insensitive matching
		</label>
		<label for="dotall_flag">
			<input type="checkbox" id="dotall_flag" name="dotall_flag" checked={dotall_flag}>
			"." matches all characters
		</label>
		<label for="multiline_flag">
			<input type="checkbox" id="multiline_flag" name="multiline_flag" checked={multiline_flag}>
			Multiline matching
		</label>
		<label for="disable_unicode_groups_flag">
			<input type="checkbox" id="disable_unicode_groups_flag" name="disable_unicode_groups_flag" checked={disable_unicode_groups_flag}>
			Disable unicode groups
		</label>
		<label for="longest_match_flag">
			<input type="checkbox" id="longest_match_flag" name="longest_match_flag" checked={longest_match_flag}>
			Matches longest possible string
		</label>
	</fieldset>
</article>

<article>I'm a card!</article>

<style>
	textarea {
		resize: vertical;
	}
</style>
