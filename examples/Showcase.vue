<!--
  VueSeq Showcase - Multi-Scene Demo
  
  A comprehensive example demonstrating:
  - Multi-scene composition with nested GSAP timelines
  - Staggered text reveals and beautiful typography
  - Concurrent animations with elegant pacing
  - Real UI component demo (showing VueSeq can render your existing components)
  
  Render: npx vueseq examples/Showcase.vue -d 24 -o showcase.mp4
-->
<script setup>
import { onMounted, ref, computed } from 'vue'
import gsap from 'gsap'

// ============================================
// SCENE 1: Title Sequence
// ============================================
const subtitle = 'Render Vue to Video'
const tagline = 'Deterministic • Beautiful • Simple'

const subtitleWords = computed(() => subtitle.split(' '))
const taglineParts = computed(() => tagline.split(' • '))

// ============================================
// SCENE 2: Philosophy
// ============================================
const philosophyLines = [
  'Powered by GSAP',
  'The animation library you already know',
  'No new APIs to learn'
]

// ============================================
// SCENE 3: Component Demo
// ============================================
const mockNotifications = ref([
  { id: 1, title: 'New message', text: 'You have 3 unread messages', icon: '💬' },
  { id: 2, title: 'Upload complete', text: 'video-export.mp4 saved', icon: '✓' },
  { id: 3, title: 'Render finished', text: 'Your video is ready', icon: '🎬' }
])

// ============================================
// MASTER TIMELINE COMPOSITION
// ============================================
onMounted(() => {
  const master = gsap.timeline()
  
  // Add scenes sequentially
  master.add(createScene1_Title())
  master.add(createScene2_Philosophy(), '-=0.5')
  master.add(createScene3_ComponentDemo(), '-=0.3')
  master.add(createScene4_Finale())
})

// ============================================
// SCENE 1: Title Reveal
// ============================================
function createScene1_Title() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  // Fade in scene
  tl.from('.scene-title', {
    opacity: 0,
    duration: 1,
    ease: 'power2.inOut'
  })

  // Top decorative line
  tl.fromTo('.line-top', 
    { scaleX: 0 },
    { scaleX: 1, duration: 1.2, ease: 'power2.inOut' },
    '-=0.5'
  )

  // Title letters stagger from center
  tl.from('.logo-img', {
    opacity: 0,
    scale: 0.8,
    y: 30,
    duration: 1.2,
    ease: 'back.out(1.2)'
  }, '-=0.3')

  // Subtle glow
  tl.to('.logo-img', {
    filter: 'drop-shadow(0 0 40px rgba(66, 184, 131, 0.4))',
    duration: 1.5,
    ease: 'power1.inOut'
  }, '-=0.5')

  // Subtitle words
  tl.from('.subtitle-word', {
    opacity: 0,
    y: 20,
    filter: 'blur(8px)',
    duration: 0.8,
    stagger: 0.15,
    ease: 'power2.out'
  }, '-=1')

  // Bottom line
  tl.fromTo('.line-bottom',
    { scaleX: 0 },
    { scaleX: 1, duration: 0.8, ease: 'power2.inOut' },
    '-=0.3'
  )

  // Tagline parts
  tl.from('.tagline-part', {
    opacity: 0,
    scale: 0.9,
    duration: 0.6,
    stagger: 0.3,
    ease: 'power2.out'
  }, '-=0.2')

  // Hold for a moment
  tl.to({}, { duration: 1.5 })

  // Fade out scene 1
  tl.to('.scene-title', {
    opacity: 0,
    scale: 0.95,
    duration: 0.8,
    ease: 'power2.inOut'
  })

  return tl
}

// ============================================
// SCENE 2: Philosophy / GSAP
// ============================================
function createScene2_Philosophy() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  // Fade in scene
  tl.fromTo('.scene-philosophy', 
    { opacity: 0 },
    { opacity: 1, duration: 0.8, ease: 'power2.inOut' }
  )

  // GSAP logo/badge animates in
  tl.from('.gsap-badge', {
    scale: 0,
    rotation: -180,
    duration: 1,
    ease: 'back.out(1.5)'
  }, '-=0.3')

  // Philosophy lines reveal one by one
  tl.from('.philosophy-line', {
    opacity: 0,
    x: -60,
    duration: 0.8,
    stagger: 0.4,
    ease: 'power2.out'
  }, '-=0.3')

  // Accent underlines draw in
  tl.from('.philosophy-accent', {
    scaleX: 0,
    duration: 0.6,
    stagger: 0.3,
    ease: 'power2.out'
  }, '-=1')

  // Hold
  tl.to({}, { duration: 2 })

  // Fade out
  tl.to('.scene-philosophy', {
    opacity: 0,
    y: -30,
    duration: 0.6,
    ease: 'power2.inOut'
  })

  return tl
}

// ============================================
// SCENE 3: Component Demo
// ============================================
function createScene3_ComponentDemo() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  // Fade in scene
  tl.fromTo('.scene-components',
    { opacity: 0 },
    { opacity: 1, duration: 0.8, ease: 'power2.inOut' }
  )

  // Section title
  tl.from('.component-heading', {
    opacity: 0,
    y: -30,
    duration: 0.6
  }, '-=0.3')

  // Browser window frames in
  tl.from('.browser-window', {
    opacity: 0,
    scale: 0.9,
    y: 40,
    duration: 0.8,
    ease: 'back.out(1.2)'
  }, '-=0.2')

  // Notifications fly in with stagger
  tl.from('.notification-item', {
    opacity: 0,
    x: 100,
    scale: 0.8,
    duration: 0.6,
    stagger: 0.25,
    ease: 'back.out(1.4)'
  }, '-=0.3')

  // Icons pop
  tl.from('.notification-icon', {
    scale: 0,
    duration: 0.4,
    stagger: 0.2,
    ease: 'back.out(2)'
  }, '-=1')

  // Hold to show the UI
  tl.to({}, { duration: 2.5 })

  // Fade out
  tl.to('.scene-components', {
    opacity: 0,
    scale: 1.02,
    duration: 0.6,
    ease: 'power2.inOut'
  })

  return tl
}

// ============================================
// SCENE 4: Finale
// ============================================
function createScene4_Finale() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

  // Fade in finale
  tl.fromTo('.scene-finale',
    { opacity: 0 },
    { opacity: 1, duration: 1, ease: 'power2.inOut' }
  )

  // CTA text reveals
  tl.from('.finale-text', {
    opacity: 0,
    y: 30,
    duration: 0.8,
    stagger: 0.3
  }, '-=0.3')

  // Command line types in effect
  tl.from('.finale-command', {
    opacity: 0,
    x: -20,
    duration: 0.6
  }, '-=0.2')

  tl.from('.command-cursor', {
    opacity: 0,
    duration: 0.1
  })

  tl.to('.command-cursor', {
    opacity: 0,
    repeat: 4,
    yoyo: true,
    duration: 0.5,
    ease: 'power1.inOut'
  })

  // Hold finale
  tl.to({}, { duration: 2 })

  return tl
}
</script>

<template>
  <div class="video-container">
    <!-- ====== SCENE 1: Title ====== -->
    <div class="scene scene-title">
      <div class="content">
        <div class="line line-top"></div>
        
        <div class="logo-container">
          <img src="../vueseq.svg" alt="VueSeq" class="logo-img" />
        </div>
        
        <p class="subtitle">
          <span 
            v-for="(word, i) in subtitleWords" 
            :key="i" 
            class="subtitle-word"
          >{{ word }}</span>
        </p>
        
        <div class="line line-bottom"></div>
        
        <p class="tagline">
          <span 
            v-for="(part, i) in taglineParts" 
            :key="i" 
            class="tagline-part"
          >{{ part }}<span v-if="i < taglineParts.length - 1" class="separator"> • </span></span>
        </p>
      </div>
    </div>

    <!-- ====== SCENE 2: Philosophy ====== -->
    <div class="scene scene-philosophy">
      <div class="content">
        <div class="gsap-badge">GSAP</div>
        
        <div class="philosophy-content">
          <div 
            v-for="(line, i) in philosophyLines" 
            :key="i" 
            class="philosophy-line"
          >
            <span class="philosophy-text">{{ line }}</span>
            <div class="philosophy-accent"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== SCENE 3: Component Demo ====== -->
    <div class="scene scene-components">
      <div class="content">
        <h2 class="component-heading">Render Your Own Components</h2>
        
        <div class="browser-window">
          <div class="browser-header">
            <div class="browser-dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <div class="browser-title">NotificationToast.vue</div>
          </div>
          <div class="browser-content">
            <div 
              v-for="notif in mockNotifications" 
              :key="notif.id" 
              class="notification-item"
            >
              <span class="notification-icon">{{ notif.icon }}</span>
              <div class="notification-body">
                <div class="notification-title">{{ notif.title }}</div>
                <div class="notification-text">{{ notif.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== SCENE 4: Finale ====== -->
    <div class="scene scene-finale">
      <div class="content">
        <p class="finale-text finale-main">Start creating your videos today</p>
        <p class="finale-text finale-sub">Showcase your application using your own components</p>
        <div class="finale-command">
          <span class="command-prompt">$</span>
          <span class="command-text">npx vueseq YourComponent.vue -d 10 -o video.mp4</span>
          <span class="command-cursor">▋</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ====== Base Styles ====== */
.video-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0a0a0f;
  overflow: hidden;
}

.scene {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

/* ====== SCENE 1: Title Styles ====== */
.scene-title {
  background: linear-gradient(160deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%);
}

.line {
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
  transform-origin: center;
}

.line-top { margin-bottom: 20px; }
.line-bottom { margin-top: 8px; margin-bottom: 20px; width: 80px; }

.logo-container {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 20px 0;
}

.logo-img {
  width: 500px;
  height: auto;
  will-change: transform, opacity, filter;
}

.subtitle {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 28px;
  font-weight: 300;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  gap: 0.4em;
  margin: 0;
  text-transform: uppercase;
}

.subtitle-word {
  display: inline-block;
  will-change: transform, opacity, filter;
}

.tagline {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  display: flex;
}

.tagline-part { display: inline-block; }
.separator { opacity: 0.3; }

/* ====== SCENE 2: Philosophy Styles ====== */
.scene-philosophy {
  background: linear-gradient(135deg, #0f1419 0%, #1a1f2e 100%);
  opacity: 0;
}

.gsap-badge {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 48px;
  font-weight: 700;
  color: #88CE02;
  background: linear-gradient(135deg, rgba(136, 206, 2, 0.15) 0%, rgba(136, 206, 2, 0.05) 100%);
  padding: 20px 50px;
  border-radius: 16px;
  border: 2px solid rgba(136, 206, 2, 0.3);
  text-shadow: 0 0 30px rgba(136, 206, 2, 0.5);
  margin-bottom: 40px;
}

.philosophy-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: flex-start;
}

.philosophy-line {
  position: relative;
}

.philosophy-text {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 36px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

.philosophy-line:first-child .philosophy-text {
  font-size: 44px;
  font-weight: 400;
  color: white;
}

.philosophy-accent {
  position: absolute;
  bottom: -8px;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #88CE02, transparent);
  transform-origin: left;
}

.philosophy-line:not(:first-child) .philosophy-accent {
  background: linear-gradient(90deg, rgba(255,255,255,0.2), transparent);
}

/* ====== SCENE 3: Component Demo Styles ====== */
.scene-components {
  background: linear-gradient(160deg, #0d1117 0%, #161b22 100%);
  opacity: 0;
}

.component-heading {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 36px;
  font-weight: 300;
  color: white;
  letter-spacing: 0.02em;
  margin: 0 0 30px 0;
}

.browser-window {
  width: 600px;
  background: #1c2128;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255,255,255,0.1);
}

.browser-header {
  background: #2d333b;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.browser-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot-red { background: #ff5f57; }
.dot-yellow { background: #febc2e; }
.dot-green { background: #28c840; }

.browser-title {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: rgba(255,255,255,0.5);
}

.browser-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #238636 0%, #1a7f37 100%);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(35, 134, 54, 0.3);
}

.notification-item:nth-child(2) {
  background: linear-gradient(135deg, #1f6feb 0%, #1958b7 100%);
  box-shadow: 0 4px 20px rgba(31, 111, 235, 0.3);
}

.notification-item:nth-child(3) {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
}

.notification-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.15);
  border-radius: 8px;
}

.notification-body {
  flex: 1;
}

.notification-title {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: white;
  margin-bottom: 2px;
}

.notification-text {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: rgba(255,255,255,0.75);
}

/* ====== SCENE 4: Finale Styles ====== */
.scene-finale {
  background: linear-gradient(160deg, #0a0a0f 0%, #1a1a2e 100%);
  opacity: 0;
}

.finale-main {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 48px;
  font-weight: 300;
  color: white;
  letter-spacing: 0.02em;
  margin: 0 0 16px 0;
}

.finale-sub {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 28px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.02em;
  margin: 0 0 40px 0;
}

.finale-command {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1a1a2a;
  padding: 20px 32px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
}

.command-prompt {
  font-family: ui-monospace, monospace;
  font-size: 20px;
  color: #42b883;
}

.command-text {
  font-family: ui-monospace, monospace;
  font-size: 20px;
  color: rgba(255,255,255,0.9);
}

.command-cursor {
  font-size: 20px;
  color: #42b883;
}
</style>
