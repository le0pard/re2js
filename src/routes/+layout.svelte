<svelte:options immutable={true} />

<script>
  import './styles.css'
  import Header from './Header.svelte'
  import GithubCorner from './GithubCorner.svelte'
</script>

<GithubCorner />
<Header />
<main class="container">
  <slot />
</main>
