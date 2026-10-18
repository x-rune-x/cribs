<template>
  <div class="page">
    <nav class="top" aria-label="Main">
      <NuxtLink to="/" class="link">Today</NuxtLink>
      <NuxtLink to="/practice" class="link">Practice</NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  gap: 4px;
  margin: 0 -8px;
}

.link {
  min-height: 44px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.link:hover,
.link.router-link-exact-active {
  color: var(--text);
}

.link.router-link-exact-active {
  text-decoration: underline;
  text-underline-offset: 6px;
  text-decoration-color: var(--amber);
}
</style>
