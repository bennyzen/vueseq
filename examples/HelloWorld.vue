<!--
  VueSeq - Hello World
  
  A minimal example to get started.
  
  Render: npx vueseq examples/HelloWorld.vue -d 3 -o hello.mp4
-->
<script setup>
import { onMounted } from 'vue'
import gsap from 'gsap'

onMounted(() => {
  gsap.from('.logo', {
    scale: 0.9,
    opacity: 0,
    duration: 1,
    ease: 'power2.out'
  })

  gsap.from('.subtitle', {
    y: 20,
    opacity: 0,
    duration: 0.8,
    delay: 0.6,
    ease: 'power2.out'
  })
})
</script>

<template>
  <div class="scene">
    <img src="../vueseq.svg" alt="VueSeq" class="logo" />
    <p class="subtitle">Your first rendered video</p>
  </div>
</template>

<style scoped>
.scene {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
}

.logo {
  width: 400px;
  height: auto;
}

.subtitle {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.6);
  margin: 24px 0 0 0;
}
</style>
