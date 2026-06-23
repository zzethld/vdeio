<template>
  <article class="video-card">
    <div class="video-thumb">
      <div class="thumb-placeholder">
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
    <div class="video-info">
      <h3 class="video-title" :title="title">{{ title }}</h3>
      <span class="video-size">{{ size }}</span>
      <div class="video-badges">
        <slot name="badges" />
      </div>
    </div>
    <button
      class="btn-play"
      type="button"
      @click="emit('play')"
    >
      播放
    </button>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  size: string;
}>();

const emit = defineEmits<{
  play: [];
}>();
</script>

<style scoped>
.video-card {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  transition:
    transform var(--duration-normal) var(--ease-default),
    box-shadow var(--duration-normal) var(--ease-default);
}

.video-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.video-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--bg-hover);
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-icon {
  width: 40px;
  height: 40px;
  color: var(--text-tertiary);
  opacity: 0.6;
  transition: opacity var(--duration-fast) var(--ease-default);
}

.video-card:hover .play-icon {
  opacity: 1;
}

.video-info {
  padding: var(--space-3) var(--space-4) var(--space-2);
}

.video-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
  margin: 0 0 var(--space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-size {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.video-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
  min-height: 20px;
}

.btn-play {
  display: block;
  width: calc(100% - var(--space-6));
  margin: 0 var(--space-3) var(--space-3);
  padding: var(--space-2) 0;
  border: none;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--text-inverse);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background var(--duration-fast) var(--ease-default);
}

.btn-play:hover {
  background: var(--accent-hover);
}

.btn-play:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle);
}
</style>
