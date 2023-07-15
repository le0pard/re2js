<script>
	import Header from './Header.svelte'
	import GithubCorner from './GithubCorner.svelte'
	import './styles.css'
</script>

<div>
	<GithubCorner />
	<Header />
	<main class="container">
		<slot />
	</main>
</div>
