<script>
  import './styles.css'
  import Header from './Header.svelte'
  import GithubCorner from './GithubCorner.svelte'

  let { children } = $props()
</script>

<GithubCorner />
<Header />
<main class="container">
  {@render children?.()}
</main>
